// Who sends the player's transactions. The game state (state/game.tsx) only sees this interface:
// - DevSigner: anvil's development accounts, plain transactions (local only).
// - PasskeySigner: the passkey's Kernel account for account management and this device's session
//   account for every game action, both as sponsored ERC-4337 operations (B-15, B-16).
import {
  decodeErrorResult,
  decodeEventLog,
  http,
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { Clients } from "../chain/config.js";
import { devAccount } from "../chain/config.js";
import type { Network } from "../chain/networks.js";
import {
  createIdentity,
  ENTRY_POINT,
  kernelAccount,
  signInIdentity,
  type Identity,
} from "./passkey.js";
import {
  deviceSession,
  forgetSession,
  sessionAccount,
  storedIdentity,
  storedSession,
  storeIdentity,
  type DeviceSession,
} from "./session.js";

export interface Call {
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * actor: the address game actions come from (the session, or the dev account itself).
 * controller: the player's own account, for account management (a passkey prompt).
 * admin: the deployer (local workshop only).
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

const CALL_GAS_HEADROOM = 100_000n;

/** A call that reverted on chain; `errorName` is the contract's custom error when it is known. */
export class RevertedError extends Error {
  constructor(readonly errorName?: string) {
    super(errorName ?? "reverted");
  }
}

/** The custom error behind a reverted operation, from the EntryPoint's UserOperationRevertReason. */
function revertName(logs: readonly { data: Hash; topics: readonly Hash[] }[], abis: Abi[]) {
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi: entryPoint07Abi, ...log, topics: log.topics as never });
      if (ev.eventName !== "UserOperationRevertReason") continue;
      for (const abi of abis) {
        try {
          return decodeErrorResult({ abi, data: ev.args.revertReason }).errorName;
        } catch {
          /* not this contract's error */
        }
      }
    } catch {
      /* another event */
    }
  }
  return undefined;
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
    const wallet = this.clients.wallet(from === "admin" ? 0 : this.account);
    for (const c of calls) {
      const hash = await wallet.writeContract({
        ...c,
        address: c.to,
        chain: wallet.chain,
        account: wallet.account!,
      } as never);
      const receipt = await this.clients.public.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new RevertedError();
    }
  }
}

export class PasskeySigner extends Observable implements Signer {
  readonly mode = "passkey";
  identity: Identity | null;
  session: DeviceSession | null = null;
  private chainId: number;
  private pimlico;

  constructor(
    private clients: Clients,
    private network: Network,
  ) {
    super();
    this.chainId = network.deployment.chainId;
    this.identity = storedIdentity(this.chainId);
    if (this.identity) this.session = storedSession(this.chainId, this.identity.address);
    this.pimlico = createPimlicoClient({
      transport: http(network.deployment.paymaster ?? network.deployment.bundler!),
      entryPoint: ENTRY_POINT,
    });
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
    this.session = await deviceSession(this.client, this.chainId, id.address);
    this.changed();
  }

  /**
   * A new passkey; the account goes on chain with its first operation (registration, or the first
   * session once another device or a recovery code has added it: `joining`).
   */
  async create(name: string, joining = false) {
    const id = await createIdentity(this.client, name);
    await this.adopt(joining ? { ...id, joining } : id);
  }

  async signIn() {
    await this.adopt({ ...(await signInIdentity(this.client, this.directory)), published: true });
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
    if (this.identity) forgetSession(this.chainId, this.identity.address);
    storeIdentity(this.chainId, null);
    this.identity = null;
    this.session = null;
    this.changed();
  }

  private smartClient(
    account: Awaited<ReturnType<typeof kernelAccount>> | Awaited<ReturnType<typeof sessionAccount>>,
  ) {
    return createSmartAccountClient({
      account,
      chain: this.network.chain as Chain,
      client: this.client,
      bundlerTransport: http(this.network.deployment.bundler!),
      paymaster: this.pimlico,
      paymasterContext: this.network.deployment.sponsorshipPolicy
        ? { sponsorshipPolicyId: this.network.deployment.sponsorshipPolicy }
        : undefined,
      userOperation: {
        estimateFeesPerGas: async () => (await this.pimlico.getUserOperationGasPrice()).fast,
      },
    });
  }

  async send(calls: Call[], from: From) {
    if (!this.identity) throw new Error("signed out");
    if (from === "admin") throw new Error("no admin with passkeys");
    const account =
      from === "controller"
        ? await kernelAccount(this.client, this.identity)
        : await sessionAccount(this.client, from === "actor" ? this.session!.key : from.key);
    const client = this.smartClient(account);
    // With the abi, viem decodes a revert during gas estimation into the contract's error.
    const gas = await client.estimateUserOperationGas({ calls: calls as never });
    // A game action costs more the later it runs (lazy settlement, due missions processed on the
    // way, B-06/B-07), so the execution limit gets headroom. It is fixed before the paymaster
    // signs, since its signature covers the limits; unused gas is barely charged.
    const hash: Hash = await client.sendUserOperation({
      calls: calls as never,
      ...gas,
      callGasLimit: (gas.callGasLimit * 3n) / 2n + CALL_GAS_HEADROOM,
    });
    const receipt = await client.waitForUserOperationReceipt({ hash });
    if (!receipt.success)
      throw new RevertedError(
        revertName(
          receipt.logs,
          calls.map((c) => c.abi),
        ),
      );
  }
}

export const makeSigner = (clients: Clients, network: Network): DevSigner | PasskeySigner =>
  network.accounts === "dev" ? new DevSigner(clients) : new PasskeySigner(clients, network);
