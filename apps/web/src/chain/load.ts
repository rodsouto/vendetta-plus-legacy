// Reads the on-chain state with Game's views and rebuilds the TypeScript simulator's World from it
// (B-20). Local worlds are small, so every entity is loaded by id; the indexer replaces this in 4c.
import type { Address, PublicClient } from "viem";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "./abi.js";

const big = (x: number | bigint) => BigInt(x);
const pairKey = (a: bigint, b: bigint) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const controllerKey = (a: Address) => a.toLowerCase();

export interface Snapshot {
  world: sim.World;
  /** Chain time of the block the state was read at (seconds). */
  chainTime: bigint;
  block: bigint;
}

/** `sessions`: session addresses to load too (Game cannot list them); this device's, in practice. */
export async function loadWorld(
  client: PublicClient,
  game: Address,
  sessions: readonly Address[] = [],
): Promise<Snapshot> {
  const block = await client.getBlock();
  const read = <T>(functionName: string, args: unknown[] = []) =>
    client.readContract({
      address: game,
      abi: gameAbi,
      functionName,
      args,
      blockNumber: block.number,
    } as never) as Promise<T>;
  const ids = (n: bigint) => Array.from({ length: Number(n) }, (_, i) => BigInt(i + 1));

  const [seq, players, buildings, missions, , globalPremiumUntil] =
    await read<readonly [bigint, bigint, bigint, bigint, bigint, number]>("counters");
  const [families, wars, trades] = await read<readonly [bigint, bigint, bigint]>("socialCounters");

  const w = sim.newWorld(rs);
  w.seq = seq;
  w.globalPremiumUntil = big(globalPremiumUntil);
  w.nextPlayer = players + 1n;
  w.nextBuilding = buildings + 1n;
  w.nextMission = missions + 1n;
  w.nextFamily = families + 1n;
  w.nextWar = wars + 1n;
  w.nextTrade = trades + 1n;

  type Q = { index: number; seq: bigint; finishAt: number };
  type T = { troop: number; seq: bigint; finishAt: number; quantity: bigint };
  const queue = (q: readonly Q[]) =>
    q.map((i) => ({ index: i.index, seq: i.seq, finishAt: big(i.finishAt) }));
  const training = (q: readonly T[]) =>
    q.map((i) => ({ index: i.troop, seq: i.seq, finishAt: big(i.finishAt), quantity: i.quantity }));

  const [pv, bv, mv, fv, wv, tv, sv] = await Promise.all([
    Promise.all(ids(players).map((id) => read<any>("getPlayer", [id]))),
    Promise.all(ids(buildings).map((id) => read<any>("getBuilding", [id]))),
    Promise.all(ids(missions).map((id) => read<any>("getMission", [id]))),
    Promise.all(ids(families).map((id) => read<any>("getFamily", [id]))),
    Promise.all(ids(wars).map((id) => read<any>("getWar", [id]))),
    Promise.all(ids(trades).map((id) => read<any>("getTrade", [id]))),
    Promise.all(sessions.map((a) => read<any>("getSession", [a]))),
  ]);

  pv.forEach((p, i) => {
    const id = BigInt(i + 1);
    w.players.set(id, {
      id,
      controller: controllerKey(p.controller),
      research: p.research.map(big),
      researchQueue: queue(p.researchQueue),
      researchBuilding: p.researchBuilding,
      buildings: big(p.buildings),
      centipoints: p.centipoints,
      missions: big(p.missions),
      vacationUntil: big(p.vacationUntil),
      suspendedUntil: big(p.suspendedUntil),
      premiumUntil: big(p.premiumUntil),
      family: p.family,
      rank: p.rank,
      applications: [...p.applications],
      offers: [...p.offers],
      sessionEpoch: BigInt(p.sessionEpoch),
    });
    w.playerOf.set(controllerKey(p.controller), id);
  });

  bv.forEach((b, i) => {
    if (b.owner === 0n) return; // abandoned
    const id = BigInt(i + 1);
    const coord = { city: big(b.city), neighborhood: big(b.neighborhood), slot: big(b.slot) };
    w.buildings.set(id, {
      id,
      owner: b.owner,
      coord,
      levels: b.levels.map(big),
      stock: [...b.stock],
      lastUpdate: big(b.lastUpdate),
      roomQueue: queue(b.roomQueue),
      centipoints: b.centipoints,
      troops: [...b.troops],
      training: [training(b.attackTraining), training(b.defenseTraining)],
    });
    w.buildingAt.set(sim.coordKey(coord), id);
  });

  mv.forEach((m, i) => {
    if (m.owner === 0n) return; // finished
    const id = BigInt(i + 1);
    w.missions.set(id, {
      id,
      owner: m.owner,
      origin: m.origin,
      kind: m.kind,
      returning: m.returning,
      target: { city: big(m.city), neighborhood: big(m.neighborhood), slot: big(m.slot) },
      start: big(m.start),
      arrival: big(m.arrival),
      duration: big(m.duration),
      seq: m.seq,
      troops: [...m.troops],
      cargo: [...m.cargo],
      trade: m.trade,
    });
  });
  w.pending = [...w.missions.values()]
    .sort((a, b) =>
      a.arrival !== b.arrival ? (a.arrival < b.arrival ? -1 : 1) : a.seq < b.seq ? -1 : 1,
    )
    .map((m) => m.id);

  fv.forEach((f, i) => {
    const id = BigInt(i + 1);
    w.families.set(id, { id, alive: f.alive, tag: f.tag, name: f.name, members: f.members });
    if (f.alive) {
      w.familyNames.set(`tag:${f.tag.toLowerCase()}`, id);
      w.familyNames.set(`name:${f.name.toLowerCase()}`, id);
    }
  });

  wv.forEach((x, i) => {
    const id = BigInt(i + 1);
    w.wars.set(id, {
      id,
      a: x.a,
      b: x.b,
      lostA: x.lostA,
      lostB: x.lostB,
      ended: x.ended,
      winner: x.winner,
      offer: x.offer,
      offerBy: x.offerBy,
    });
    if (!x.ended) w.activeWar.set(pairKey(x.a, x.b), id);
  });

  tv.forEach((t, i) => {
    if (t.seller === 0n) return; // cancelled
    const id = BigInt(i + 1);
    w.trades.set(id, {
      id,
      seller: t.seller,
      buyer: t.buyer,
      sold: t.sold,
      quantity: t.quantity,
      price: [...t.price],
      delivered: t.delivered,
      paid: [...t.paid],
      accepted: t.accepted,
      acceptedAt: big(t.acceptedAt),
    });
  });

  sv.forEach((s, i) => {
    if (s.player === 0n) return;
    w.sessions.set(controllerKey(sessions[i]!), {
      player: s.player,
      until: big(s.until),
      epoch: big(s.epoch),
    });
  });

  return { world: w, chainTime: block.timestamp, block: block.number };
}

/** Deep copy of a World (the ruleset is shared, never mutated). */
export function cloneWorld(w: sim.World): sim.World {
  const { rs: ruleset, ...rest } = w;
  return Object.assign(structuredClone(rest), { rs: ruleset }) as sim.World;
}

/**
 * The world as the contract would compute it at `now`: due missions processed in global order,
 * every building settled (B-06, B-07). Used for the live view; the chain state is not changed.
 */
export function project(w: sim.World, now: bigint): sim.World {
  const p = cloneWorld(w);
  sim.processDue(p, now, Number.MAX_SAFE_INTEGER);
  for (const b of p.buildings.values()) if (b.lastUpdate < now) sim.settle(p, b, now);
  return p;
}
