// The player's account (B-15): a Kernel smart account (v3.1, EntryPoint 0.7) whose only owner is a
// passkey. WebAuthn returns the passkey's public key only when it is created, so the account
// publishes it in the PasskeyDirectory; signing in on another device (a synced passkey) looks it up
// there and keeps only the entry the passkey actually verifies.
import { bytesToHex, concatHex, type Address, type PublicClient, type Hex } from "viem";
import {
  createWebAuthnCredential,
  entryPoint07Address,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { readContract } from "viem/actions";
import { toKernelSmartAccount } from "permissionless/accounts";
import { Base64, PublicKey, WebAuthnP256 } from "ox";
import { directoryAbi } from "../chain/abi.js";
import { NoAccountError } from "./signer.js";

/** What this device remembers about the signed-in player (public data only). */
export interface Identity {
  /** WebAuthn credential id (base64url). */
  credentialId: string;
  /** P-256 public key, x ‖ y (64 bytes). */
  publicKey: Hex;
  /** The Kernel account the passkey owns: one of the player's controllers. */
  address: Address;
  /** Known to be in the PasskeyDirectory (absent: unknown, checked before the next renewal). */
  published?: boolean;
  /** Made to join an existing account from another device (B-26), not yet added there. */
  joining?: boolean;
}

export const ENTRY_POINT = { address: entryPoint07Address, version: "0.7" } as const;
const KERNEL_VERSION = "0.3.1"; // the last Kernel with a WebAuthn validator in permissionless

/** Credential id as the directory and Kernel's WebAuthn validator key it (raw bytes). */
export const credentialBytes = (credentialId: string): Hex =>
  bytesToHex(Base64.toBytes(credentialId));

export const kernelAccount = (
  client: PublicClient,
  id: Pick<Identity, "credentialId" | "publicKey">,
) =>
  toKernelSmartAccount({
    client,
    version: KERNEL_VERSION,
    entryPoint: ENTRY_POINT,
    owners: [toWebAuthnAccount({ credential: { id: id.credentialId, publicKey: id.publicKey } })],
  });

/** A new passkey on this device and the (not yet deployed) account it owns. */
export async function createIdentity(client: PublicClient, name: string): Promise<Identity> {
  const credential = await createWebAuthnCredential({ name });
  const account = await kernelAccount(client, {
    credentialId: credential.id,
    publicKey: credential.publicKey,
  });
  return { credentialId: credential.id, publicKey: credential.publicKey, address: account.address };
}

/** The directory call that publishes the identity's passkey (sent by the account itself). */
export function publishCall(directory: Address, id: Identity) {
  const x = `0x${id.publicKey.slice(2, 66)}` as Hex;
  const y = `0x${id.publicKey.slice(66, 130)}` as Hex;
  return {
    to: directory,
    abi: directoryAbi,
    functionName: "publish",
    args: [credentialBytes(id.credentialId), x, y],
  } as const;
}

/** Whether the directory already holds the identity's entry (published by its own account). */
export async function isPublished(client: PublicClient, directory: Address, id: Identity) {
  for (const e of await lookupAll(client, directory, id.credentialId))
    if (
      e.account.toLowerCase() === id.address.toLowerCase() &&
      concatHex([e.x, e.y]) === id.publicKey
    )
      return true;
  return false;
}

async function lookupAll(client: PublicClient, directory: Address, credentialId: string) {
  const key = credentialBytes(credentialId);
  const entries: { x: Hex; y: Hex; account: Address }[] = [];
  const PAGE = 50n;
  for (let from = 0n; ; from += PAGE) {
    const page = await readContract(client, {
      address: directory,
      abi: directoryAbi,
      functionName: "lookup",
      args: [key, from, PAGE],
    });
    entries.push(...page);
    if (BigInt(page.length) < PAGE) return entries;
  }
}

/**
 * Sign in with a passkey already on this device (or synced to it): the browser lets the player pick
 * one, the directory gives its candidates, and the one whose key verifies the signature and derives
 * the published account wins.
 */
export async function signInIdentity(client: PublicClient, directory: Address): Promise<Identity> {
  const challenge = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const { metadata, signature, raw } = await WebAuthnP256.sign({ challenge });
  for (const e of await lookupAll(client, directory, raw.id)) {
    const publicKey = concatHex([e.x, e.y]);
    let valid = false;
    try {
      valid = WebAuthnP256.verify({
        challenge,
        metadata,
        signature,
        publicKey: PublicKey.from({ x: BigInt(e.x), y: BigInt(e.y) }),
      });
    } catch {
      valid = false; // not a point on the curve: a junk entry
    }
    if (!valid) continue;
    const account = await kernelAccount(client, { credentialId: raw.id, publicKey });
    if (account.address.toLowerCase() === e.account.toLowerCase())
      return { credentialId: raw.id, publicKey, address: account.address };
  }
  throw new NoAccountError();
}
