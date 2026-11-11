import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, writeFile, access, copyFile, chmod, readFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
  type Address,
  TransactionReceiptNotFoundError,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import react from "@vitejs/plugin-react";
import { gameAbi } from "../../src/chain/abi.js";
import { createServer as createViteServer, type ViteDevServer } from "vite";

import { certificateProducer } from "../prover/service.js";
import { loadLocalStackConfig, readArtifact, sha256File, type Artifact } from "./config.js";
import { LocalProcesses, type ManagedProcess } from "./processes.js";

import { prepareAcceptanceClock } from "./acceptance-clock.js";

import { acquireStateLease } from "../state-lease.js";
import { exclusiveJson, regularJson } from "./receipts.js";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const webRoot = join(repository, "apps/web");
const localFunder = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

export async function assertPortAvailable(port: number) {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
interface LocalDeployment {
  chainId: number;
  rpc: string;
  game: Address;
  directory: Address;
  fromBlock: number;
}
export async function startLocalHiddenStack(
  configFile: string,
  output: string,
  signal?: AbortSignal,
  browserCanarySupplied = false,
  acceptance?: { beacon: (round: bigint) => Promise<string>; timeScale?: number },
) {
  if (process.platform !== "linux") throw new Error("Experimental local stack requires Linux");
  signal?.throwIfAborted();
  const config = await loadLocalStackConfig(configFile, output, repository);
  for (const port of Object.values(config.ports)) await assertPortAvailable(port);
  signal?.throwIfAborted();
  const run = config.runDirectory;
  // Every run is a fresh world. Existing diagnostic directories are never reused.
  await mkdir(run, { mode: 0o700 });
  const lease = await acquireStateLease(run);
  const processes = new LocalProcesses(lease.fd);
  let producer: Awaited<ReturnType<typeof certificateProducer>> | undefined;
  let web: ViteDevServer | undefined;
  let webHttp: Server | undefined;
  let keeper: ManagedProcess | undefined;
  let anvil: ManagedProcess | undefined;
  let closing: Promise<void> | undefined;
  let activeCommand: ManagedProcess | undefined;
  const close = (reason?: unknown) =>
    (closing ??= (async () => {
      // Stop certificate requests first; retain the chain while producer writers drain.
      const errors: unknown[] = [];
      const attempt = async (action: () => Promise<unknown>) => {
        try {
          await action();
        } catch (error) {
          errors.push(error);
        }
      };
      if (keeper) await attempt(() => processes.stop(keeper!));
      if (producer) await attempt(() => producer!.close());
      if (web) await attempt(() => web!.close());
      if (webHttp?.listening)
        await attempt(
          () =>
            new Promise<void>((resolve, reject) => {
              webHttp!.close((error) => (error ? reject(error) : resolve()));
              webHttp!.closeAllConnections();
            }),
        );
      if (anvil) await attempt(() => processes.stop(anvil!));
      await attempt(() => processes.stopAll());
      signal?.removeEventListener("abort", onAbort);
      await attempt(() =>
        exclusiveJson(join(run, "closed.json"), {
          closed: true,
          ephemeral: true,
          cleanupErrors: errors.length,
          reason: reason instanceof Error ? reason.message : undefined,
          productionApproved: false,
        }),
      );
      await attempt(() => lease.release());
      if (errors.length) throw new AggregateError(errors, "Local stack cleanup failed");
    })());
  const onAbort = () => {
    if (activeCommand) void processes.stop(activeCommand).catch((error) => processes.fail(error));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const check = () => {
    signal?.throwIfAborted();
    processes.check();
  };
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"])
    if (process.env[key]) env[key] = process.env[key];
  const deployKey = generatePrivateKey();
  const h3Key = generatePrivateKey();
  const keeperKey = generatePrivateKey();
  const rpc = `http://127.0.0.1:${config.ports.rpc}`;
  const chain = defineChain({
    id: 31337,
    name: "Experimental local hidden v2",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const pub = createPublicClient({
    chain,
    transport: http(rpc, { timeout: 5000, retryCount: 0 }),
    cacheTime: 0,
  });
  const wallet = createWalletClient({
    chain,
    transport: http(rpc, { timeout: 5000, retryCount: 0 }),
    account: privateKeyToAccount(deployKey),
  });
  const verifyDeployment = async (deployment: LocalDeployment) => {
    const expected = await regularJson(join(run, "consumers.json"));
    const consumers = await pub.readContract({
      address: deployment.game,
      abi: gameAbi,
      functionName: "hiddenConsumers",
    });
    if (
      consumers[0].toLowerCase() !== expected.opening.toLowerCase() ||
      consumers[1].toLowerCase() !== expected.point.toLowerCase() ||
      !(await pub.getBytecode({ address: deployment.directory }))
    )
      throw new Error("Local deployment binding mismatch");
  };
  const receipt = async (hash: Hex) => {
    const deadline = Date.now() + 60000;
    for (;;) {
      check();
      try {
        const r = await Promise.race([pub.getTransactionReceipt({ hash }), processes.failure]);
        check();
        if (r.status !== "success") throw new Error("Local deployment transaction reverted");
        return r;
      } catch (error) {
        check();
        if (!(error instanceof TransactionReceiptNotFoundError) || Date.now() > deadline)
          throw error;
        await delay(100);
      }
    }
  };
  const deploy = async (a: Artifact, args: unknown[] = []) => {
    check();
    const r = await receipt(
      await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args }),
    );
    if (!r.contractAddress) throw new Error("No local deployment address");
    return r.contractAddress;
  };
  try {
    for (const name of ["broadcast", "forge-cache", "vite-env"]) {
      await mkdir(join(run, name), { mode: 0o700 });
    }
    for (const name of ["cache", "keeper", "bin"]) await mkdir(join(run, name), { mode: 0o700 });
    await writeFile(
      join(run, "inputs.json"),
      JSON.stringify({ ...config, verifiers: undefined }, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    check();
    try {
      await access(join(repository, "contracts/.env"));
      throw new Error("Move contracts/.env before starting the isolated local stack");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const contractsDirectory =
      acceptance?.timeScale && acceptance.timeScale !== 1
        ? await prepareAcceptanceClock(repository, run, acceptance.timeScale)
        : join(repository, "contracts");
    const foundryEnv = {
      ...env,
      FOUNDRY_PROFILE: "default",
      FOUNDRY_OUT: join(run, "contracts-out"),
      FOUNDRY_BROADCAST: join(run, "broadcast"),
      FOUNDRY_CACHE_PATH: join(run, "forge-cache"),
    };
    const runForge = async (args: string[], log: string, extra: NodeJS.ProcessEnv = {}) => {
      check();
      activeCommand = processes.start(
        config.forge || "forge",
        args,
        join(run, log),
        { ...foundryEnv, ...extra },
        contractsDirectory,
        false,
      );
      const command = activeCommand;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          command.closed,
          processes.failure,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              void processes.stop(command).catch((error) => processes.fail(error));
              reject(new Error("Local contract build/deployment timed out"));
            }, 120000);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        activeCommand = undefined;
      }
      check();
    };
    await runForge(
      ["build", "--skip", "test", ...(config.solc ? ["--use", config.solc] : [])],
      "build.log",
    );
    const nativeBinary = join(run, "bin/producer");
    await copyFile(config.binary, nativeBinary);
    await chmod(nativeBinary, 0o500);
    // Hash the frozen executable before allowing lazy jobs to use it.
    if ((await sha256File(nativeBinary)) !== config.binarySha256)
      throw new Error("Copied native binary pin mismatch");
    check();
    anvil = processes.start(
      config.anvil || "anvil",
      [
        "--host",
        "127.0.0.1",
        "--port",
        String(config.ports.rpc),
        "--chain-id",
        "31337",
        "--hardfork",
        "cancun",
        "--block-time",
        "1",
      ],
      join(run, "anvil.log"),
      env,
      repository,
    );
    const waitForAnvil = async () => {
      const deadline = Date.now() + 60000;
      for (;;) {
        check();
        try {
          const ownLog = await readFile(join(run, "anvil.log"), "utf8");
          if (
            !ownLog
              .split(/\r?\n/)
              .some((line) => line.trim() === `Listening on 127.0.0.1:${config.ports.rpc}`)
          )
            throw new Error("Owned Anvil has not bound the configured RPC port");
          if ((await pub.getChainId()) !== 31337) throw new Error("Wrong local chain");
          return;
        } catch (error) {
          check();
          if (Date.now() > deadline) throw error;
          await delay(100);
        }
      }
    };
    await waitForAnvil();
    let deployment: LocalDeployment;
    {
      const funder = createWalletClient({
        chain,
        transport: http(rpc, { timeout: 5000, retryCount: 0 }),
        account: localFunder,
      });
      for (const key of [deployKey, h3Key, keeperKey])
        await receipt(
          await funder.sendTransaction({
            to: privateKeyToAccount(key).address,
            value: 100n * 10n ** 18n,
          }),
        );
      const openingVerifier = await deploy(config.verifiers.opening);
      const pointVerifier = await deploy(config.verifiers["invalid-point"]);
      // Consumers use this run's isolated build; final verifier artifacts stay archived.
      const opening = await deploy(
        await readArtifact(join(run, "contracts-out/MissionV2Consumer.sol/MissionV2Consumer.json")),
        [openingVerifier],
      );
      const point = await deploy(
        await readArtifact(
          join(run, "contracts-out/InvalidPointV2Consumer.sol/InvalidPointV2Consumer.json"),
        ),
        [pointVerifier],
      );
      check();
      const admin = localFunder;
      await runForge(
        [
          "script",
          "script/Deploy.s.sol",
          "--rpc-url",
          rpc,
          "--broadcast",
          ...(config.solc ? ["--use", config.solc] : []),
        ],
        "deploy.log",
        {
          DEPLOYER_PRIVATE_KEY: deployKey,
          ADMIN: admin,
          OPERATOR: admin,
          ARBITER: admin,
          HIDDEN_OPENING_CONSUMER: opening,
          HIDDEN_INVALID_POINT_CONSUMER: point,
        },
      );
      const transactions = JSON.parse(
        await readFile(join(run, "broadcast/Deploy.s.sol/31337/run-latest.json"), "utf8"),
      ).transactions as { contractName: string; contractAddress: Address; hash: Hex }[];
      const game = transactions.find((t) => t.contractName === "ERC1967Proxy")?.contractAddress;
      const directory = transactions.find(
        (t) => t.contractName === "PasskeyDirectory",
      )?.contractAddress;
      if (!game || !directory) throw new Error("Missing Game or passkey directory deployment");
      deployment = {
        chainId: 31337,
        rpc,
        game,
        directory,
        fromBlock: Number(
          (
            await pub.getTransactionReceipt({
              hash: transactions.find((t) => t.contractName === "ERC1967Proxy")!.hash,
            })
          ).blockNumber,
        ),
      };
      await exclusiveJson(join(run, "consumers.json"), { opening, point });
    }
    const { game } = deployment;
    await verifyDeployment(deployment);
    const deploymentFile = join(run, "deployment.json");
    await writeFile(deploymentFile, JSON.stringify(deployment, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    check();
    const token = randomBytes(32).toString("hex");
    const clients = [
      {
        token,
        scopes: ["prove", "metrics"] as ("prove" | "metrics")[],
        requestsPerMinute: 120,
        maxConcurrent: 4,
      },
    ];
    await exclusiveJson(join(run, "producer-clients.json"), clients);
    producer = await certificateProducer({
      clients,
      rpc,
      chainId: 31337,
      game,
      binary: nativeBinary,
      openingKeys: config.openingKeys,
      pointKeys: config.pointKeys,
      runtimeFile: config.runtimeFile,
      cache: join(run, "cache"),
      h3Key,
      nativeEnv: { ...env, PROVER_THREADS: "4", PROVER_MEMORY: "5GiB", GOGC: "25" },
      allowUnsafeLocalSetup: true,
      beacon: acceptance?.beacon,
    });
    check();
    await new Promise<void>((resolve, reject) => {
      producer!.server.once("error", reject);
      producer!.server.listen(config.ports.prover, "127.0.0.1", resolve);
    });
    producer.server.on("error", (error) => processes.fail(error));
    const proverUrl = `http://127.0.0.1:${config.ports.prover}`;
    const readiness = await fetch(proverUrl + "/metrics", {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!readiness.ok) throw new Error("Local producer authenticated readiness failed");
    check();
    if (!acceptance) {
      keeper = processes.start(
        process.execPath,
        ["--import", "tsx", "scripts/keeper.ts", deploymentFile],
        join(run, "keeper.log"),
        {
          ...env,
          RPC_URL: rpc,
          KEEPER_STATE_DIR: join(run, "keeper"),
          KEEPER_PRIVATE_KEY: keeperKey,
          HIDDEN_PROVER_URL: proverUrl,
          HIDDEN_PROVER_TOKEN: token,
        },
        webRoot,
      );
      const keeperDeadline = Date.now() + 15000;
      for (;;) {
        check();
        if ((await readFile(join(run, "keeper.log"), "utf8")).includes("certificate keeper for "))
          break;
        if (Date.now() > keeperDeadline)
          throw new Error("Local keeper startup timed out; inspect keeper.log");
        await delay(100);
      }
      check();
    }
    webHttp = createHttpServer((req, res) => {
      if (web) web.middlewares(req, res);
      else res.writeHead(503).end();
    });
    web = await createViteServer({
      configFile: false,
      plugins: [react()],
      envDir: join(run, "vite-env"),
      envPrefix: [],
      clearScreen: false,
      root: webRoot,
      cacheDir: join(run, "vite-cache"),
      define: {
        "import.meta.env.VITE_DEPLOYMENT": JSON.stringify(JSON.stringify(deployment)),
        "import.meta.env.VITE_NETWORK": JSON.stringify("local"),
        "import.meta.env.VITE_INDEXER_URL": JSON.stringify(""),
      },
      appType: "spa",
      server: {
        middlewareMode: true,
        hmr: { server: webHttp },
        host: "127.0.0.1",
        port: config.ports.web,
        strictPort: true,
        open: false,
      },
    });
    check();
    await new Promise<void>((resolve, reject) => {
      webHttp!.once("error", reject);
      webHttp!.listen(config.ports.web, "127.0.0.1", resolve);
    });
    webHttp.on("error", (error) => processes.fail(error));
    check();
    const url = `http://127.0.0.1:${config.ports.web}`;
    const summary = {
      scope: "unsafe experimental local stack",
      browserCanarySupplied,
      submissionMode: acceptance ? "acceptance-harness" : "keeper",
      gameTimeScale: acceptance?.timeScale ?? 1,
      deployment,
      web: url,
      prover: proverUrl,
      runDirectory: run,
      ephemeral: true,
      openingManifestSha256: config.openingManifestSha256,
      pointManifestSha256: config.pointManifestSha256,
      pids: { orchestrator: process.pid, anvil: anvil.child.pid, keeper: keeper?.child.pid },
      productionApproved: false,
    };
    await writeFile(join(run, "stack.json"), JSON.stringify(summary, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return { summary, token, close, failure: processes.failure, stats: () => producer!.stats() };
  } catch (error) {
    const errors: unknown[] = [];
    try {
      await close(error);
    } catch (cleanupError) {
      errors.push(cleanupError);
    }
    try {
      await exclusiveJson(join(run, "failed.json"), {
        error: error instanceof Error ? error.message : String(error),
        ephemeral: true,
        productionApproved: false,
      });
    } catch (receiptError) {
      errors.push(receiptError);
    }
    if (errors.length)
      throw new AggregateError([error, ...errors], "Local stack startup failed", {
        cause: error,
      });
    throw error;
  }
}
