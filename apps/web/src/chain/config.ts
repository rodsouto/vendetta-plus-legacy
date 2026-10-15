// Chain connection. Local development reads public/deployment.local.json, written by
// `pnpm dev:local` (scripts/dev-local.sh) after deploying to anvil.
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface Deployment {
  chainId: number;
  rpc: string;
  game: Address;
  directory?: Address; // PasskeyDirectory (B-15); absent on deployments that predate it
  fromBlock: number;
}

export async function loadDeployment(): Promise<Deployment | null> {
  // Isolated runs (e2e) pass the deployment at build time instead of through public/.
  const injected = import.meta.env.VITE_DEPLOYMENT as string | undefined;
  if (injected) return JSON.parse(injected) as Deployment;
  try {
    const res = await fetch("/deployment.local.json", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Deployment) : null;
  } catch {
    return null;
  }
}

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
] as const;

export const devAccount = (i: number) => privateKeyToAccount(DEV_KEYS[i]!);

export interface Clients {
  deployment: Deployment;
  public: PublicClient;
  wallet: (account: number) => WalletClient;
}

export function makeClients(deployment: Deployment): Clients {
  const chain = defineChain({
    id: deployment.chainId,
    name: "Anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpc] } },
  });
  const transport = http(deployment.rpc, { batch: true });
  return {
    deployment,
    public: createPublicClient({ chain, transport }),
    wallet: (account) => createWalletClient({ chain, transport, account: devAccount(account) }),
  };
}
