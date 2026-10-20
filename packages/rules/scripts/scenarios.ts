// Generates scenarios (sequences of actions over time) and the state after every step, computed by
// the TypeScript simulator. Foundry replays them against the Game contract
// (contracts/test/core/Scenarios.t.sol): any difference between the two implementations fails.
// Deterministic (seeded); output committed. Run with `pnpm codegen`.
//
// Two kinds:
//  - random: random core actions (queues, cancels, premium) by a few players, mostly reverts and edges;
//  - bots: players that grow, train, attack, transport, station, occupy, recall and abandon over
//    months of game time, so battles, loot, occupations and returns to lost buildings happen;
//  - hidden: bots that send hidden missions (B-22) and reveal them on time, late, wrongly or never.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distance, sim, vendetta as rs } from "../src/index.js";

const RANDOM = { count: 16, steps: 80 };
const BOTS = { count: 8, steps: 400 };
const HIDDEN = { count: 4, steps: 400 };
const T0 = 1_700_000_000n;

/** Action codes shared with Scenarios.t.sol. */
const ACTION = {
  register: 0, // [city, neighborhood, slot]
  queueRoom: 1, // [building, room]
  queueResearch: 2, // [building, research]
  cancelRoom: 3, // [building, position]
  cancelResearch: 4, // [building, position]
  poke: 5, // [building]
  setGlobalPremium: 6, // [until], by the admin
  train: 7, // [building, troop, quantity]
  cancelTraining: 8, // [building, queue, position]
  sendMission: 9, // [building, kind, city, neighborhood, slot, troops × 21, resources × 4, trade]
  recall: 10, // [mission]
  abandon: 11, // [building]
  advance: 12, // [max]
  startVacation: 13, // []
  endVacation: 14, // []
  suspend: 15, // [player, until], by the admin
  grantPremium: 16, // [player, until], by the admin
  transferPlayer: 17, // [new controller (actor id)]
  createFamily: 18, // [tag index, name index] into NAMES
  applyToFamily: 19, // [family]
  withdrawApplication: 20, // [family]
  answerApplication: 21, // [applicant, accept 0/1]
  leaveFamily: 22, // []
  kickMember: 23, // [member]
  setRank: 24, // [member, rank]
  handOver: 25, // [member]
  dissolveFamily: 26, // []
  declareWar: 27, // [family]
  offerPeace: 28, // [war, kind]
  answerPeace: 29, // [war, accept 0/1]
  offerTrade: 30, // [buyer, sold, quantity, price × 4]
  cancelTrade: 31, // [trade]
  acceptTrade: 32, // [trade]
  authorizeSession: 33, // [session (actor id), until]
  revokeSession: 34, // [session (actor id)]
  addController: 35, // [controller (actor id)]
  removeController: 36, // [controller (actor id)]
  sendHiddenMission: 37, // [building, kind, city, neighborhood, slot, salt, cover, troops × 21, resources × 4]
  reveal: 38, // [mission, kind, city, neighborhood, slot, salt]
} as const;

/** Family tags and names by index, shared with Scenarios.t.sol (some invalid on purpose). */
const NAMES = [
  "MOB",
  "mob",
  "Cosa Nostra",
  "Los Pibes",
  "AB",
  "A",
  "Camorra",
  "Ñandú",
  "The Family",
  "THE FAMILY",
  "Yakuza",
];

/** Admin actions run as the owner in Scenarios.t.sol. */
const ADMIN_ACTIONS: number[] = [ACTION.setGlobalPremium, ACTION.suspend, ACTION.grantPremium];

type Action = { action: number; args: number[] };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (x: bigint) => {
  if (x > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("value does not fit a JSON number");
  return Number(x);
};

const queueSnap = (q: sim.QueueItem[]) => ({
  queue_finish: q.map((i) => num(i.finishAt)),
  queue_index: q.map((i) => i.index),
  queue_seq: q.map((i) => num(i.seq)),
});

const trainingSnap = (q: sim.TrainingItem[]) =>
  q.flatMap((i) => [i.index, num(i.quantity), num(i.seq), num(i.finishAt)]);

/** Every session address ever authorized, so revoked ones are checked too (as zeros). */
const SESSIONS = new Set<string>();

/** Plaintext of the hidden missions sent in the current scenario, by mission id: [kind, city, neighborhood, slot, salt]. */
const SECRETS = new Map<number, number[]>();

/** The player an actor plays for (as controller or session), as Scenarios.t.sol computes it. */
const playerFor = (w: sim.World, controller: string) =>
  w.playerOf.get(controller) ?? w.sessions.get(controller)?.player ?? 0n;

function snapshot(w: sim.World) {
  return {
    sessions: [...SESSIONS].map((k) => {
      const s = w.sessions.get(k);
      return {
        actor: Number(k),
        epoch: s ? num(s.epoch) : 0,
        player: s ? num(s.player) : 0,
        until: s ? num(s.until) : 0,
      };
    }),
    buildings: [...w.buildings.values()].map((b) => ({
      centipoints: num(b.centipoints),
      id: num(b.id),
      last_update: num(b.lastUpdate),
      levels: b.levels.map(num),
      owner: num(b.owner),
      ...queueSnap(b.roomQueue),
      stock: b.stock.map(num),
      training_attack: trainingSnap(b.training[0]),
      training_defense: trainingSnap(b.training[1]),
      troops: b.troops.map(num),
    })),
    missions: [...w.missions.values()].map((m) => ({
      cargo: m.cargo.map(num),
      fields: [
        m.owner,
        m.origin,
        BigInt(m.kind),
        m.returning ? 1n : 0n,
        m.target.city,
        m.target.neighborhood,
        m.target.slot,
        m.start,
        m.arrival,
        m.duration,
        m.seq,
        m.from.city,
        m.from.neighborhood,
        m.from.slot,
        m.hidden ? 1n : 0n,
        m.cover,
        m.bond,
      ].map(num),
      id: num(m.id),
      troops: m.troops.map(num),
    })),
    players: [...w.players.values()].map((p) => ({
      buildings: num(p.buildings),
      centipoints: num(p.centipoints),
      controllers: p.controllers.map(Number),
      id: num(p.id),
      missions: num(p.missions),
      ...queueSnap(p.researchQueue),
      research: p.research.map(num),
      research_building: num(p.researchBuilding),
      social: [
        p.vacationUntil,
        p.suspendedUntil,
        p.premiumUntil,
        p.family,
        BigInt(p.rank),
        p.sessionEpoch,
        p.vacationStart,
      ].map(num),
      applications: p.applications.map(num),
      offers: p.offers.map(num),
    })),
    families: [...w.families.values()].map((f) => ({
      alive: f.alive,
      id: num(f.id),
      members: num(f.members),
      name: f.name,
      tag: f.tag,
    })),
    wars: [...w.wars.values()].map((x) => ({
      fields: [
        x.a,
        x.b,
        x.lostA,
        x.lostB,
        x.ended ? 1n : 0n,
        x.winner,
        BigInt(x.offer),
        x.offerBy,
      ].map(num),
      id: num(x.id),
    })),
    trades: [...w.trades.values()].map((t) => ({
      fields: [
        t.seller,
        t.buyer,
        BigInt(t.sold),
        t.accepted ? 1n : 0n,
        t.acceptedAt,
        t.quantity,
        t.delivered,
      ].map(num),
      id: num(t.id),
      paid: t.paid.map(num),
      price: t.price.map(num),
    })),
  };
}

function run(w: sim.World, controller: string, a: Action, now: bigint): void {
  const n = a.args.map(BigInt);
  switch (a.action) {
    case ACTION.register:
      return void sim.register(
        w,
        controller,
        { city: n[0]!, neighborhood: n[1]!, slot: n[2]! },
        now,
      );
    case ACTION.queueRoom:
      return sim.queueRoom(w, controller, n[0]!, Number(n[1]), now);
    case ACTION.queueResearch:
      return sim.queueResearch(w, controller, n[0]!, Number(n[1]), now);
    case ACTION.cancelRoom:
      return sim.cancelRoom(w, controller, n[0]!, Number(n[1]), now);
    case ACTION.cancelResearch:
      return sim.cancelResearch(w, controller, n[0]!, Number(n[1]), now);
    case ACTION.poke:
      return sim.poke(w, n[0]!, now);
    case ACTION.setGlobalPremium:
      return sim.setGlobalPremium(w, n[0]!);
    case ACTION.train:
      return sim.train(w, controller, n[0]!, Number(n[1]), n[2]!, now);
    case ACTION.cancelTraining:
      return sim.cancelTraining(w, controller, n[0]!, Number(n[1]), Number(n[2]), now);
    case ACTION.sendMission:
      return void sim.sendMission(
        w,
        controller,
        n[0]!,
        Number(n[1]),
        { city: n[2]!, neighborhood: n[3]!, slot: n[4]! },
        n.slice(5, 5 + rs.troops.length),
        n.slice(5 + rs.troops.length, 5 + rs.troops.length + rs.resources.length),
        n[5 + rs.troops.length + rs.resources.length] ?? 0n,
        now,
      );
    case ACTION.sendHiddenMission: {
      const target = { city: n[2]!, neighborhood: n[3]!, slot: n[4]! };
      const commit = sim.hiddenCommit(playerFor(w, controller), Number(n[1]), target, n[5]!);
      const troops = n.slice(7, 7 + rs.troops.length);
      const res = n.slice(7 + rs.troops.length, 7 + rs.troops.length + rs.resources.length);
      return void sim.sendHiddenMission(w, controller, n[0]!, commit, n[6]!, troops, res, now);
    }
    case ACTION.reveal:
      return sim.reveal(
        w,
        n[0]!,
        Number(n[1]),
        { city: n[2]!, neighborhood: n[3]!, slot: n[4]! },
        n[5]!,
      );
    case ACTION.recall:
      return sim.recall(w, controller, n[0]!, now);
    case ACTION.abandon:
      return sim.abandon(w, controller, n[0]!, now);
    case ACTION.advance:
      return void sim.advance(w, Number(n[0]), now);
    case ACTION.startVacation:
      return sim.startVacation(w, controller, now);
    case ACTION.endVacation:
      return sim.endVacation(w, controller, now);
    case ACTION.suspend:
      return sim.suspend(w, n[0]!, n[1]!);
    case ACTION.grantPremium:
      return sim.grantPremium(w, n[0]!, n[1]!);
    case ACTION.transferPlayer:
      return sim.transferPlayer(w, controller, String(n[0]), now);
    case ACTION.createFamily:
      return void sim.createFamily(w, controller, NAMES[Number(n[0])]!, NAMES[Number(n[1])]!, now);
    case ACTION.applyToFamily:
      return sim.applyToFamily(w, controller, n[0]!, now);
    case ACTION.withdrawApplication:
      return sim.withdrawApplication(w, controller, n[0]!, now);
    case ACTION.answerApplication:
      return n[1] === 1n
        ? sim.acceptApplication(w, controller, n[0]!, now)
        : sim.rejectApplication(w, controller, n[0]!, now);
    case ACTION.leaveFamily:
      return sim.leaveFamily(w, controller, now);
    case ACTION.kickMember:
      return sim.kickMember(w, controller, n[0]!, now);
    case ACTION.setRank:
      return sim.setRank(w, controller, n[0]!, Number(n[1]), now);
    case ACTION.handOver:
      return sim.handOver(w, controller, n[0]!, now);
    case ACTION.dissolveFamily:
      return sim.dissolveFamily(w, controller, now);
    case ACTION.declareWar:
      return void sim.declareWar(w, controller, n[0]!, now);
    case ACTION.offerPeace:
      return sim.offerPeace(w, controller, n[0]!, Number(n[1]), now);
    case ACTION.answerPeace:
      return sim.answerPeace(w, controller, n[0]!, n[1] === 1n, now);
    case ACTION.offerTrade:
      return void sim.offerTrade(w, controller, n[0]!, Number(n[1]), n[2]!, n.slice(3, 7), now);
    case ACTION.cancelTrade:
      return sim.cancelTrade(w, controller, n[0]!, now);
    case ACTION.acceptTrade:
      return sim.acceptTrade(w, controller, n[0]!, now);
    case ACTION.authorizeSession:
      return sim.authorizeSession(w, controller, String(n[0]), n[1]!, now);
    case ACTION.revokeSession:
      return sim.revokeSession(w, controller, String(n[0]), now);
    case ACTION.addController:
      return sim.addController(w, controller, String(n[0]), now);
    case ACTION.removeController:
      return sim.removeController(w, controller, String(n[0]), now);
  }
  throw new Error(`unknown action ${a.action}`);
}

/** Try an action; returns the error code, or "" on success. Failed actions leave no trace (atomic). */
function attempt(w: sim.World, controller: string, a: Action, now: bigint): string {
  try {
    run(w, controller, a, now);
    return "";
  } catch (e) {
    if (!(e instanceof sim.GameError)) throw e;
    return e.code;
  }
}

const reqsMet = (
  w: sim.World,
  b: sim.Building,
  reqs: { kind: string; index: number; level: bigint }[],
) => {
  const p = w.players.get(b.owner)!;
  return reqs.every(
    (q) => (q.kind === "room" ? b.levels[q.index]! : p.research[q.index]!) >= q.level,
  );
};

// ------------------------------------------------------------------ random core scenarios

function randomScenario(seed: number) {
  SESSIONS.clear();
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const w = sim.newWorld(rs);
  // Premium scenarios have a single actor, so bursts pile up in one queue.
  const actors = seed % 2 === 1 ? 1 : 2 + Math.floor(r() * 4);
  let now = T0;
  const steps = [];
  for (let s = 0; s < RANDOM.steps; s++) {
    const roll = r();
    // With premium, bursts of actions in the same second build long queues.
    if (!(w.globalPremiumUntil > now && r() < 0.4))
      now += BigInt(
        Math.floor(roll < 0.5 ? r() * 600 : roll < 0.85 ? r() * 20_000 : r() * 400_000),
      );
    const actor = Math.floor(r() * actors);
    const controller = String(actor);
    const pid = w.playerOf.get(controller);
    const own = pid ? [...w.buildings.values()].filter((b) => b.owner === pid) : [];
    let a: Action;
    if (s === 0 && seed % 2 === 1) {
      // Premium from the start: long queues, deferred payment and dropped items (D-11).
      a = { action: ACTION.setGlobalPremium, args: [Number(T0) + 10_000_000] };
    } else if (r() < 0.04) {
      a = {
        action: ACTION.setGlobalPremium,
        args: [r() < 0.7 ? Number(now) + Math.floor(r() * 300_000) : 0],
      };
    } else if (pid === undefined || r() < 0.03) {
      a = {
        action: ACTION.register,
        args: [1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 40)],
      };
    } else {
      const b = pick(own);
      const k = r();
      if (k < (w.globalPremiumUntil > now ? 0.6 : 0.5)) {
        const ok = rs.buildings.filter((x) => reqsMet(w, b, x.requirements));
        const school = rs.roles.researchSpeedRoom;
        const room =
          r() < 0.2
            ? Math.floor(r() * rs.buildings.length)
            : b.levels[school] === 0n && r() < 0.4
              ? school
              : pick(ok).index;
        a = { action: ACTION.queueRoom, args: [Number(b.id), room] };
      } else if (k < 0.75) {
        const ok = rs.research.filter((x) => reqsMet(w, b, x.requirements));
        const res =
          ok.length > 0 && r() < 0.8 ? pick(ok).index : Math.floor(r() * rs.research.length);
        a = { action: ACTION.queueResearch, args: [Number(b.id), res] };
      } else if (k < 0.82)
        a = { action: ACTION.cancelRoom, args: [Number(b.id), Math.floor(r() * 3)] };
      else if (k < 0.87)
        a = { action: ACTION.cancelResearch, args: [Number(b.id), Math.floor(r() * 3)] };
      else a = { action: ACTION.poke, args: [Number(pick([...w.buildings.keys()]))] };
    }
    const error = attempt(w, controller, a, now);
    steps.push({
      action: a.action,
      actor,
      args: a.args,
      error,
      state: snapshot(w),
      time: num(now),
    });
  }
  return { actors, seed, steps };
}

// ------------------------------------------------------------------ bot scenarios

const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
const research = (id: string) => rs.research.findIndex((x) => x.id === id);
const troop = (id: string) => rs.troops.findIndex((t) => t.id === id);

/** Long-term goals of a bot: rooms and research up to these levels, in priority order. */
const ROOM_GOALS: [string, number][] = [
  ["boot_camp", 1],
  ["mob_school", 1],
  ["brewery", 2],
  ["bar", 2],
  ["weapons_armoury", 5],
  ["ammunition_depot", 5],
  ["weapon_storage", 1],
  ["bar", 5],
  ["safe_room", 1],
  ["ammunition_storage", 1],
  ["boss_office", 3],
  ["brewery", 5],
  ["boot_camp", 2],
  ["security", 1],
  ["mob_school", 3],
  ["alcohol_storage", 1],
];
const RESEARCH_GOALS: [string, number][] = [
  ["routing", 5],
  ["extortion", 2],
  ["strategies", 1],
  ["smuggling", 2],
  ["honor", 2],
];

function botCandidates(
  w: sim.World,
  controller: string,
  r: () => number,
  now: bigint,
  hidden = false,
): Action[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const pid = w.playerOf.get(controller)!;
  const p = w.players.get(pid)!;
  const own = [...w.buildings.values()].filter((b) => b.owner === pid);
  const others = [...w.buildings.values()].filter((b) => b.owner !== pid);
  const b = pick(own);
  const out: Action[] = [];
  const send = (
    kind: number,
    to: sim.Building["coord"],
    troops: number[],
    res = [0, 0, 0, 0],
    trade = 0,
  ): Action => {
    if (hidden && trade === 0 && r() < 0.85) return hide(w, b, kind, to, troops, res, r);
    return {
      action: ACTION.sendMission,
      args: [
        Number(b.id),
        kind,
        Number(to.city),
        Number(to.neighborhood),
        Number(to.slot),
        ...troops,
        ...res,
        trade,
      ],
    };
  };
  const army = (share: number) =>
    b.troops.map((n, i) => (rs.troops[i]!.isAttack ? Math.ceil(Number(n) * share) : 0));

  if (sim.onVacation(p, now) && r() < 0.5) return [{ action: ACTION.endVacation, args: [] }];
  const roll = r();
  if (roll >= 0.7) return socialCandidates(w, p, b, r, now, send, army);
  if (roll < 0.22 * 0.7) {
    for (const [id, lvl] of ROOM_GOALS)
      if (b.levels[room(id)]! < BigInt(lvl) && reqsMet(w, b, rs.buildings[room(id)]!.requirements))
        out.push({ action: ACTION.queueRoom, args: [Number(b.id), room(id)] });
  } else if (roll < 0.32 * 0.7) {
    for (const [id, lvl] of RESEARCH_GOALS)
      if (p.research[research(id)]! < BigInt(lvl))
        out.push({ action: ACTION.queueResearch, args: [Number(b.id), research(id)] });
  } else if (roll < 0.55 * 0.7) {
    const occ = rs.roles.occupationTroop;
    if (p.research[research("routing")]! >= 5n && b.troops[occ] === 0n)
      out.push({ action: ACTION.train, args: [Number(b.id), occ, 1] });
    out.push({
      action: ACTION.train,
      args: [
        Number(b.id),
        pick([troop("rowdy"), troop("mover"), troop("bouncer"), troop("knifer")]),
        1 + Math.floor(r() * 6),
      ],
    });
    out.push({
      action: ACTION.train,
      args: [
        Number(b.id),
        pick([troop("clandestine_workers"), troop("safeguard")]),
        1 + Math.floor(r() * 4),
      ],
    });
  } else if (roll < 0.85 * 0.7) {
    const occ = rs.roles.occupationTroop;
    if (b.troops[occ]! > 0n) {
      // Occupy a nearby empty slot; take some escorts along.
      const t = army(0.3);
      t[occ] = 1;
      const slot = 1 + Math.floor(r() * 60);
      out.push(send(sim.OCCUPY, { city: 1n, neighborhood: 1n, slot: BigInt(slot) }, t));
    }
    if (others.length > 0 && b.troops.some((n, i) => n > 0n && rs.troops[i]!.isAttack))
      out.push(send(sim.ATTACK, pick(others).coord, army(r() < 0.5 ? 1 : 0.5)));
    const mine = own.filter((x) => x.id !== b.id);
    if (mine.length > 0) {
      const dest = pick(mine).coord;
      const t = army(0.5);
      out.push(send(sim.STATION, dest, t));
      const res = [Math.floor(r() * 500), Math.floor(r() * 500), 0, Math.floor(r() * 200)];
      out.push(send(sim.TRANSPORT, dest, t, res));
    }
    if (others.length > 0)
      out.push(send(sim.TRANSPORT, pick(others).coord, army(0.2), [100, 100, 0, 0]));
  } else if (roll < 0.92 * 0.7) {
    const mine = [...w.missions.values()].filter((m) => m.owner === pid && !m.returning);
    if (mine.length > 0) out.push({ action: ACTION.recall, args: [num(pick(mine).id)] });
    else out.push({ action: ACTION.recall, args: [1 + Math.floor(r() * 5)] });
  } else if (roll < 0.96 * 0.7) {
    // Mostly abandon a building that has a mission out, so a return to a lost building happens.
    const away = own.filter((x) => [...w.missions.values()].some((m) => m.origin === x.id));
    out.push({
      action: ACTION.abandon,
      args: [Number(pick(away.length > 0 && r() < 0.7 ? away : own).id)],
    });
  } else if (roll < 0.98 * 0.7) {
    const q = Math.floor(r() * 2);
    out.push({ action: ACTION.cancelTraining, args: [Number(b.id), q, Math.floor(r() * 2)] });
  } else {
    out.push({ action: ACTION.advance, args: [1 + Math.floor(r() * 3)] });
  }
  return out;
}

/**
 * The same mission, hidden (B-22): usually an honest random cover, sometimes one that fails at send
 * (0, beyond the map) or at reveal (shorter than the distance), or cargo on a non-transport.
 */
function hide(
  w: sim.World,
  b: sim.Building,
  kind: number,
  to: sim.Building["coord"],
  troops: number[],
  res: number[],
  r: () => number,
): Action {
  const d = Number(distance(rs, b.coord, to) / rs.config.distanceUnit);
  const k = r();
  const cover =
    k < 0.04
      ? 0
      : k < 0.08
        ? 5000
        : k < 0.14 && d > 1
          ? d - 1
          : d + Math.floor(r() * (Math.max(Math.ceil(d / 2), 20) + 1));
  const cargo = kind !== sim.TRANSPORT && r() < 0.03 ? [10, 0, 0, 0] : res;
  const salt = 1 + Math.floor(r() * 1_000_000_000);
  return {
    action: ACTION.sendHiddenMission,
    args: [
      Number(b.id),
      kind,
      Number(to.city),
      Number(to.neighborhood),
      Number(to.slot),
      salt,
      cover,
      ...troops,
      ...cargo,
    ],
  };
}

/** Reveals anyone could send now: due hidden missions first, sometimes with a wrong salt. */
function revealCandidates(w: sim.World, r: () => number, now: bigint): Action[] {
  const out: Action[] = [];
  for (const m of w.missions.values()) {
    const secret = SECRETS.get(num(m.id));
    if (!m.hidden || m.returning || !secret) continue;
    const due = m.arrival <= now;
    if (r() < (due ? 0.5 : 0.05)) {
      const wrong = r() < 0.1;
      out.push({
        action: ACTION.reveal,
        args: [num(m.id), ...secret.slice(0, 4), wrong ? secret[4]! + 1 : secret[4]!],
      });
    }
  }
  return out;
}

type Send = (
  kind: number,
  to: sim.Building["coord"],
  troops: number[],
  res?: number[],
  trade?: number,
) => Action;

/** Families, wars, market, vacation and transfer (3c). */
function socialCandidates(
  w: sim.World,
  p: sim.Player,
  b: sim.Building,
  r: () => number,
  now: bigint,
  send: Send,
  army: (share: number) => number[],
): Action[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const out: Action[] = [];
  const f = sim.familyOf(w, p);
  const families = [...w.families.values()].filter((x) => x.alive);
  const others = [...w.players.values()].filter((x) => x.id !== p.id);
  const roll = r();
  if (roll < 0.45) {
    if (f === 0n) {
      if (families.length > 0 && r() < 0.6)
        out.push({ action: ACTION.applyToFamily, args: [num(pick(families).id)] });
      out.push({
        action: ACTION.createFamily,
        args: [Math.floor(r() * NAMES.length), Math.floor(r() * NAMES.length)],
      });
      if (p.applications.length > 0)
        out.push({ action: ACTION.withdrawApplication, args: [num(pick(p.applications))] });
    } else {
      const members = [...w.players.values()].filter(
        (x) => x.id !== p.id && sim.familyOf(w, x) === f,
      );
      const applicants = [...w.players.values()].filter((x) => x.applications.includes(f));
      if (applicants.length > 0)
        out.push({
          action: ACTION.answerApplication,
          args: [num(pick(applicants).id), r() < 0.8 ? 1 : 0],
        });
      const enemies = families.filter((x) => x.id !== f);
      if (enemies.length > 0 && r() < 0.5)
        out.push({ action: ACTION.declareWar, args: [num(pick(enemies).id)] });
      const wars = [...w.wars.values()].filter(
        (x) => sim.warBetween(w, x.a, x.b) === x.id && (x.a === f || x.b === f),
      );
      if (wars.length > 0) {
        const war = pick(wars);
        if (war.offer !== sim.OFFER_NONE && war.offerBy !== f)
          out.push({ action: ACTION.answerPeace, args: [num(war.id), r() < 0.6 ? 1 : 0] });
        out.push({
          action: ACTION.offerPeace,
          args: [num(war.id), r() < 0.5 ? sim.OFFER_SURRENDER : sim.OFFER_DRAW],
        });
      }
      if (members.length > 0) {
        const m = pick(members);
        const k = r();
        if (k < 0.4)
          out.push({
            action: ACTION.setRank,
            args: [num(m.id), r() < 0.5 ? sim.SUBCAPO : sim.MEMBER],
          });
        else if (k < 0.6) out.push({ action: ACTION.kickMember, args: [num(m.id)] });
        else if (k < 0.75) out.push({ action: ACTION.handOver, args: [num(m.id)] });
      }
      if (r() < 0.15) out.push({ action: ACTION.leaveFamily, args: [] });
      if (r() < 0.05) out.push({ action: ACTION.dissolveFamily, args: [] });
    }
  } else if (roll < 0.85) {
    const trades = [...w.trades.values()];
    const mine = trades.filter((t) => t.buyer === p.id && !t.accepted);
    if (mine.length > 0) out.push({ action: ACTION.acceptTrade, args: [num(pick(mine).id)] });
    const open = trades.filter((t) => t.accepted && sim.tradeOpenFor(w, t.id, p.id, now));
    if (open.length > 0) {
      const t = pick(open);
      const counterparty = w.players.get(t.seller === p.id ? t.buyer : t.seller)!;
      const dest = [...w.buildings.values()].find((x) => x.owner === counterparty.id);
      if (dest) {
        const res = [0, 0, 0, 0];
        if (t.seller === p.id)
          res[t.sold] = Math.max(1, Math.min(150, num(t.quantity - t.delivered)));
        else t.price.forEach((x, i) => (res[i] = Math.min(150, num(x - t.paid[i]!))));
        if (r() < 0.2) res[(t.sold + 1) % 4]! += 10; // sometimes a shipment that does not settle
        out.push(send(sim.TRANSPORT, dest.coord, army(0.4), res, num(t.id)));
      }
    }
    if (others.length > 0) {
      const buyer = num(pick(others).id);
      const offers = [
        [0, 300, 0, 0, 0, 100], // 3-5-1: 300 weapons for 100 dollars
        [0, 200, 0, 400, 0, 0], // 2-4-1: 200 weapons for 400 ammunition
        [1, 500, 0, 0, 0, 100], // 3-5-1: 500 ammunition for 100 dollars
        [0, 300, 0, 0, 0, 99], // unfair: rejected
      ];
      const [sold, qty, ...price] = pick(offers);
      out.push({ action: ACTION.offerTrade, args: [buyer, sold!, qty!, ...price] });
    }
    const cancellable = trades.filter(
      (t) => !t.accepted && (t.seller === p.id || t.buyer === p.id),
    );
    if (cancellable.length > 0 && r() < 0.3)
      out.push({ action: ACTION.cancelTrade, args: [num(pick(cancellable).id)] });
  } else if (roll < 0.95) {
    out.push({ action: ACTION.startVacation, args: [] });
  } else {
    out.push({ action: ACTION.transferPlayer, args: [1000 + Math.floor(r() * 1000)] });
  }
  void b;
  return out;
}

function botScenario(seed: number, hidden = false) {
  SESSIONS.clear();
  SECRETS.clear();
  const r = rng(seed);
  const w = sim.newWorld(rs);
  const actors = 2 + Math.floor(r() * 3);
  let now = T0;
  const steps: unknown[] = [];
  const record = (actor: number, a: Action, error: string) =>
    steps.push({
      action: a.action,
      actor,
      args: a.args,
      error,
      state: snapshot(w),
      time: num(now),
    });

  // Premium for everybody (long queues), then the players register next to each other.
  const premium = { action: ACTION.setGlobalPremium, args: [Number(T0) + 100_000_000] };
  record(0, premium, attempt(w, "admin", premium, now));
  for (let i = 0; i < actors; i++) {
    const reg = { action: ACTION.register, args: [1, 1, 1 + i * 7] };
    record(i, reg, attempt(w, String(i), reg, now));
  }
  // Players keep their seat when the account is transferred or gets more devices (B-26): the
  // seat's controllers change. Ids 2000+ are extra devices.
  const owners = Array.from({ length: actors }, (_, i) => [i]);
  let nextDevice = 2000;
  // Each seat may have a session key (B-15) that plays for it; ids 500+ never control a player.
  const sessions: (number | undefined)[] = Array.from({ length: actors }, () => undefined);
  let nextSession = 500;
  while (steps.length < (hidden ? HIDDEN : BOTS).steps) {
    // Hours to a couple of days between actions: months of game time in total.
    const before = now;
    now += BigInt(Math.floor(r() < 0.6 ? r() * 60_000 : r() * 300_000));
    if (hidden && r() < 0.4) {
      // Land right after the next hidden arrival, often within its reveal grace.
      const next = [...w.missions.values()]
        .filter((m) => m.hidden && !m.returning && m.arrival > before)
        .sort((a, b) => (a.arrival < b.arrival ? -1 : 1))[0];
      if (next) now = next.arrival + BigInt(Math.floor(r() * 90));
    }
    if (r() < 0.03) {
      // The admin suspends, lifts or grants premium to a random player.
      const player = 1 + Math.floor(r() * actors);
      const k = r();
      const a =
        k < 0.4
          ? { action: ACTION.suspend, args: [player, Number(now) + Math.floor(r() * 200_000)] }
          : k < 0.6
            ? { action: ACTION.suspend, args: [player, 0] }
            : {
                action: ACTION.grantPremium,
                args: [player, Number(now) + Math.floor(r() * 3_000_000)],
              };
      record(0, a, attempt(w, "admin", a, now));
      continue;
    }
    const seat = Math.floor(r() * actors);
    const seatOwners = owners[seat]!;
    const owner = seatOwners[Math.floor(r() * seatOwners.length)]!;
    const controller = String(owner);
    const session = sessions[seat];
    // Half the time the seat plays through its session key, as a real client does.
    const actor = session !== undefined && r() < 0.5 ? session : owner;
    const candidates: Action[] = [];
    const k = r();
    if (k < 0.04) {
      // A new device, or renewing the current one; sometimes too long, sometimes another seat's.
      const target =
        r() < 0.15 && sessions.some((x) => x !== undefined)
          ? sessions.find((x) => x !== undefined)!
          : session !== undefined && r() < 0.5
            ? session
            : nextSession++;
      const span = r() < 0.1 ? num(rs.config.maxSessionSeconds) + 1 : Math.floor(r() * 1_500_000);
      SESSIONS.add(String(target));
      candidates.push({ action: ACTION.authorizeSession, args: [target, Number(now) + span] });
    } else if (k < 0.05 && session !== undefined) {
      candidates.push({ action: ACTION.revokeSession, args: [session] });
    } else if (k < 0.075) {
      // Another device or a recovery code; sometimes an address already in use.
      const other = owners[Math.floor(r() * actors)]![0]!;
      const target =
        r() < 0.15 ? other : r() < 0.05 && session !== undefined ? session : nextDevice++;
      candidates.push({ action: ACTION.addController, args: [target] });
    } else if (k < 0.09) {
      // Drop a device (maybe itself, maybe the last one); sometimes another seat's.
      const pool = r() < 0.15 ? owners[Math.floor(r() * actors)]! : seatOwners;
      candidates.push({
        action: ACTION.removeController,
        args: [pool[Math.floor(r() * pool.length)]!],
      });
    }
    if (hidden) candidates.push(...revealCandidates(w, r, now));
    candidates.push(...botCandidates(w, controller, r, now, hidden));
    if (candidates.length === 0) continue;
    // Usually the first candidate that works; sometimes a failing one, to test reverts too.
    let chosen = candidates[0]!;
    let error = "";
    for (const c of candidates) {
      chosen = c;
      error = attempt(w, String(actor), c, now);
      if (error === "" || r() < 0.15) break;
    }
    if (chosen.action === ACTION.transferPlayer && error === "") owners[seat] = [chosen.args[0]!];
    if (chosen.action === ACTION.addController && error === "") seatOwners.push(chosen.args[0]!);
    if (chosen.action === ACTION.removeController && error === "")
      seatOwners.splice(seatOwners.indexOf(chosen.args[0]!), 1);
    if (chosen.action === ACTION.authorizeSession && error === "") sessions[seat] = chosen.args[0]!;
    if (chosen.action === ACTION.sendHiddenMission && error === "")
      SECRETS.set(num(w.nextMission) - 1, chosen.args.slice(1, 6));
    record(actor, chosen, error);
    // A session that expired, was revoked or died with a transfer is dropped after one more try.
    const live = sessions[seat];
    if (live !== undefined && sim.sessionPlayer(w, String(live), now) === undefined)
      sessions[seat] = undefined;
  }
  return { actors, seed, steps };
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../generated/scenarios/vendetta");
rmSync(join(here, "../generated/scenarios"), { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const scenarios = [
  ...Array.from({ length: RANDOM.count }, (_, i) => randomScenario(20261015 + i)),
  ...Array.from({ length: BOTS.count }, (_, i) => botScenario(20271015 + i)),
  ...Array.from({ length: HIDDEN.count }, (_, i) => botScenario(20281015 + i, true)),
];
// One file per scenario: Foundry pays memory gas for every byte it reads.
scenarios.forEach((sc, i) =>
  writeFileSync(join(dir, `${String(i).padStart(2, "0")}.json`), JSON.stringify(sc) + "\n"),
);
writeFileSync(join(dir, "index.json"), JSON.stringify({ count: scenarios.length }) + "\n");
const steps = scenarios.flatMap((s) => s.steps) as { action: number; error: string }[];
const count = (a: number) => steps.filter((x) => x.action === a && x.error === "").length;
console.log(
  `packages/rules/generated/scenarios/vendetta/: ${scenarios.length} scenarios, ${steps.length} steps, ` +
    `${steps.filter((x) => x.error).length} expected reverts; ok: ${count(ACTION.train)} train, ` +
    `${count(ACTION.sendMission)} missions, ${count(ACTION.sendHiddenMission)} hidden, ` +
    `${count(ACTION.reveal)} reveals, ${steps.filter((x) => x.error === "Unrevealed").length} unrevealed, ` +
    `${count(ACTION.recall)} recalls, ${count(ACTION.abandon)} abandons, ` +
    `${count(ACTION.authorizeSession)} sessions, ${count(ACTION.addController)} + ` +
    `${count(ACTION.removeController)} - controllers`,
);
