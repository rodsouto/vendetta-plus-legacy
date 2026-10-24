// Battle reports (B-18): read from the subgraph when the build names one (VITE_INDEXER_URL), else
// from the RPC logs, only the recent ones. The Battle event carries inputs and totals; the page
// recomputes the rounds with the rules engine.
import type { Address, PublicClient } from "viem";
import { gameAbi } from "./abi.js";

export interface BattleReport {
  attacker: readonly bigint[];
  defender: readonly bigint[];
  attackerResearch: readonly number[];
  defenderResearch: readonly number[];
  attackerPct: bigint;
  defenderPct: bigint;
  attackerSurvivors: readonly bigint[];
  defenderSurvivors: readonly bigint[];
  loot: readonly bigint[];
}

export interface Report {
  key: string;
  time: bigint;
  attacker: bigint;
  defender: bigint;
  building: bigint;
  r: BattleReport;
}

/** The subgraph's GraphQL URL, or undefined to read the logs (no indexer: local without Docker, e2e). */
export const indexerUrl = (): string | undefined =>
  (import.meta.env.VITE_INDEXER_URL as string | undefined) || undefined;

/** Reports the subgraph returns per query, newest first. */
const PAGE = 100;

// About two weeks at Gnosis's five-second slots. Bound each query for public RPCs.
const LOG_WINDOW = 241_920n;
const LOG_CHUNK = 5_000n;

/** The latest battles, newest first: those of `player`, or everyone's without one. */
export async function readReports(
  client: PublicClient,
  game: Address,
  fromBlock: number,
  player: bigint | null,
): Promise<Report[]> {
  const url = indexerUrl();
  return url ? fromIndexer(url, player) : fromLogs(client, game, fromBlock, player);
}

interface BattleRow {
  id: string;
  timestamp: string;
  attacker: { id: string };
  defender: { id: string };
  building: string;
  attackerArmy: string[];
  defenderArmy: string[];
  attackerResearch: number[];
  defenderResearch: number[];
  attackerPct: string;
  defenderPct: string;
  attackerSurvivors: string[];
  defenderSurvivors: string[];
  loot: string[];
}

async function fromIndexer(url: string, player: bigint | null): Promise<Report[]> {
  const where = player === null ? "" : `, where: { or: [{ attacker: $p }, { defender: $p }] }`;
  const query = `query${player === null ? "" : "($p: String!)"} {
    battles(first: ${PAGE}, orderBy: position, orderDirection: desc${where}) {
      id timestamp attacker { id } defender { id } building
      attackerArmy defenderArmy attackerResearch defenderResearch attackerPct defenderPct
      attackerSurvivors defenderSurvivors loot
    }
  }`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: player === null ? {} : { p: player.toString() } }),
  });
  if (!res.ok) throw new Error(`indexer: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { battles: BattleRow[] }; errors?: unknown[] };
  if (!body.data) throw new Error(`indexer: ${JSON.stringify(body.errors)}`);
  const big = (xs: string[]) => xs.map(BigInt);
  // `position` is the chain order (block, then log index), so the limit keeps the newest.
  return body.data.battles.map((x) => ({
    key: x.id,
    time: BigInt(x.timestamp),
    attacker: BigInt(x.attacker.id),
    defender: BigInt(x.defender.id),
    building: BigInt(x.building),
    r: {
      attacker: big(x.attackerArmy),
      defender: big(x.defenderArmy),
      attackerResearch: x.attackerResearch,
      defenderResearch: x.defenderResearch,
      attackerPct: BigInt(x.attackerPct),
      defenderPct: BigInt(x.defenderPct),
      attackerSurvivors: big(x.attackerSurvivors),
      defenderSurvivors: big(x.defenderSurvivors),
      loot: big(x.loot),
    },
  }));
}

async function fromLogs(
  client: PublicClient,
  game: Address,
  fromBlock: number,
  player: bigint | null,
): Promise<Report[]> {
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  const start = BigInt(fromBlock);
  const lower = latest - start > LOG_WINDOW ? latest - LOG_WINDOW : start;
  const range = {
    address: game,
    abi: gameAbi,
    eventName: "Battle",
  };
  type Log = {
    args: { attacker: bigint; defender: bigint; building: bigint; report: BattleReport };
    blockNumber: bigint;
    logIndex: number;
  };
  const seen = new Map<string, Log>();
  // Scan newest first and finish after a whole chunk, so the latest PAGE reports stay ordered.
  for (let to = latest; to >= lower;) {
    const from = to - lower + 1n > LOG_CHUNK ? to - LOG_CHUNK + 1n : lower;
    const chunk = { ...range, fromBlock: from, toBlock: to };
    const queries =
      player === null
        ? [client.getContractEvents(chunk as never)]
        : [
            client.getContractEvents({ ...chunk, args: { attacker: player } } as never),
            client.getContractEvents({ ...chunk, args: { defender: player } } as never),
          ];
    const logs = (await Promise.all(queries)).flat() as unknown as Log[];
    for (const log of logs) seen.set(`${log.blockNumber}-${log.logIndex}`, log);
    if (seen.size >= PAGE || from === lower) break;
    to = from - 1n;
  }
  const newest = [...seen.entries()]
    .sort(([, a], [, b]) => Number(b.blockNumber - a.blockNumber) || b.logIndex - a.logIndex)
    .slice(0, PAGE);
  const times = new Map<bigint, bigint>();
  const out: Report[] = [];
  for (const [key, log] of newest) {
    let time = times.get(log.blockNumber);
    if (time === undefined) {
      time = (await client.getBlock({ blockNumber: log.blockNumber })).timestamp;
      times.set(log.blockNumber, time);
    }
    out.push({
      key,
      time,
      attacker: log.args.attacker,
      defender: log.args.defender,
      building: log.args.building,
      r: log.args.report,
    });
  }
  return out.sort((a, b) => {
    const [ab, al] = a.key.split("-").map(BigInt);
    const [bb, bl] = b.key.split("-").map(BigInt);
    return Number(bb! - ab!) || Number(bl! - al!);
  });
}
