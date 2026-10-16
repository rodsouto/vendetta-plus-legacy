// The browser storage the account layer keeps its keys and markers in (JSON values; private mode
// falls back to nothing). Kept apart from the passkey stack (stack.ts), which loads on first use.
import type { Address } from "viem";
import type { Identity } from "./passkey.js";
import type { DeviceSession } from "./session.js";

export const store = {
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
export const storeSession = (chainId: number, controller: Address, s: DeviceSession | null) =>
  store.set(sessionKey(chainId, controller), s);
