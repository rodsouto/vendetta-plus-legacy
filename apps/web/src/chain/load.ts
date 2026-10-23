// Reads the on-chain state with Game's views and rebuilds the TypeScript simulator's World from it
// (B-20). Every entity is loaded by id; the ranking (B-18) is computed from this world too.
import type { Address, PublicClient } from "viem";
import { sim, vendetta as rs, type HiddenPlain } from "@vendetta/rules";
import { gameAbi } from "./abi.js";

const big = (x: number | bigint) => BigInt(x);
const pairKey = (a: bigint, b: bigint) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const controllerKey = (a: Address) => a.toLowerCase();

export interface Snapshot {
  world: sim.World;
  /** Chain time of the block the state was read at (seconds). */
  chainTime: bigint;
  /** Wall clock when that block arrived (seconds), before the state was read. */
  wallAt: number;
  block: bigint;
}

/**
 * `sessions`: session addresses to load too (Game cannot list them); this device's, in practice.
 * `controller`: this device's account; with it, the invitations its player made to those
 * sessions are loaded as well (B-15), so the client knows when a session must accept.
 */
export async function loadWorld(
  client: PublicClient,
  game: Address,
  sessions: readonly Address[] = [],
  controller?: Address,
): Promise<Snapshot> {
  const block = await client.getBlock();
  const wallAt = Math.floor(Date.now() / 1000);
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
  const parked = await read<readonly bigint[]>("parkedMissions");

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
      controllers: (p.controllers as Address[]).map(controllerKey),
      research: p.research.map(big),
      researchQueue: queue(p.researchQueue),
      researchBuilding: p.researchBuilding,
      buildings: big(p.buildings),
      centipoints: p.centipoints,
      missions: big(p.missions),
      vacationUntil: big(p.vacationUntil),
      vacationStart: big(p.vacationStart),
      suspendedUntil: big(p.suspendedUntil),
      premiumUntil: big(p.premiumUntil),
      family: p.family,
      rank: p.rank,
      applications: [...p.applications],
      offers: [...p.offers],
      purchases: [...p.purchases],
      sessionEpoch: BigInt(p.sessionEpoch),
      tradeLockUntil: big(p.tradeLockUntil),
      removalAt: new Map(
        (p.controllers as Address[]).flatMap((c, i) =>
          p.removalAt[i] > 0 ? [[controllerKey(c), big(p.removalAt[i])] as const] : [],
        ),
      ),
      recovery: new Set(
        (p.controllers as Address[]).filter((_, i) => p.recovery[i]).map(controllerKey),
      ),
      transferTo: /^0x0+$/.test(p.transferTo) ? "" : controllerKey(p.transferTo),
      transferAt: big(p.transferAt),
      vacationSeq: BigInt(p.vacationSeq),
    });
    for (const c of p.controllers as Address[]) w.playerOf.set(controllerKey(c), id);
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
      lastReturn: big(b.lastReturn),
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
      from: {
        city: big(m.fromCity),
        neighborhood: big(m.fromNeighborhood),
        slot: big(m.fromSlot),
      },
      hidden: m.hidden,
      cover: big(m.cover),
      commit: (m.commit as string).toLowerCase(),
    });
  });
  // The parked list in its on-chain order (B-22); the queue is every other mission.
  w.parked = [...parked];
  const parkedSet = new Set(parked);
  w.pending = [...w.missions.values()]
    .filter((m) => !parkedSet.has(m.id))
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
      from: t.from,
      sold: t.sold,
      quantity: t.quantity,
      price: [...t.price],
      rate: [...t.rate],
      accepted: t.accepted,
      closesAt: big(t.closesAt),
      deposit: [...t.deposit],
      paid: [...t.paid],
      sellerTook: [...t.sellerTook],
      buyerTook: [...t.buyerTook],
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

  // The invitations this device's player made to its sessions (B-15), if it has a player.
  const pid = controller ? w.playerOf.get(controllerKey(controller)) : undefined;
  if (pid !== undefined) {
    const iv = await Promise.all(sessions.map((a) => read<any>("getInvite", [a, pid])));
    iv.forEach((inv, i) => {
      if (inv.kind === 0) return;
      w.invites.set(sim.inviteKey(controllerKey(sessions[i]!), pid), {
        kind: inv.kind,
        recovery: inv.recovery,
        until: big(inv.until),
        epoch: BigInt(inv.epoch),
      });
    });
  }

  return { world: w, chainTime: block.timestamp, wallAt, block: block.number };
}

/**
 * Chain time − wall clock (seconds) after snapshot `s`, from `prev`. Measured when the snapshot's
 * block arrived, so the clock never runs ahead of the chain. On a live chain the latest snapshot
 * sets it (a device clock that is ahead, or that jumps, is corrected); an idle anvil's latest
 * block lags, so on a local chain it only grows (time travel moves it forward).
 */
export function clockOffset(prev: number, s: Snapshot, live: boolean): number {
  const measured = Number(s.chainTime) - s.wallAt;
  return live ? measured : Math.max(prev, measured);
}

/** An invitation or a scheduled transfer addressed to an account that is not a controller yet. */
export interface Pending {
  kind: "controller" | "transfer";
  player: bigint;
  recovery: boolean;
  /** When it can be accepted (transfers) or until when (invitations). */
  at: bigint;
}

/** Blocks per `eth_getLogs` query: within what public RPCs accept for a filtered topic. */
const LOG_CHUNK = 5000n;

/** Players that ever invited an address, from the `ControllerInvited` logs, scanned forward only. */
const inviters = new Map<string, { scanned: bigint; players: Set<bigint> }>();

/**
 * What is waiting for `address` to accept (B-26): controller invitations still valid and due
 * transfers. Invitations are found through the logs (the contract indexes the invited address),
 * in bounded block ranges that only move forward, then read back from the state, so a stale
 * event never shows.
 */
export async function pendingFor(
  client: PublicClient,
  game: Address,
  fromBlock: number,
  address: Address,
  w: sim.World,
  now: bigint,
): Promise<Pending[]> {
  const key = `${game.toLowerCase()}:${address.toLowerCase()}`;
  let seen = inviters.get(key);
  if (!seen) inviters.set(key, (seen = { scanned: BigInt(fromBlock) - 1n, players: new Set() }));
  const head = await client.getBlockNumber({ cacheTime: 0 }); // never viem's cached value
  while (seen.scanned < head) {
    const from = seen.scanned + 1n;
    const to = from + LOG_CHUNK - 1n < head ? from + LOG_CHUNK - 1n : head;
    const events = (await client.getContractEvents({
      address: game,
      abi: gameAbi,
      eventName: "ControllerInvited",
      args: { controller: address },
      fromBlock: from,
      toBlock: to,
    } as never)) as unknown as { args: { player: bigint } }[];
    for (const e of events) seen.players.add(e.args.player);
    seen.scanned = to;
  }
  const out: Pending[] = [];
  for (const player of seen.players) {
    const inv = (await client.readContract({
      address: game,
      abi: gameAbi,
      functionName: "getInvite",
      args: [address, player],
    } as never)) as { kind: number; recovery: boolean; until: number; epoch: number };
    const p = w.players.get(player);
    const until = big(inv.until);
    if (inv.kind !== sim.INVITE_CONTROLLER || !p || now >= until) continue;
    if (BigInt(inv.epoch) !== p.sessionEpoch) continue;
    out.push({ kind: "controller", player, recovery: inv.recovery, at: until });
  }
  const me = controllerKey(address);
  for (const p of w.players.values()) {
    if (p.transferTo === me) {
      out.push({ kind: "transfer", player: p.id, recovery: false, at: p.transferAt });
    }
  }
  return out;
}

/** Deep copy of a World (the ruleset is shared, never mutated). */
export function cloneWorld(w: sim.World): sim.World {
  const { rs: ruleset, ...rest } = w;
  return Object.assign(structuredClone(rest), { rs: ruleset }) as sim.World;
}

/** Missions in the order the queue resolves them: arrival, then creation (B-07). */
export const byArrival = (a: sim.Mission, b: sim.Mission) =>
  a.arrival !== b.arrival ? (a.arrival < b.arrival ? -1 : 1) : a.seq < b.seq ? -1 : 1;

/**
 * Applies the reveals the client can make (`known` plaintexts, by commitment) to hidden missions,
 * in arrival order (reveals go in order for a window, B-22); returns the ids revealed. A plaintext
 * that does not reveal (a wrong one, or one held back by a parked mission ahead) is skipped.
 */
export function revealKnown(
  w: sim.World,
  known: ReadonlyMap<string, HiddenPlain>,
  now: bigint,
): bigint[] {
  const out: bigint[] = [];
  const candidates = [...w.missions.values()]
    .filter((m) => m.hidden && !m.returning && known.has(m.commit))
    .sort(byArrival);
  for (const m of candidates) {
    const p = known.get(m.commit)!;
    try {
      sim.reveal(w, m.id, p.kind, p.target, p.salt, now);
      out.push(m.id);
    } catch (e) {
      if (!(e instanceof sim.GameError)) throw e;
    }
  }
  return out;
}

/**
 * The world as the contract would compute it at `now`: due missions processed in global order,
 * every building settled (B-06, B-07). Hidden missions the client knows are revealed first (B-22);
 * an unknown one is parked, as on chain. Used for the live view; the chain state is not changed.
 */
export function project(
  w: sim.World,
  now: bigint,
  known: ReadonlyMap<string, HiddenPlain> = new Map(),
): sim.World {
  const p = cloneWorld(w);
  sim.processDue(p, now, Number.MAX_SAFE_INTEGER); // parks the due hidden ones
  revealKnown(p, known, now); // each one re-enters the queue at `now`
  sim.processDue(p, now, Number.MAX_SAFE_INTEGER);
  // Every building, even one already integrated to `now`: a mission that arrived this second
  // settled its target only up to its own seq (B-07), so an event created later that finishes
  // this second may still be pending.
  for (const b of p.buildings.values()) sim.settle(p, b, now);
  return p;
}
