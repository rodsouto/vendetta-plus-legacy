// Battle reports (B-18): from the subgraph when the build names one, else from the RPC logs.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { readReports } from "../src/chain/reports.js";

const GAME: Address = "0x000000000000000000000000000000000000dEaD";
const TROOPS = 21;
const zeros = (n: number) => Array.from({ length: n }, () => "0");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readReports from the subgraph", () => {
  it("asks for the player's newest battles in chain order and converts them", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "http://indexer.test/graphql");
    const bodies: { query: string; variables: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      const row = {
        id: "0xab-3",
        timestamp: "1700000000",
        attacker: { id: "7" },
        defender: { id: "9" },
        building: "12",
        attackerArmy: ["18446744073709551615", ...zeros(TROOPS - 1)],
        defenderArmy: zeros(TROOPS),
        attackerResearch: Array.from({ length: 16 }, () => 1),
        defenderResearch: Array.from({ length: 16 }, () => 0),
        attackerPct: "100",
        defenderPct: "50",
        attackerSurvivors: zeros(TROOPS),
        defenderSurvivors: zeros(TROOPS),
        loot: ["1", "2", "3", "4"],
      };
      return new Response(JSON.stringify({ data: { battles: [row] } }));
    });
    const out = await readReports(null as never, GAME, 0, 7n);
    // The limit applies after ordering by `position` (block, then log index): never by block alone,
    // whose ties the server breaks by id.
    expect(bodies[0]!.query).toMatch(/orderBy: position, orderDirection: desc/);
    expect(bodies[0]!.query).toMatch(/or: \[\{ attacker: \$p \}, \{ defender: \$p \}\]/);
    expect(bodies[0]!.variables).toEqual({ p: "7" });
    expect(out).toHaveLength(1);
    expect(out[0]!.r.attacker[0]).toBe(18446744073709551615n);
    expect(out[0]!.r.loot).toEqual([1n, 2n, 3n, 4n]);
    expect(out[0]!.building).toBe(12n);
    // A visitor without a player gets everyone's.
    await readReports(null as never, GAME, 0, null);
    expect(bodies[1]!.query).not.toMatch(/where/);
    expect(bodies[1]!.variables).toEqual({});
  });
});

describe("readReports from the logs", () => {
  it("queries bounded chunks from newest to oldest, without gaps", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "");
    const ranges: [bigint, bigint][] = [];
    const client = {
      getBlockNumber: async () => 12_000n,
      getContractEvents: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        ranges.push([fromBlock, toBlock]);
        return [];
      },
    };
    expect(await readReports(client as never, GAME, 10, null)).toEqual([]);
    expect(ranges).toEqual([
      [7001n, 12000n],
      [2001n, 7000n],
      [10n, 2000n],
    ]);
  });
  it("stops after finding the latest page and avoids reading older history", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "");
    let queries = 0;
    const client = {
      getBlockNumber: async () => 20_000n,
      getContractEvents: async () => {
        queries++;
        return Array.from({ length: 120 }, (_, logIndex) => ({
          blockNumber: 20_000n,
          logIndex,
          args: { attacker: 1n, defender: 2n, building: 1n, report: {} },
        }));
      },
      getBlock: async () => ({ timestamp: 1n }),
    };
    const out = await readReports(client as never, GAME, 0, null);
    expect(queries).toBe(1);
    expect(out).toHaveLength(100);
    expect(out[0]!.key).toBe("20000-119");
    expect(out[99]!.key).toBe("20000-20");
  });
  it("merges both sides of the player, newest first, one block read per block", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "");
    const log = (block: bigint, index: number, attacker: bigint, defender: bigint) => ({
      blockNumber: block,
      logIndex: index,
      args: { attacker, defender, building: 1n, report: {} },
    });
    const blockReads: bigint[] = [];
    const client = {
      getBlockNumber: async () => 1000n,
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
        blockReads.push(blockNumber);
        return { timestamp: blockNumber * 10n };
      },
      getContractEvents: async (a: { args: { attacker?: bigint; defender?: bigint } }) =>
        a.args.attacker === 7n
          ? [log(5n, 2, 7n, 9n), log(10n, 1, 7n, 7n), log(10n, 11, 7n, 9n)]
          : [log(10n, 1, 7n, 7n), log(10n, 3, 9n, 7n)],
    };
    const out = await readReports(client as never, GAME, 0, 7n);
    expect(out.map((r) => r.key)).toEqual(["10-11", "10-3", "10-1", "5-2"]);
    expect(out.map((r) => r.time)).toEqual([100n, 100n, 100n, 50n]);
    expect(blockReads.sort()).toEqual([10n, 5n].sort());
  });
});
