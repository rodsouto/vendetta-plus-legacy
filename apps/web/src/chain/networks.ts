// The networks the app can play on, picked at build time with VITE_NETWORK (default "local").
//
// - local: anvil started by `pnpm dev:local`, which writes public/deployment.local.json. Players are
//   anvil's development accounts, unless the deployment names a bundler (a local 4337 stack): then
//   it plays with passkeys like the testnet.
// - arbitrum-sepolia: the testnet deployment committed in deployments/arbitrum-sepolia.json; players
//   sign in with passkeys and Pimlico bundles and sponsors their operations (B-15, B-16).
import type { Address, Chain } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { anvilChain } from "./config.js";

export type NetworkId = "local" | "arbitrum-sepolia";

export interface Deployment {
  chainId: number;
  rpc: string;
  game: Address;
  directory?: Address; // PasskeyDirectory (B-15); absent on deployments that predate it
  fromBlock: number;
  /** ERC-4337 bundler; with it (and a directory) players use passkeys instead of dev accounts. */
  bundler?: string;
  /** Paymaster that sponsors the operations; the bundler's URL when it serves both (Pimlico). */
  paymaster?: string;
  /** Pimlico sponsorship policy that sets the limits (B-16); without it, the project's defaults. */
  sponsorshipPolicy?: string;
}

/** How players sign: anvil's development keys, or passkey accounts with per-device sessions. */
export type AccountMode = "dev" | "passkey";

export interface Network {
  id: NetworkId;
  chain: Chain;
  deployment: Deployment;
  accounts: AccountMode;
}

/** Why the app cannot connect, as an i18n key under `connect.` */
export type ConnectProblem = "noLocal" | "notDeployed" | "noPimlicoKey";

export const networkId = (): NetworkId =>
  (import.meta.env.VITE_NETWORK as NetworkId | undefined) ?? "local";

// Committed testnet deployments (4b.4); the glob is empty until the file exists.
const committed = import.meta.glob<Deployment>("../../../../deployments/*.json", {
  eager: true,
  import: "default",
});

export async function loadNetwork(): Promise<Network | ConnectProblem> {
  const id = networkId();
  // Isolated runs (e2e) pass the deployment at build time instead of through public/.
  const injected = import.meta.env.VITE_DEPLOYMENT as string | undefined;
  if (id === "arbitrum-sepolia") {
    const file = committed["../../../../deployments/arbitrum-sepolia.json"];
    const base = injected ? (JSON.parse(injected) as Deployment) : file;
    if (!base) return "notDeployed";
    const key = import.meta.env.VITE_PIMLICO_API_KEY as string | undefined;
    if (!key) return "noPimlicoKey";
    const pimlico = `https://api.pimlico.io/v2/${arbitrumSepolia.id}/rpc?apikey=${key}`;
    const deployment: Deployment = {
      ...base,
      rpc: (import.meta.env.VITE_RPC_URL as string | undefined) ?? base.rpc,
      bundler: pimlico,
      paymaster: pimlico,
      sponsorshipPolicy: import.meta.env.VITE_PIMLICO_POLICY_ID as string | undefined,
    };
    return { id, chain: arbitrumSepolia, deployment, accounts: "passkey" };
  }
  let deployment: Deployment | null = null;
  if (injected) deployment = JSON.parse(injected) as Deployment;
  else {
    try {
      const res = await fetch("/deployment.local.json", { cache: "no-store" });
      deployment = res.ok ? ((await res.json()) as Deployment) : null;
    } catch {
      deployment = null;
    }
  }
  if (!deployment) return "noLocal";
  const chain = anvilChain(deployment);
  const accounts: AccountMode = deployment.bundler && deployment.directory ? "passkey" : "dev";
  return { id, chain, deployment, accounts };
}
