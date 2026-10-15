// This device's session (B-15): a random key kept in the browser controls a simple 4337 account,
// which the player's account authorizes in Game to play for it until a deadline. Every game action
// goes out through it, sponsored, without a passkey prompt. The key can only play (never manage the
// account), expires, and is revoked from the account page; that is why browser storage is enough.
import type { Address, Hex, PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { ENTRY_POINT, type Identity } from "./passkey.js";

export interface DeviceSession {
  key: Hex;
  /** The simple account the key controls: the address Game authorizes. */
  address: Address;
}

export const storeGet = <T>(name: string) => store.get<T>(name);
export const storeSet = (name: string, value: unknown) => store.set(name, value);

const store = {
  get<T>(name: string): T | null {
    try {
      const raw = localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(name: string, value: unknown) {
    try {
      if (value === null) localStorage.removeItem(name);
      else localStorage.setItem(name, JSON.stringify(value));
    } catch {
      /* private mode: lasts until the tab closes */
    }
  },
};

const identityKey = (chainId: number) => `vendetta.identity.${chainId}`;
const sessionKey = (chainId: number, controller: Address) =>
  `vendetta.session.${chainId}.${controller.toLowerCase()}`;

export const storedIdentity = (chainId: number) => store.get<Identity>(identityKey(chainId));
export const storeIdentity = (chainId: number, id: Identity | null) =>
  store.set(identityKey(chainId), id);

export const storedSession = (chainId: number, controller: Address) =>
  store.get<DeviceSession>(sessionKey(chainId, controller));
export const forgetSession = (chainId: number, controller: Address) =>
  store.set(sessionKey(chainId, controller), null);

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
  store.set(sessionKey(chainId, controller), session);
  return session;
}
