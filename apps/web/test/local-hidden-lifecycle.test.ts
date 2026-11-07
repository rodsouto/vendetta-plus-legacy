import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  events: [] as string[],
  deploymentCount: 0,
  failVite: false,
  failFailureReceipt: false,
  failClosedReceipt: false,
  failKeeperStop: false,
  readinessStatus: 200,
  failProducerClose: false,
  failProducerStart: false,
  cancelAfterProducer: undefined as AbortController | undefined,
  badBinding: false,
  failRootLeaseRelease: false,
  producerKeys: [] as string[],
  anvilArgs: [] as string[],
  listenerFault: "" as "" | "missing" | "wrong-port",
  listenerChecks: 0,
  anvilStarted: false,
  rpcCalls: 0,
  transactions: 0,
  server: undefined as ReturnType<typeof createServer> | undefined,
}));
const address = (n: number) => "0x" + n.toString(16).padStart(40, "0");
vi.mock("../scripts/local-hidden/config.js", () => ({
  loadLocalStackConfig: async () => state.config,
  readArtifact: async () => ({ abi: [], bytecode: { object: "0x6000" } }),
  sha256File: async () => state.config.binarySha256,
}));
vi.mock("../scripts/state-lease.js", async (original) => {
  const module = await original<typeof import("../scripts/state-lease.js")>();
  return {
    ...module,
    acquireStateLease: async (path: string) => {
      const lease = await module.acquireStateLease(path);
      return {
        fd: lease.fd,
        release: async () => {
          await lease.release();
          if (state.failRootLeaseRelease) throw new Error("injected lease release report failure");
        },
      };
    },
  };
});
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({
    getChainId: async () => {
      state.rpcCalls++;
      return 31337;
    },
    getTransactionReceipt: async ({ hash }: { hash: string }) => ({
      blockNumber: 10n,
      status: "success",
      contractAddress: address(Number(hash) || 1),
    }),
    readContract: async () => [address(state.badBinding ? 9 : 3), address(4)],
    getBytecode: async () => "0x6000",
  }),
  createWalletClient: () => ({
    sendTransaction: async () => {
      state.transactions++;
      return "0";
    },
    deployContract: async () => String(++state.deploymentCount),
  }),
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    access: vi.fn(async (...args: Parameters<typeof fs.access>) => {
      if (String(args[0]).endsWith("/contracts/.env"))
        throw Object.assign(new Error("fixture: no dotenv"), { code: "ENOENT" });
      return fs.access(...args);
    }),
    writeFile: vi.fn(async (...args: Parameters<typeof fs.writeFile>) => {
      if (state.failClosedReceipt && String(args[0]).endsWith("/closed.json"))
        throw new Error("closed receipt disk error");
      if (state.failFailureReceipt && String(args[0]).endsWith("/failed.json"))
        throw new Error("failure receipt disk error");
      return fs.writeFile(...args);
    }),
  };
});
vi.mock("../scripts/local-hidden/processes.js", () => ({
  LocalProcesses: class {
    failure = new Promise<never>(() => {});
    check() {
      if (state.listenerFault && state.anvilStarted && state.listenerChecks++ > 0)
        throw new Error("fixture Anvil failed to bind");
    }
    fail() {}
    start(command: string, args: string[], log: string, env: NodeJS.ProcessEnv) {
      const name = log.split("/").at(-1)!;
      state.events.push("start:" + name);
      if (name === "anvil.log") {
        state.anvilArgs = args;
        state.anvilStarted = true;
      }
      writeFileSync(
        log,
        name === "keeper.log"
          ? "certificate keeper for fixture"
          : name === "anvil.log"
            ? state.listenerFault === "missing"
              ? "bind error"
              : `Listening on 127.0.0.1:${state.listenerFault === "wrong-port" ? 9999 : (state.config.ports as { rpc: number }).rpc}\n`
            : "fixture",
      );
      if (args[0] === "script") {
        const dir = join(env.FOUNDRY_BROADCAST!, "Deploy.s.sol/31337");
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, "run-latest.json"),
          JSON.stringify({
            transactions: [
              { contractName: "ERC1967Proxy", contractAddress: address(5), hash: "0x01" },
              { contractName: "PasskeyDirectory", contractAddress: address(6) },
            ],
          }),
        );
      }
      const managed = {
        name,
        finished: false,
        child: { pid: 12345 },
        closed: Promise.resolve({
          code: 0,
          signal: null,
        }),
      };
      return managed;
    }
    async stop(child: { name: string; stopped?: boolean }) {
      if (child.stopped) return;
      child.stopped = true;
      state.events.push("stop:" + child.name);
      if (state.failKeeperStop && child.name === "keeper.log")
        throw new Error("keeper stop fixture failure");
    }
    async stopAll() {
      state.events.push("stop:all");
    }
  },
}));
vi.mock("../scripts/prover/service.js", () => ({
  certificateProducer: async (config: { h3Key: string }) => {
    state.producerKeys.push(config.h3Key);
    state.events.push("producer:start");
    if (state.failProducerStart) throw new Error("injected producer startup failure");
    const server = createServer((_req, res) => {
      state.events.push("producer:readiness");
      res.writeHead(state.readinessStatus).end("{}");
    });
    state.server = server;
    state.cancelAfterProducer?.abort(new Error("fixture cancellation after producer"));
    return {
      server,
      close: async () => {
        state.events.push("producer:close");
        await new Promise<void>((r) => server.close(() => r()));
        if (state.failProducerClose) throw new Error("producer drain failed");
      },
    };
  },
}));
vi.mock("vite", () => ({
  createServer: async () => {
    if (state.failVite) throw new Error("injected Vite failure");
    return {
      middlewares: (_req: unknown, res: { end: () => void }) => res.end(),
      close: async () => {
        state.events.push("web:close");
      },
    };
  },
}));
import { startLocalHiddenStack } from "../scripts/local-hidden/stack.js";
let dir: string;
beforeEach(async () => {
  state.events = [];
  state.listenerFault = "";
  state.listenerChecks = 0;
  state.anvilStarted = false;
  state.rpcCalls = 0;
  state.transactions = 0;
  state.deploymentCount = 0;
  state.failVite = false;
  state.failFailureReceipt = false;
  state.failClosedReceipt = false;
  state.failKeeperStop = false;
  state.readinessStatus = 200;
  state.failProducerClose = false;
  state.failProducerStart = false;
  state.cancelAfterProducer = undefined;
  state.badBinding = false;
  state.failRootLeaseRelease = false;
  state.producerKeys = [];
  dir = await mkdtemp(join(tmpdir(), "vendetta-local-lifecycle-"));
  const binary = join(dir, "native");
  await writeFile(binary, "never execute");
  const socket = createNetServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const proverPort = (socket.address() as AddressInfo).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  state.config = {
    runDirectory: join(dir, "run"),
    binary,
    binarySha256: createHash("sha256").update("never execute").digest("hex"),
    ports: { rpc: 0, prover: proverPort, web: 0 },
    verifiers: {
      opening: { abi: [], bytecode: { object: "0x6000" } },
      "invalid-point": { abi: [], bytecode: { object: "0x6000" } },
    },
    openingKeys: dir,
    pointKeys: dir,
    forge: "fixture-forge",
    anvil: "fixture-anvil",
  };
});
afterEach(async () => {
  state.server?.closeAllConnections();
  if (state.server?.listening) await new Promise<void>((r) => state.server!.close(() => r()));
  await rm(dir, { recursive: true, force: true });
});
it("orders shutdown keeper, producer, web, then chain and is idempotent", async () => {
  const stack = await startLocalHiddenStack("fixture", join(dir, "run"));
  expect(state.events.indexOf("producer:readiness")).toBeLessThan(
    state.events.indexOf("start:keeper.log"),
  );
  const first = stack.close();
  expect(stack.close()).toBe(first);
  await first;
  expect(state.events.filter((e) => e.startsWith("stop:") || e.endsWith(":close"))).toEqual([
    "stop:keeper.log",
    "producer:close",
    "web:close",
    "stop:anvil.log",
    "stop:all",
  ]);
  expect(JSON.parse(await readFile(join(dir, "run/closed.json"), "utf8"))).toMatchObject({
    cleanupErrors: 0,
  });
});
it("cleans up all started services even when writing the startup failure receipt fails", async () => {
  state.failVite = true;
  state.failFailureReceipt = true;
  await expect(startLocalHiddenStack("fixture", join(dir, "run"))).rejects.toMatchObject({
    message: "Local stack startup failed",
    errors: expect.arrayContaining([
      expect.objectContaining({ message: "failure receipt disk error" }),
    ]),
  });
  expect(state.events).toContain("producer:close");

  expect(state.events).toContain("stop:keeper.log");
  expect(state.events).toContain("stop:anvil.log");
  expect(state.server?.listening).toBe(false);
});

it("rejects authentication readiness before starting the keeper", async () => {
  state.readinessStatus = 401;
  await expect(startLocalHiddenStack("fixture", join(dir, "run"))).rejects.toThrow(
    "authenticated readiness failed",
  );
  expect(state.events).not.toContain("start:keeper.log");
  expect(state.events).toContain("producer:close");
});
it("records the failure reason and attempts later cleanup after keeper stop fails", async () => {
  const stack = await startLocalHiddenStack("fixture", join(dir, "run"));
  state.failKeeperStop = true;
  await expect(stack.close(new Error("runtime failure fixture"))).rejects.toThrow("cleanup failed");
  expect(state.events).toContain("web:close");
  expect(state.events).toContain("stop:anvil.log");
  expect(JSON.parse(await readFile(join(dir, "run/closed.json"), "utf8"))).toMatchObject({
    reason: "runtime failure fixture",
    cleanupErrors: 1,
  });
});
it("preserves both a cleanup failure and a closed receipt failure", async () => {
  const stack = await startLocalHiddenStack("fixture", join(dir, "run"));
  state.failKeeperStop = true;
  state.failClosedReceipt = true;
  await expect(stack.close()).rejects.toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({ message: "keeper stop fixture failure" }),
      expect.objectContaining({ message: "closed receipt disk error" }),
    ]),
  });
  expect(state.events).toContain("stop:anvil.log");
});

it("leaves diagnostics but no reusable chain, snapshot or service identity after close", async () => {
  const stack = await startLocalHiddenStack("fixture", join(dir, "run"));
  expect(stack.summary.ephemeral).toBe(true);
  expect(state.anvilArgs).not.toEqual(expect.arrayContaining(["--dump-state"]));
  expect(state.anvilArgs).not.toEqual(expect.arrayContaining(["--load-state"]));
  const key = state.producerKeys[0]!;
  await stack.close();
  const files = await readdir(join(dir, "run"));
  expect(files).toContain("closed.json");
  expect(files).not.toContain("session.json");
  expect(files.some((name) => /checkpoint|chain-state|attempt-/.test(name))).toBe(false);
  for (const name of ["stack.json", "closed.json", "inputs.json", "producer-clients.json"])
    expect(await readFile(join(dir, "run", name), "utf8")).not.toContain(key);
  const previous = await readFile(join(dir, "run", "closed.json"), "utf8");
  await expect(startLocalHiddenStack("fixture", join(dir, "run"))).rejects.toMatchObject({
    code: "EEXIST",
  });
  expect(await readFile(join(dir, "run", "closed.json"), "utf8")).toBe(previous);
});
it("creates new signer identities for a new world after a failed session", async () => {
  state.failVite = true;
  await expect(startLocalHiddenStack("fixture", join(dir, "failed"))).rejects.toThrow(
    "injected Vite failure",
  );
  state.failVite = false;
  state.config = { ...state.config, runDirectory: join(dir, "new") };
  state.deploymentCount = 0; // The next fixture represents an independent fresh chain.
  const stack = await startLocalHiddenStack("fixture", join(dir, "new"));
  await stack.close();
  expect(state.producerKeys).toHaveLength(2);
  expect(state.producerKeys[0]).not.toBe(state.producerKeys[1]);
});
it("still stops the chain and releases the root lease when the producer cannot close", async () => {
  const stack = await startLocalHiddenStack("fixture", join(dir, "run"));
  state.failProducerClose = true;
  state.failRootLeaseRelease = true;
  await expect(stack.close()).rejects.toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({ message: "producer drain failed" }),
      expect.objectContaining({ message: "injected lease release report failure" }),
    ]),
  });
  expect(state.events).toContain("stop:anvil.log");
});
it("rejects invalid consumer bindings before starting the producer", async () => {
  state.badBinding = true;
  await expect(startLocalHiddenStack("fixture", join(dir, "run"))).rejects.toThrow(
    "binding mismatch",
  );
  expect(state.events).not.toContain("producer:start");
  expect(state.events).toContain("stop:anvil.log");
});

it("closes a constructed producer when startup is cancelled before its listener", async () => {
  const abort = new AbortController();
  state.cancelAfterProducer = abort;
  const failure = await startLocalHiddenStack("fixture", join(dir, "run"), abort.signal).catch(
    (error: unknown) => error,
  );
  expect(failure).toBe(abort.signal.reason);
  expect(state.events).toContain("producer:close");
  expect(state.events).toContain("stop:anvil.log");
  expect(state.events).not.toContain("start:keeper.log");
});
it("keeps constructor failure intact and closes started children", async () => {
  state.failProducerStart = true;
  await expect(startLocalHiddenStack("fixture", join(dir, "run"))).rejects.toThrow(
    "injected producer startup failure",
  );
  expect(state.events).toContain("stop:anvil.log");
  expect(state.events).not.toContain("start:keeper.log");
});

it.each(["missing", "wrong-port"] as const)(
  "rejects an owned Anvil with a %s listener before any chain request",
  async (fault) => {
    state.listenerFault = fault;
    await expect(startLocalHiddenStack("fixture", join(dir, "run"))).rejects.toThrow(
      "failed to bind",
    );
    expect(state.rpcCalls).toBe(0);
    expect(state.transactions).toBe(0);
    expect(state.deploymentCount).toBe(0);
    expect(state.events).toContain("stop:anvil.log");
  },
);
