import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { keccak256, type Address, type Hex } from "viem";

const mock = vi.hoisted(() => ({
  chain: vi.fn(),
  contract: vi.fn(),
  bytecode: vi.fn(),
  close: vi.fn(),
  constructor: vi.fn(),
  leaseReleaseError: undefined as Error | undefined,
  drainError: undefined as Error | undefined,
}));
vi.mock("../scripts/state-lease.js", async (original) => {
  const module = await original<typeof import("../scripts/state-lease.js")>();
  return {
    ...module,
    acquireStateLease: async (directory: string) => {
      const lease = await module.acquireStateLease(directory);
      return {
        fd: lease.fd,
        release: async () => {
          await lease.release();
          if (mock.leaseReleaseError) throw mock.leaseReleaseError;
        },
      };
    },
  };
});
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({
    getChainId: mock.chain,
    readContract: mock.contract,
    getBytecode: mock.bytecode,
  }),
  createWalletClient: () => ({
    account: { address: "0x1111111111111111111111111111111111111111" },
  }),
}));
vi.mock("../scripts/prover/jobs.js", async (original) => {
  const module = await original<typeof import("../scripts/prover/jobs.js")>();
  return {
    ...module,
    serialQueue: <T>(capacity: number) => {
      const queue = module.serialQueue<T>(capacity);
      const drain = queue.drain;
      return Object.assign(queue, {
        drain: async () => {
          await drain();
          if (mock.drainError) throw mock.drainError;
        },
      });
    },
  };
});
vi.mock("../scripts/prover/worker.js", () => ({
  ProducerWorker: class {
    constructor(config: unknown) {
      mock.constructor(config);
    }
    close = mock.close;
  },
}));
import { certificateProducer } from "../scripts/prover/service.js";

let dir: string;
let producer: Awaited<ReturnType<typeof certificateProducer>> | undefined;
const address = "0x1111111111111111111111111111111111111111" as Address;
beforeEach(async () => {
  vi.clearAllMocks();
  mock.leaseReleaseError = undefined;
  mock.drainError = undefined;
  dir = await mkdtemp(join(tmpdir(), "vendetta-service-test-"));
  mock.chain.mockResolvedValue(1337);
  mock.contract.mockImplementation(async ({ functionName }: { functionName: string }) =>
    functionName === "hiddenConsumers" ? [address, address] : address,
  );
  mock.bytecode.mockResolvedValue("0x00");
  mock.close.mockResolvedValue(undefined);
  const hashes: Record<string, unknown> = {};
  for (const kind of ["opening", "invalid-point"]) {
    await mkdir(join(dir, kind));
    const manifest = JSON.stringify({
      kind,
      profile: "VENDETTA_OPENING_V2",
      unsafeLocalSetup: true,
    });
    await writeFile(join(dir, kind, "manifest.json"), manifest);
    hashes[kind] = {
      runtime: keccak256("0x00"),
      setup: createHash("sha256").update(manifest).digest("hex"),
    };
  }
  await writeFile(join(dir, "verifier-runtime.json"), JSON.stringify(hashes));
});
afterEach(async () => {
  await producer?.close();
  producer = undefined;
  await rm(dir, { recursive: true, force: true });
});
async function start(runtimeFile?: string, nativeEnv?: NodeJS.ProcessEnv) {
  producer = await certificateProducer({
    clients: [
      {
        token: "service-test-token-0000000000000000",
        scopes: ["prove"],
        requestsPerMinute: 100,
        maxConcurrent: 4,
      },
    ],
    rpc: "http://127.0.0.1:1",
    chainId: 1337,
    game: address,
    binary: "unused",
    openingKeys: join(dir, "opening"),
    pointKeys: join(dir, "invalid-point"),
    cache: join(dir, "cache"),
    runtimeFile,
    nativeEnv,
    h3Key: ("0x" + "11".repeat(32)) as Hex,
    allowUnsafeLocalSetup: true,
  });
  return producer;
}
it.each(["opening", "invalid-point"])(
  "rejects self-declared secure %s keys before constructing a worker or reading consumers",
  async (kind) => {
    await writeFile(
      join(dir, kind, "manifest.json"),
      JSON.stringify({ kind, profile: "VENDETTA_OPENING_V2", unsafeLocalSetup: false }),
    );
    await expect(start()).rejects.toThrow(
      "Secure setup provenance verification is not implemented",
    );
    expect(mock.constructor).not.toHaveBeenCalled();
    expect(mock.contract).not.toHaveBeenCalled();
  },
);
it("closes before listen, releases the worker once and is idempotent", async () => {
  const service = await start();
  const first = service.close();
  expect(service.close()).toBe(first);
  await first;
  expect(mock.close).toHaveBeenCalledTimes(1);
});
it("rejects a second service before RPC/worker startup and allows restart after close", async () => {
  const first = await start();
  await expect(start()).rejects.toThrow("already in use");
  expect(mock.chain).toHaveBeenCalledTimes(1);
  expect(mock.constructor).toHaveBeenCalledTimes(1);
  await first.close();
  await start();
  expect(mock.constructor).toHaveBeenCalledTimes(2);
});
it("releases ownership after a startup failure", async () => {
  mock.chain.mockRejectedValueOnce(new Error("RPC offline"));
  await expect(start()).rejects.toThrow("RPC offline");
  await start();
});
it("waits for an in-flight RPC, rejects queued work and drains before shutdown resolves", async () => {
  const service = await start();
  await new Promise<void>((done) => service.server.listen(0, "127.0.0.1", done));
  const info = service.server.address();
  if (!info || typeof info === "string") throw new Error("Missing listener");
  let release!: () => void;
  mock.chain.mockImplementationOnce(
    () =>
      new Promise<number>((done) => {
        release = () => done(1337);
      }),
  );
  const request = (mission: string) =>
    fetch(`http://127.0.0.1:${info.port}/`, {
      method: "POST",
      headers: { Authorization: "Bearer service-test-token-0000000000000000" },
      body: JSON.stringify({ mission }),
    }).catch(() => undefined);
  const first = request("1");
  await vi.waitFor(() => expect(mock.chain).toHaveBeenCalledTimes(2));
  const second = request("2");
  await vi.waitFor(() => expect(service.stats().queue.pending).toBe(2));
  let finished = false;
  const closed = service.close().then(() => {
    finished = true;
  });
  await vi.waitFor(() => expect(mock.close).toHaveBeenCalledTimes(1));
  expect(finished).toBe(false);
  await expect(start()).rejects.toThrow("already in use");
  release();
  await closed;
  await Promise.all([first, second]);
  expect(service.stats().queue.pending).toBe(0);
  expect(mock.chain).toHaveBeenCalledTimes(2); // queued job never touches the RPC
});
it("also releases the worker when an embedding caller closes the server", async () => {
  const service = await start();
  await new Promise<void>((done) => service.server.listen(0, "127.0.0.1", done));
  await new Promise<void>((done) => service.server.close(() => done()));
  await service.close();
  expect(mock.close).toHaveBeenCalledTimes(1);
});

it("loads runtime metadata from an explicit external file while preserving the legacy default", async () => {
  const external = join(dir, "external-runtime.json");
  await writeFile(external, await readFile(join(dir, "verifier-runtime.json")));
  await writeFile(join(dir, "verifier-runtime.json"), "invalid legacy metadata");
  await start(external);
  expect(mock.constructor).toHaveBeenCalledOnce();
});

it("treats an empty runtime override as the documented legacy default", async () => {
  await start("");
  expect(mock.constructor).toHaveBeenCalledOnce();
});

it("uses an explicit native environment without inheriting shell secrets", async () => {
  await start(undefined, { PATH: "/trusted/bin", PROVER_THREADS: "4", PROVER_MEMORY: "5GiB" });
  expect(mock.constructor.mock.calls[0]![0]).toMatchObject({
    env: {
      PATH: "/trusted/bin",
      PROVER_THREADS: "4",
      PROVER_MEMORY: "5GiB",
      GOMAXPROCS: "4",
      GOMEMLIMIT: "5GiB",
    },
  });
  expect(Object.keys((mock.constructor.mock.calls[0]![0] as { env: object }).env)).toHaveLength(5);
});
it("publishes explicit zero certificate/proof counters before any request", async () => {
  const service = await start();
  expect(service.stats().counters).toMatchObject({ requests: 0, proofs: 0, cacheHits: 0 });
});

it("preserves startup and lease-release errors instead of replacing the original failure", async () => {
  const startupError = new Error("synthetic producer RPC failure");
  const releaseError = new Error("synthetic report after real descriptor close");
  mock.chain.mockRejectedValueOnce(startupError);
  mock.leaseReleaseError = releaseError;
  const failure = await start().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([startupError, releaseError]);
  expect((failure as Error).cause).toBe(startupError);
  mock.leaseReleaseError = undefined;
  await start();
  await producer!.close();
});
it("preserves the original startup error identity when lease release succeeds", async () => {
  const error = new Error("synthetic producer startup failure");
  mock.chain.mockRejectedValueOnce(error);
  await expect(start()).rejects.toBe(error);
});

it("preserves a worker shutdown failure and a synthetic lease-release reporting failure", async () => {
  const service = await start();
  producer = undefined;
  const workerError = new Error("synthetic worker shutdown failure");
  const releaseError = new Error("synthetic release report after descriptor close");
  mock.close.mockRejectedValueOnce(workerError);
  mock.leaseReleaseError = releaseError;
  const closing = service.close();
  expect(service.close()).toBe(closing);
  const failure = await closing.catch((error: unknown) => error);
  expect((failure as AggregateError).errors).toEqual([workerError, releaseError]);
  expect((failure as Error).cause).toBe(workerError);
  mock.leaseReleaseError = undefined;
  await start();
});
it("preserves the sole shutdown error identity", async () => {
  const service = await start();
  producer = undefined;
  const error = new Error("synthetic worker shutdown failure");
  mock.close.mockRejectedValueOnce(error);
  await expect(service.close()).rejects.toBe(error);
});

it("filters shell and explicit credentials out of the resident worker configuration", async () => {
  vi.stubEnv("HIDDEN_H3_PRIVATE_KEY", "synthetic-env-h3-secret");
  vi.stubEnv("HIDDEN_PROVER_TOKEN", "synthetic-env-http-secret");
  try {
    await start();
    const first = (mock.constructor.mock.calls.at(-1)![0] as { env: NodeJS.ProcessEnv }).env;
    expect(first.HIDDEN_H3_PRIVATE_KEY).toBeUndefined();
    expect(first.HIDDEN_PROVER_TOKEN).toBeUndefined();
    await producer!.close();
    await start(undefined, {
      HIDDEN_H3_PRIVATE_KEY: "synthetic-explicit-secret",
      PATH: "/trusted/bin",
    });
    const second = (mock.constructor.mock.calls.at(-1)![0] as { env: NodeJS.ProcessEnv }).env;
    expect(second).toEqual({ PATH: "/trusted/bin", GOMAXPROCS: "8", GOMEMLIMIT: "6GiB" });
  } finally {
    vi.unstubAllEnvs();
  }
});

it("retains every cleanup rejection plus the lease failure", async () => {
  const service = await start();
  producer = undefined;
  const worker = new Error("synthetic worker stop failure");
  const drain = new Error("synthetic drain failure");
  const lease = new Error("synthetic lease release failure");
  mock.close.mockRejectedValueOnce(worker);
  mock.drainError = drain;
  mock.leaseReleaseError = lease;
  const failure = await service.close().catch((error: unknown) => error);
  expect((failure as AggregateError).errors).toEqual([worker, drain, lease]);
  expect((failure as AggregateError).cause).toBe(worker);
  mock.drainError = undefined;
  mock.leaseReleaseError = undefined;
  await start();
});
