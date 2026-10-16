// This device's session (B-15): a random key kept in the browser controls a simple 4337 account,
// which the player's account authorizes in Game to play for it until a deadline. Every game action
// goes out through it, sponsored, without a passkey prompt. The key can only play (never manage the
// account), expires, and is revoked from the account page; that is why browser storage is enough.
import type { Address, Hex, PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { ENTRY_POINT } from "./passkey.js";
import { storedSession, storeSession } from "./store.js";

export interface DeviceSession {
  key: Hex;
  /** The simple account the key controls: the address Game authorizes. */
  address: Address;
}

export const sessionAccount = (client: PublicClient, key: Hex) =>
  toSimpleSmartAccount({ client, owner: privateKeyToAccount(key), entryPoint: ENTRY_POINT });

/** This device's session for `controller`, made on first use. */
export async function deviceSession(
  client: PublicClient,
  chainId: number,
  controller: Address,
): Promise<DeviceSession> {
  const known = storedSession(chainId, controller);
  if (known) return known;
  const key = generatePrivateKey();
  const session = { key, address: (await sessionAccount(client, key)).address };
  storeSession(chainId, controller, session);
  return session;
}
