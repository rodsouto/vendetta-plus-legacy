// Chain clients for a deployment (see networks.ts for where deployments come from).
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Deployment } from "./networks.js";

export type { Deployment } from "./networks.js";

/**
 * Anvil's well-known development keys (never use them anywhere else). Account 0 is the admin that
 * deployed the game.
 */
export const DEV_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
] as const;

export const devAccount = (i: number) => privateKeyToAccount(DEV_KEYS[i]!);

export interface Clients {
  deployment: Deployment;
  chain: Chain;
  public: PublicClient;
  /** Development accounts only (local anvil). */
  wallet: (account: number) => WalletClient;
}

export const anvilChain = (deployment: Deployment) =>
  defineChain({
    id: deployment.chainId,
    name: "Anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpc] } },
  });

export function makeClients(
  deployment: Deployment,
  chain: Chain = anvilChain(deployment),
): Clients {
  const transport = http(deployment.rpc, { batch: true });
  return {
    deployment,
    chain,
    public: createPublicClient({ chain, transport }),
    wallet: (account) => createWalletClient({ chain, transport, account: devAccount(account) }),
  };
}
