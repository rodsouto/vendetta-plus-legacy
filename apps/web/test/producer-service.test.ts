import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
}));
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
async function start() {
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
