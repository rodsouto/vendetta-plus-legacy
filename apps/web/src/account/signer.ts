// Who sends the player's transactions. The game state (state/game.tsx) only sees this interface:
// - DevSigner: anvil's development accounts, plain transactions (local only).
// - PasskeySigner: the passkey's Kernel account for account management and this device's session
//   account for every game action, both as sponsored ERC-4337 operations (B-15, B-16). The passkey
//   stack (stack.ts: permissionless, ox) loads on its first use, not with the app.
import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import type { Abi, Address, Hex, PublicClient } from "viem";
import type { Clients } from "../chain/config.js";
import { devAccount } from "../chain/config.js";
import type { Network } from "../chain/networks.js";
import type { Identity } from "./passkey.js";
import type { DeviceSession } from "./session.js";
import { storedIdentity, storedSession, storeIdentity, storeSession } from "./store.js";

const stack = () => import("./stack.js");

export interface Call {
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * actor: the address game actions come from (the session, or the dev account itself).
 * controller: the player's own account, for account management (a passkey prompt).
 * admin: the deployer, anvil's first account (local workshop only).
 * { key }: the simple account of a recovery code's key (B-26), another controller.
 */
export type From = "actor" | "controller" | "admin" | { key: Hex };

export interface Signer {
  readonly mode: Network["accounts"];
  /** The account that owns the player; null when signed out. */
  readonly controller: Address | null;
  /** The address game actions are sent from; null when signed out. */
  readonly actor: Address | null;
  /** Sends the calls (in one operation when possible) and waits for them; throws on a revert. */
  send(calls: Call[], from: From): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** Bumped on every change, for useSyncExternalStore. */
  readonly version: number;
}

abstract class Observable {
  version = 0;
  private listeners = new Set<() => void>();
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  protected changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

/** No account in the directory matches the passkey the player picked. */
export class NoAccountError extends Error {
  constructor() {
    super("No account for this passkey");
  }
}

/**
 * A call that reverted, on chain or at its gas estimate; `errorName` is the contract's custom
 * error when it is known. `failed` is the index of the call that reverted when the calls went one
 * by one (a dev account): the ones before it landed. Undefined for an operation that reverts as a
 * whole.
 */
export class RevertedError extends Error {
  constructor(
    readonly errorName?: string,
    readonly failed?: number,
    options?: ErrorOptions,
  ) {
    super(errorName ?? "reverted", options);
  }
}

/**
 * The revert data in a viem error, wherever the chain of causes keeps it: a RawContractError on a
 * simulation, or the RPC error itself (`data: "0x…"`) when a mined transaction is replayed with
 * `call` (CallExecutionError → ExecutionRevertedError → RpcRequestError). Undefined without one.
 */
export function revertData(e: unknown): Hex | undefined {
  for (let x: unknown = e; x; x = (x as { cause?: unknown }).cause) {
    const data = (x as { data?: unknown }).data;
    const hex = typeof data === "string" ? data : (data as { data?: unknown } | undefined)?.data;
    if (typeof hex === "string" && hex.startsWith("0x") && hex !== "0x") return hex as Hex;
  }
  return undefined;
}

/**
 * The custom error a mined transaction reverted with, replayed at its own block: anvil mines one
 * transaction per block, so that is the state and the timestamp it ran with. A mission coming due
 * between the gas estimate and the block makes a drained action revert with Backlog (B-08), and
 * the client retries with advance() only when it can name the error.
 */
export async function revertName(clients: Clients, hash: Hex, block: bigint, abi: Abi) {
  try {
    const tx = await clients.public.getTransaction({ hash });
    await clients.public.call({
      to: tx.to!,
      data: tx.input,
      account: tx.from,
      gas: tx.gas,
      blockNumber: block,
    });
  } catch (e) {
    const hex = revertData(e);
    if (hex) {
      try {
        return decodeErrorResult({ abi, data: hex }).errorName;
      } catch {
        /* not one of the game's errors */
      }
    }
  }
  return undefined;
}

/** Sends the calls one by one as plain transactions from a development account (local only). */
async function sendPlain(clients: Clients, account: number, calls: Call[]) {
  const wallet = clients.wallet(account);
  for (const [i, c] of calls.entries()) {
    let hash: Hex;
    try {
      hash = await wallet.writeContract({
        ...c,
        address: c.to,
        chain: wallet.chain,
        account: wallet.account!,
      } as never);
    } catch (e) {
      // Rejected at its gas estimate, never sent: the calls before it landed all the same.
      const revert =
        e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError);
      if (!(revert instanceof ContractFunctionRevertedError)) throw e;
      throw new RevertedError(revert.data?.errorName, i, { cause: e });
    }
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new RevertedError(await revertName(clients, hash, receipt.blockNumber, c.abi), i);
    }
  }
}

export class DevSigner extends Observable implements Signer {
  readonly mode = "dev";
  account: number;

  constructor(private clients: Clients) {
    super();
    let stored = 1;
    try {
      stored = Number(localStorage.getItem("devAccount") ?? "1");
    } catch {
      /* private mode */
    }
    this.account = stored;
  }

  get controller() {
    return devAccount(this.account).address;
  }
  get actor() {
    return this.controller;
  }

  use(account: number) {
    this.account = account;
    try {
      localStorage.setItem("devAccount", String(account));
    } catch {
      /* private mode */
    }
    this.changed();
  }

  async send(calls: Call[], from: From) {
    if (typeof from === "object") throw new Error("no recovery codes with dev accounts");
    await sendPlain(this.clients, from === "admin" ? 0 : this.account, calls);
  }
}

export class PasskeySigner extends Observable implements Signer {
  readonly mode = "passkey";
  identity: Identity | null;
  session: DeviceSession | null = null;
  private chainId: number;

  constructor(
    private clients: Clients,
    private network: Network,
  ) {
    super();
    this.chainId = network.deployment.chainId;
    this.identity = storedIdentity(this.chainId);
    if (this.identity) this.session = storedSession(this.chainId, this.identity.address);
  }

  get controller() {
    return this.identity?.address ?? null;
  }
  get actor() {
    return this.session?.address ?? null;
  }
  get directory() {
    return this.network.deployment.directory!;
  }

  private get client() {
    return this.clients.public as PublicClient;
  }

  private async adopt(id: Identity) {
    this.identity = id;
    storeIdentity(this.chainId, id);
    this.session = await (await stack()).deviceSession(this.client, this.chainId, id.address);
    this.changed();
  }

  /**
   * A new passkey; the account goes on chain with its first operation (registration, or the first
   * session once another device or a recovery code has added it: `joining`).
   */
  async create(name: string, joining = false) {
    const id = await (await stack()).createIdentity(this.client, name);
    await this.adopt(joining ? { ...id, joining } : id);
  }

  async signIn() {
    const id = await (await stack()).signInIdentity(this.client, this.directory);
    await this.adopt({ ...id, published: true });
  }

  /** The passkey is in the directory and the account is a controller: nothing pending. */
  settled() {
    if (!this.identity || (this.identity.published && !this.identity.joining)) return;
    this.identity = { ...this.identity, published: true, joining: undefined };
    storeIdentity(this.chainId, this.identity);
    this.changed();
  }

  /** Forgets the player on this device (the passkey and the account stay). */
  signOut() {
    if (this.identity) storeSession(this.chainId, this.identity.address, null);
    storeIdentity(this.chainId, null);
    this.identity = null;
    this.session = null;
    this.changed();
  }

  async send(calls: Call[], from: From) {
    // The local 4337 stack deploys with anvil's first account, so the workshop's admin stays it.
    if (from === "admin") {
      if (this.network.id !== "local") throw new Error("no admin with passkeys");
      return sendPlain(this.clients, 0, calls);
    }
    if (!this.identity) throw new Error("signed out");
    const key = from === "actor" ? this.session!.key : typeof from === "object" ? from.key : null;
    const { sendOperation } = await stack();
    await sendOperation(
      this.client,
      this.network,
      key ? { key } : { identity: this.identity },
      calls,
    );
  }
}

export const makeSigner = (clients: Clients, network: Network): DevSigner | PasskeySigner =>
  network.accounts === "dev" ? new DevSigner(clients) : new PasskeySigner(clients, network);
