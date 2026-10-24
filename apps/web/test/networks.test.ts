import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNetwork, type Deployment, type Network } from "../src/chain/networks.js";
import { operationBundler } from "../src/account/stack.js";
import { gameCall } from "../src/state/backlog.js";
import { gnosis } from "viem/chains";

const deployment: Deployment = {
  chainId: 100,
  rpc: "https://read.test",
  game: "0x0000000000000000000000000000000000000001",
  directory: "0x0000000000000000000000000000000000000002",
  fromBlock: 10,
};
function production() {
  vi.stubEnv("VITE_NETWORK", "gnosis");
  vi.stubEnv("VITE_DEPLOYMENT", JSON.stringify(deployment));
  vi.stubEnv("VITE_PIMLICO_API_KEY", "test-key");
  vi.stubEnv("VITE_PIMLICO_POLICY_ID", "sp_test");
  vi.stubEnv("VITE_REVEAL_BUNDLER_URL", "https://private-bundler.test");
  vi.stubEnv("VITE_RPC_URL", "");
}
afterEach(() => vi.unstubAllEnvs());

describe("Gnosis configuration", () => {
  it("uses chain 100 and Pimlico sponsorship, preserving the separate reveal route", async () => {
    production();
    const network = await loadNetwork();
    expect(typeof network).toBe("object");
    const n = network as Network;
    expect(n.chain.id).toBe(100);
    expect(n.chain.nativeCurrency.symbol).toBe("XDAI");
    expect(n.accounts).toBe("passkey");
    expect(n.deployment.bundler).toBe("https://api.pimlico.io/v2/100/rpc?apikey=test-key");
    expect(n.deployment.paymaster).toBe(n.deployment.bundler);
    expect(n.deployment.revealBundler).toBe("https://private-bundler.test");
    expect(n.deployment.sponsorshipPolicy).toBe("sp_test");
    expect(n.deployment.rpc).toBe(deployment.rpc);
  });
  it("rejects a deployment from the old production chain", async () => {
    production();
    vi.stubEnv("VITE_DEPLOYMENT", JSON.stringify({ ...deployment, chainId: 42161 }));
    expect(await loadNetwork()).toBe("invalidDeployment");
  });
  it("does not open the city without a private reveal submission path", async () => {
    production();
    vi.stubEnv("VITE_REVEAL_BUNDLER_URL", "");
    expect(await loadNetwork()).toBe("noPrivateReveal");
  });
  it("rejects an obsolete build target instead of falling through to local", async () => {
    production();
    vi.stubEnv("VITE_NETWORK", "arbitrum");
    expect(await loadNetwork()).toBe("invalidDeployment");
  });
  it("keeps isolated local passkey stacks independent of production providers", async () => {
    production();
    vi.stubEnv("VITE_NETWORK", "local");
    vi.stubEnv(
      "VITE_DEPLOYMENT",
      JSON.stringify({ ...deployment, chainId: 31337, bundler: "http://localhost:8591" }),
    );
    vi.stubEnv("VITE_REVEAL_BUNDLER_URL", "");
    const n = (await loadNetwork()) as Network;
    expect(n.chain.id).toBe(31337);
    expect(n.accounts).toBe("passkey");
  });
});

describe("private reveal routing", () => {
  const network: Network = {
    id: "gnosis",
    chain: gnosis,
    accounts: "passkey",
    deployment: {
      ...deployment,
      bundler: "https://ordinary.test",
      revealBundler: "https://private.test",
    },
  };
  it("sends the whole operation privately when a reveal is in its prefix", () => {
    expect(
      operationBundler(network, [
        gameCall(deployment.game, "advance", [1n]),
        gameCall(deployment.game, "reveal", [1n, 1, [1n, 1n, 2n], "0x"]),
        gameCall(deployment.game, "queueRoom", [1n, 2n]),
      ]),
    ).toBe("https://private.test");
  });
  it("keeps ordinary orders on the sponsored bundler", () => {
    expect(operationBundler(network, [gameCall(deployment.game, "queueRoom", [1n, 2n])])).toBe(
      "https://ordinary.test",
    );
  });
  it("fails closed rather than falling back to public submission for a reveal", () => {
    const n = { ...network, deployment: { ...network.deployment, revealBundler: undefined } };
    expect(() => operationBundler(n, [gameCall(deployment.game, "reveal", [])])).toThrow(
      "Private reveal",
    );
  });
});
