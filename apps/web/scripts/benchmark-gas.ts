// Reproducible cold-transaction gas benchmark. All writes go to a fresh local Anvil instance.
// Public RPCs are used only for fee quotes; no production credentials are needed.
// pnpm --filter @vendetta/web benchmark:gas [--output /absolute/path.json]
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toHex,
  type Hex,
} from "viem";
import { entryPoint07Abi, entryPoint07Address } from "viem/account-abstraction";
import { arbitrum, gnosis } from "viem/chains";
import { anvilChain, devAccount } from "../src/chain/config.js";
import { encodeHiddenPlain } from "@vendetta/rules";
import { gameAbi } from "../src/chain/abi.js";
import type { Deployment } from "../src/chain/networks.js";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "../..");
const { values } = parseArgs({
  options: {
    output: { type: "string", default: join(tmpdir(), "vendetta-gas-benchmark.json") },
    base: { type: "string", default: "8590" },
    vite: { type: "string", default: "5197" },
  },
});
const dir = mkdtempSync(join(tmpdir(), "vendetta-gas-"));
const file = join(dir, "deployment.json");
let logs = "";
let browser: Browser | undefined;
let stack: ChildProcess | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (x: unknown) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);

try {
  stack = spawn(
    join(web, "node_modules/.bin/tsx"),
    [
      "scripts/aa-stack.ts",
      "--base",
      values.base!,
      "--vite",
      values.vite!,
      "--no-keeper",
      "--deployment-file",
      file,
    ],
    {
      cwd: web,
      detached: true,
      env: {
        ...process.env,
        VITE_NETWORK: "local",
        DEPLOYER_PRIVATE_KEY: "0",
        ADMIN: devAccount(0).address,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [stack.stdout, stack.stderr])
    stream?.on("data", (b) => {
      logs = (logs + b.toString()).slice(-12_000);
    });
  const baseUrl = `http://localhost:${values.vite}`;
  let ready = false;
  for (let i = 0; i < 600; i++) {
    if (stack.exitCode !== null) throw new Error(`Local stack exited: ${logs}`);
    try {
      if (readFileSync(file, "utf8") && (await fetch(baseUrl)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* deployment/server not ready */
    }
    await sleep(200);
  }
  if (!ready) throw new Error(`Local stack did not start: ${logs}`);
  const deployment = JSON.parse(readFileSync(file, "utf8")) as Deployment;
  if (deployment.rpc !== `http://127.0.0.1:${values.base}` || deployment.chainId !== 31337)
    throw new Error("Unexpected benchmark chain");
  const chain = anvilChain(deployment);
  const client = createPublicClient({ chain, transport: http(deployment.rpc), cacheTime: 0 });
  const wallet = createWalletClient({
    chain,
    transport: http(deployment.rpc),
    account: devAccount(0),
  });
  const rpc = (method: string, params: unknown[]) => client.request({ method, params } as never);
  const read = (functionName: string, args: unknown[] = []): Promise<any> =>
    client.readContract({ address: deployment.game, abi: gameAbi, functionName, args } as never);
  async function plain(functionName: string, args: unknown[], account = devAccount(0)) {
    const hash = await wallet.writeContract({
      address: deployment.game,
      abi: gameAbi,
      functionName,
      args,
      account,
    } as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  }
  async function warp(seconds: number) {
    await rpc("evm_increaseTime", [seconds]);
    await rpc("evm_mine", []);
  }
  async function until(timestamp: number) {
    const now = Number((await client.getBlock()).timestamp);
    if (timestamp > now) await warp(timestamp - now);
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const methods: string[] = [];
  page.on("request", (request) => {
    if (
      ![deployment.bundler, deployment.paymaster].some(
        (url) => request.url().replace(/\/$/, "") === url,
      )
    )
      return;
    try {
      const body = request.postDataJSON();
      for (const call of Array.isArray(body) ? body : [body]) methods.push(call.method);
    } catch {
      /* not JSON RPC */
    }
  });
  await page.goto(baseUrl);
  const modulePath = "/scripts/gas-benchmark-browser.ts";
  const identities = await page.evaluate(async (p) => (await import(p)).initialize(), modulePath);
  const browserSend = (functionName: string, args: unknown[], from = "actor", accept = false) =>
    page.evaluate(
      async ({ p, functionName, args, from, accept }) =>
        (await import(p)).send(functionName, args, from, accept),
      { p: modulePath, functionName, args, from, accept },
    );

  type Row = {
    name: string;
    mode: "sponsored" | "keeper";
    gasUsed: bigint;
    chargedGas: bigint;
    calldataBytes: number;
    data: Hex;
    to: Hex;
    hash: Hex;
    apiCalls: Record<string, number>;
    userOperationLimits?: {
      callGasLimit: bigint;
      verificationGasLimit: bigint;
      preVerificationGas: bigint;
    };
    arbitrumDataGas?: bigint;
    arbitrumDataWei?: bigint;
  };
  const rows: Row[] = [];
  async function measure(name: string, mode: Row["mode"], work: () => Promise<unknown>) {
    const start = await client.getBlockNumber();
    const firstMethod = methods.length;
    await work();
    const end = await client.getBlockNumber();
    const txs = [];
    for (let b = start + 1n; b <= end; b++) {
      const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
      for (const tx of block.transactions)
        if (
          [deployment.game.toLowerCase(), entryPoint07Address.toLowerCase()].includes(
            tx.to?.toLowerCase() ?? "",
          )
        )
          txs.push(tx);
    }
    if (txs.length !== 1) throw new Error(`${name}: expected one transaction, got ${txs.length}`);
    const tx = txs[0]!;
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    if (receipt.status !== "success") throw new Error(`${name}: transaction reverted`);
    let chargedGas = receipt.gasUsed;
    let operations = 0;
    for (const log of receipt.logs) {
      try {
        const e = decodeEventLog({ abi: entryPoint07Abi, data: log.data, topics: log.topics });
        if (e.eventName === "UserOperationEvent") {
          if (!e.args.success) throw new Error(`${name}: user operation reverted`);
          chargedGas = e.args.actualGasUsed;
          operations++;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("user operation reverted")) throw e;
      }
    }
    if (mode === "sponsored" && operations !== 1)
      throw new Error(`${name}: missing user operation receipt`);
    const apiCalls: Record<string, number> = {};
    for (const m of methods.slice(firstMethod)) apiCalls[m] = (apiCalls[m] ?? 0) + 1;
    let op: { accountGasLimits: Hex; preVerificationGas: bigint } | undefined;
    if (mode === "sponsored") {
      const decoded = decodeFunctionData({ abi: entryPoint07Abi, data: tx.input });
      if (decoded.functionName !== "handleOps") throw new Error("Expected an unaggregated bundle");
      op = decoded.args[0][0];
      if (!op) throw new Error("Empty operation bundle");
    }
    rows.push({
      name,
      mode,
      gasUsed: receipt.gasUsed,
      chargedGas,
      calldataBytes: (tx.input.length - 2) / 2,
      data: tx.input,
      to: tx.to!,
      hash: tx.hash,
      apiCalls,
      userOperationLimits: op
        ? {
            callGasLimit: BigInt(op.accountGasLimits) & ((1n << 128n) - 1n),
            verificationGasLimit: BigInt(op.accountGasLimits) >> 128n,
            preVerificationGas: op.preVerificationGas,
          }
        : undefined,
    });
    writeFileSync(
      values.output!,
      json({ complete: false, measuredAt: new Date().toISOString(), rows }),
    );
    console.log(
      `${name}: tx=${receipt.gasUsed} charged=${chargedGas} gas, calldata=${(tx.input.length - 2) / 2} bytes`,
    );
  }
  const sponsored = (name: string, fn: string, args: unknown[], from = "actor", accept = false) =>
    measure(name, "sponsored", () => browserSend(fn, args, from, accept));
  const keeper = (name: string, fn: string, args: unknown[]) =>
    measure(name, "keeper", () => plain(fn, args));

  await measure("create_account_passkey_publish_register_invite", "sponsored", () =>
    page.evaluate(async (p) => (await import(p)).register(), modulePath),
  );
  await plain("register", [1, 1, 2], devAccount(1));
  const now = Number((await client.getBlock()).timestamp);
  await plain("setGlobalPremium", [now + 365 * 86_400]);
  await sponsored("first_action_deploy_session_accept_build", "queueRoom", [1, 11], "actor", true);
  await warp(86_400);
  await sponsored("train_7_rowdies_settle_build", "train", [1, 0, 7]);
  await warp(86_400);
  await sponsored("settle_training", "poke", [1]);
  const renewalAt = Number((await client.getBlock()).timestamp) + 30 * 86_400;
  await sponsored(
    "renew_session_passkey",
    "authorizeSession",
    [identities.session, renewalAt],
    "controller",
  );
  await sponsored("accept_renewed_session_and_build", "queueRoom", [1, 2], "actor", true);
  await sponsored("queue_build_waiting", "queueRoom", [1, 3]);
  await warp(86_400);
  await sponsored("queue_build_settle_two_completed", "queueRoom", [1, 0]);
  const troop = (n: number) => [n, ...Array<number>(20).fill(0)];
  const resources = [0, 0, 0, 0];
  await sponsored("send_public_attack_5_rowdies", "sendMission", [
    1,
    1,
    [1, 1, 2],
    troop(5),
    resources,
    0,
  ]);
  let mid = (await read("counters"))[3];
  await until(Number((await read("getMission", [mid])).arrival));
  await keeper("keeper_resolve_undefended_attack", "advance", [1]);
  await until(Number((await read("getMission", [mid])).arrival));
  await keeper("keeper_return_5_rowdies", "advance", [1]);
  await warp(31);

  // Encrypt the real game plaintext format with a public deterministic benchmark salt.
  const salt = keccak256(toHex("gas-benchmark"));
  const commit = keccak256(
    encodeAbiParameters(parseAbiParameters("uint64,uint8,uint256,uint256,uint256,bytes32"), [
      1n,
      1,
      1n,
      1n,
      2n,
      salt,
    ]),
  );
  const { mainnetClient, timelockEncrypt, Buffer } = await import("tlock-js");
  const drand = mainnetClient();
  const info = await drand.chain().info();
  const round = Math.ceil((Date.now() / 1000 + 3600 - info.genesis_time) / info.period) + 1;
  const hiddenPlain = encodeHiddenPlain({
    kind: 1,
    target: { city: 1n, neighborhood: 1n, slot: 2n },
    salt: BigInt(salt),
  });
  const ciphertext = toHex(await timelockEncrypt(round, Buffer.from(hiddenPlain), drand));
  await sponsored("send_hidden_attack_tlock", "sendHiddenMission", [
    1,
    commit,
    3,
    troop(5),
    resources,
    ciphertext,
    0,
  ]);
  mid = (await read("counters"))[3];
  await until(Number((await read("getMission", [mid])).arrival));
  await keeper("keeper_reveal_arrived_hidden_attack", "reveal", [mid, 1, [1, 1, 2], salt]);
  await keeper("keeper_resolve_revealed_attack", "advance", [1]);
  await until(Number((await read("getMission", [mid])).arrival));
  await keeper("keeper_return_hidden_attack", "advance", [1]);
  await warp(31);

  // Advanced armies are seeded locally; actions and queue resolution still use unchanged Game bytecode.
  const layout = JSON.parse(
    execFileSync("forge", ["inspect", "GasBenchmarkLayout", "storageLayout", "--json"], {
      cwd: join(root, "contracts"),
      encoding: "utf8",
    }),
  );
  const types = layout.types as Record<
    string,
    {
      members?: { label: string; slot: string; offset: number; type: string }[];
      value?: string;
      base?: string;
      numberOfBytes: string;
    }
  >;
  const coreType = layout.storage[0].type as string;
  const coreSlot = BigInt("0x2e855d24af35474e7fcffb8e2883e0dc8ae23c6929e76907fda8751c5fa2b800");
  const member = (type: string, name: string) => {
    const m = types[type]!.members!.find((x) => x.label === name);
    if (!m) throw new Error(`Unknown storage member: ${name}`);
    return m;
  };
  const mapping = (name: string, id: bigint) => {
    const m = member(coreType, name);
    return {
      slot: BigInt(
        keccak256(
          encodeAbiParameters(parseAbiParameters("uint256,uint256"), [
            id,
            coreSlot + BigInt(m.slot),
          ]),
        ),
      ),
      type: types[m.type]!.value!,
    };
  };
  async function store(slot: bigint, offset: number, bytes: number, value: bigint) {
    const key = toHex(slot, { size: 32 });
    const before = BigInt(
      (await client.getStorageAt({ address: deployment.game, slot: key })) ?? "0x0",
    );
    const shift = BigInt(offset * 8);
    const mask = ((1n << BigInt(bytes * 8)) - 1n) << shift;
    await rpc("anvil_setStorageAt", [
      deployment.game,
      key,
      toHex((before & ~mask) | (value << shift), { size: 32 }),
    ]);
  }
  async function field(group: string, id: bigint, name: string, value: bigint | bigint[]) {
    const base = mapping(group, id);
    const m = member(base.type, name);
    const s = base.slot + BigInt(m.slot);
    if (Array.isArray(value)) {
      const bytes = Number(types[types[m.type]!.base!]!.numberOfBytes);
      const per = Math.floor(32 / bytes);
      for (const [i, v] of value.entries())
        await store(s + BigInt(Math.floor(i / per)), (i % per) * bytes, bytes, v);
    } else await store(s, m.offset, Number(types[m.type]!.numberOfBytes), value);
  }
  async function seedBattle(heavy: boolean) {
    const attacker = heavy
      ? Array.from({ length: 21 }, (_, i) => (i < 16 ? 100_000n : 0n))
      : [3000n, 0n, 0n, 800n, 0n, 0n, 0n, 0n, 0n, 0n, 120n, ...Array<bigint>(10).fill(0n)];
    const defender = heavy
      ? Array<bigint>(21).fill(50_000n)
      : [...Array<bigint>(16).fill(0n), 1500n, 400n, 0n, 0n, 0n];
    for (const id of [1n, 2n]) {
      await field("players", id, "centipoints", 10n ** 24n);
      await field(
        "players",
        id,
        "research",
        Array<bigint>(16).fill(heavy ? 20n : id === 1n ? 8n : 6n),
      );
      const levels = (await read("getBuilding", [id])).levels.map(BigInt);
      for (const i of [7, 8, 9, 10]) levels[i] = 100n;
      await field("buildings", id, "levels", levels);
      await field("buildings", id, "stock", Array<bigint>(4).fill(10_000_000n * 100_800n));
      await field("buildings", id, "lastUpdate", (await client.getBlock()).timestamp);
    }
    await field("buildings", 1n, "troops", attacker);
    await field("buildings", 2n, "troops", defender);
    const a = await read("getBuilding", [1]);
    const d = await read("getBuilding", [2]);
    const research = (await read("getPlayer", [1])).research;
    if (
      a.troops.some((n: bigint, i: number) => n !== attacker[i]) ||
      d.troops.some((n: bigint, i: number) => n !== defender[i]) ||
      research.some((n: number) => n !== (heavy ? 20 : 8))
    )
      throw new Error("Battle fixture does not match Game views");
    return attacker.map(Number);
  }
  const baseline = await rpc("evm_snapshot", []);
  for (const heavy of [false, true]) {
    const troops = await seedBattle(heavy);
    const name = heavy ? "heavy_16v21_stacks_5_rounds" : "typical_3v2_stacks";
    await sponsored(`send_${name}`, "sendMission", [1, 1, [1, 1, 2], troops, resources, 0]);
    mid = (await read("counters"))[3];
    await until(Number((await read("getMission", [mid])).arrival));
    const beforeResolution = await rpc("evm_snapshot", []);
    await keeper(`keeper_resolve_${name}`, "advance", [1]);
    if (heavy) {
      await rpc("evm_revert", [beforeResolution]);
      await sponsored("player_build_drains_heavy_battle", "queueRoom", [1, 0]);
    }
    if (!heavy) await rpc("evm_revert", [baseline]);
  }

  writeFileSync(
    values.output!,
    json({
      measuredAt: new Date().toISOString(),
      revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      rows,
    }),
  );
  console.log(`Local measurements saved to ${values.output}`);

  // Only eth_* read methods on the public networks. Quote the exact local transaction payloads.
  const arb = createPublicClient({
    chain: arbitrum,
    transport: http("https://arb1.arbitrum.io/rpc"),
  });
  const gno = createPublicClient({ chain: gnosis, transport: http("https://rpc.gnosischain.com") });
  const arbBlock = await arb.getBlock();
  const gnoBlock = await gno.getBlock({ includeTransactions: true });
  const priceResponse = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  );
  if (!priceResponse.ok) throw new Error(`ETH/USD quote failed: ${priceResponse.status}`);
  const ethUsd = ((await priceResponse.json()) as { ethereum: { usd: number } }).ethereum.usd;
  const gnoPrices = gnoBlock.transactions
    .map((tx) => tx.gasPrice ?? 0n)
    .filter((p) => p > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const nodeAbi = parseAbi([
    "function gasEstimateL1Component(address to,bool contractCreation,bytes data) external payable returns (uint64 gasEstimateForL1,uint256 baseFee,uint256 l1BaseFeeEstimate)",
  ]);
  for (const row of rows) {
    const {
      result: [dataGas, baseFee],
    } = await arb.simulateContract({
      address: "0x00000000000000000000000000000000000000c8",
      abi: nodeAbi,
      functionName: "gasEstimateL1Component",
      args: [row.to, false, row.data],
      blockNumber: arbBlock.number,
    });
    row.arbitrumDataGas = dataGas;
    row.arbitrumDataWei = dataGas * baseFee;
  }
  const quotes = {
    quotedAt: new Date().toISOString(),
    ethUsd,
    ethUsdSource: priceResponse.url,
    arbitrum: {
      block: arbBlock.number,
      timestamp: arbBlock.timestamp,
      gasPriceWei: await arb.getGasPrice(),
      baseFeeWei: arbBlock.baseFeePerGas,
    },
    gnosis: {
      block: gnoBlock.number,
      timestamp: gnoBlock.timestamp,
      rpcGasPriceWei: await gno.getGasPrice(),
      observedTransactionGasPricesWei: gnoPrices,
      budgetGasPriceWei: 1_500_000_000n,
      xdaiUsdAssumption: 1,
    },
    pimlico: {
      source: "https://www.pimlico.io/pricing",
      apiCreditsSource: "https://docs.pimlico.io/guides/pricing",
      serviceUsdPerSponsoredOperationAfterAllowance: 0.0105,
      gasSurcharge: 0.1,
      includedCreditsPerMonth: 10_000_000,
    },
  };
  // Published per-method API credits; local receipt polling can differ from production latency.
  const methodCredits: Record<string, number> = {
    pm_sponsorUserOperation: 500,
    eth_sendUserOperation: 500,
    pm_getPaymasterData: 300,
    pm_getPaymasterStubData: 200,
    eth_estimateUserOperationGas: 200,
    pimlico_getUserOperationGasPrice: 10,
    eth_getUserOperationReceipt: 10,
    eth_getUserOperationByHash: 10,
    pimlico_getUserOperationStatus: 5,
    eth_supportedEntryPoints: 1,
    eth_chainId: 1,
  };
  const costs = rows.map((row) => {
    const arbGas =
      (Number(row.chargedGas * quotes.arbitrum.gasPriceWei + row.arbitrumDataWei!) / 1e18) * ethUsd;
    const gnoGas = Number(row.chargedGas * quotes.gnosis.budgetGasPriceWei) / 1e18;
    const apiCredits = Object.entries(row.apiCalls).reduce((sum, [method, count]) => {
      if (!(method in methodCredits)) throw new Error(`Unknown Pimlico API price: ${method}`);
      return sum + methodCredits[method]! * count;
    }, 0);
    const measuredServiceUsd = apiCredits / 100_000;
    return {
      name: row.name,
      arbitrumNetworkUsd: arbGas,
      gnosisNetworkUsd: gnoGas,
      apiCredits,
      measuredServiceUsd,
      arbitrumWithObservedApiMarginalUsd:
        row.mode === "sponsored" ? arbGas * 1.1 + measuredServiceUsd : arbGas,
      gnosisWithObservedApiMarginalUsd:
        row.mode === "sponsored" ? gnoGas * 1.1 + measuredServiceUsd : gnoGas,
      arbitrumWithPimlicoMarginalUsd: row.mode === "sponsored" ? arbGas * 1.1 + 0.0105 : arbGas,
      gnosisWithPimlicoMarginalUsd: row.mode === "sponsored" ? gnoGas * 1.1 + 0.0105 : gnoGas,
    };
  });
  const result = {
    complete: true,
    measuredAt: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    methodology: {
      execution:
        "Cold, separate transactions on Anvil with production Game proxy, EntryPoint 0.7, Kernel 3.1/WebAuthn, SimpleAccount, production sendOperation gas padding, Alto and mock paymaster. One user operation per bundle.",
      chargedGas:
        "UserOperationEvent.actualGasUsed for sponsorship (includes AA overhead and unused-gas penalty); receipt.gasUsed for direct keeper calls. Both retained separately.",
      advancedBattle:
        "Locally seeded troops/research/stock/points and level-100 warehouses via compiler-provided storage layout; unchanged Game bytecode; fixture troops/research verified through Game views. Heavy case is the highest-cost ratio in the existing 7-ratio test search, not a proven universal maximum.",
      prices:
        "Current public RPC fee quotes. Gnosis budget uses 1.5 gwei xDAI, not the near-zero RPC minimum. ETH spot from CoinGecko; xDAI assumed $1.",
      arbitrumData:
        "Read-only NodeInterface.gasEstimateL1Component on each exact local transaction payload, all at one public Arbitrum block. Local signatures and chain ID differ from production.",
      limitations:
        "Projected network costs, not paid mainnet receipts. Mock paymaster/provider estimates and chain-specific execution can differ. Observed API calls are priced from the official per-method credit table; production responses/polling can change call counts. Both observed-call and published-average marginal service projections exclude included credits. Excludes hosting/indexer/RPC infrastructure, retries and player acquisition. No network migration implemented.",
      ciphertextBytes: (ciphertext.length - 2) / 2,
    },
    quotes,
    methodCredits,
    rows,
    costs,
  };
  writeFileSync(values.output!, json(result));
  console.log(json(costs));
  console.log(`Complete results saved to ${values.output}`);
} finally {
  await browser?.close();
  if (stack?.pid) {
    try {
      process.kill(-stack.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}
