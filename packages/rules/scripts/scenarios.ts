// Generates scenarios (sequences of actions over time) and the state after every step, computed by
// the TypeScript simulator. Foundry replays them against the Game contract
// (contracts/test/core/Scenarios.t.sol): any difference between the two implementations fails.
// Deterministic (seeded); output committed. Run with `pnpm codegen`.
//
// Four kinds:
//  - random: random core actions (queues, cancels, premium) by a few players, mostly reverts and edges;
//  - bots: players that grow, train, attack, transport, station, occupy, recall and abandon over
//    months of game time, so battles, loot, occupations and returns to lost buildings happen;
//  - hidden: bots that send hidden missions (B-22) and reveal them on time, late, wrongly or never;
//  - market: bots that trade, under- and over-deliver, default, claim, pay back and run into the
//    debt restrictions (D-19, B-11). The generator checks that every case it is meant to cover
//    happened (see MARKET_COVERAGE).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distance, sim, vendetta as rs } from "../src/index.js";

const RANDOM = { count: 16, steps: 80 };
const BOTS = { count: 8, steps: 400 };
const HIDDEN = { count: 4, steps: 400 };
const MARKET = { count: 4, steps: 400 }; // random ones, after the scripted one
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
  addController: 35, // [controller (actor id), recovery 0/1]
  removeController: 36, // [controller (actor id)]: itself at once; another one schedules, then executes once due
  sendHiddenMission: 37, // [building, kind, city, neighborhood, slot, salt, cover, troops × 21, resources × 4]
  reveal: 38, // [mission, kind, city, neighborhood, slot, salt]
  claimTrade: 39, // [trade, fromBuilding, toBuilding, amount × 4]
  cancelRemoval: 40, // [controller (actor id)]
  cancelTransfer: 41, // []
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

/** `cover`: what a market action is meant to exercise, if it works out (MARKET_COVERAGE). */
type Action = { action: number; args: number[]; cover?: string };

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
      // Parallel to controllers: a recovery code (B-15), and when a scheduled removal is due (B-26).
      recovery: p.controllers.map((c) => (p.recovery.has(c) ? 1 : 0)),
      removal_at: p.controllers.map((c) => num(p.removalAt.get(c) ?? 0n)),
      social: [
        p.vacationUntil,
        p.suspendedUntil,
        p.premiumUntil,
        p.family,
        BigInt(p.rank),
        p.sessionEpoch,
        p.vacationStart,
        BigInt(p.debts),
        p.tradeLockUntil,
        p.transferTo === "" ? 0n : BigInt(p.transferTo),
        p.transferAt,
      ].map(num),
      applications: p.applications.map(num),
      offers: p.offers.map(num),
      // Registered unpaid debts to every player (by id), as the contract's owes mapping.
      owes: [...w.players.keys()].map((c) => sim.owes(w, p.id, c)),
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
        BigInt(t.rate),
        t.registered ? 1n : 0n,
      ].map(num),
      id: num(t.id),
      paid: t.paid.map(num),
      price: t.price.map(num),
      returned: t.returned.map(num),
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
    case ACTION.claimTrade:
      return sim.claimTrade(w, controller, n[0]!, n[1]!, n[2]!, n.slice(3, 7), now);
    case ACTION.authorizeSession:
      return sim.authorizeSession(w, controller, String(n[0]), n[1]!, now);
    case ACTION.revokeSession:
      return sim.revokeSession(w, controller, String(n[0]), now);
    case ACTION.addController:
      return sim.addController(w, controller, String(n[0]), n[1] === 1n, now);
    case ACTION.removeController:
      return sim.removeController(w, controller, String(n[0]), now);
    case ACTION.cancelRemoval:
      return sim.cancelRemoval(w, controller, String(n[0]), now);
    case ACTION.cancelTransfer:
      return sim.cancelTransfer(w, controller, now);
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
    const bouncer = BOUNCERS.has(num(m.id));
    if ((due && bouncer) || r() < (due ? 0.5 : 0.05)) {
      const wrong = !bouncer && r() < 0.1;
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
  } else if (p.transferTo !== "" && r() < 0.3) {
    out.push({ action: ACTION.cancelTransfer, args: [] });
  } else {
    // Mostly the pending target again, so the transfer executes once due (B-26).
    const to =
      p.transferTo !== "" && r() < 0.7 ? Number(p.transferTo) : 1000 + Math.floor(r() * 1000);
    out.push({ action: ACTION.transferPlayer, args: [to] });
  }
  void b;
  return out;
}

// ------------------------------------------------------------------ market scenarios (D-19, B-11)

/** What the market scenarios must exercise at least once, together; the generator fails otherwise. */
const MARKET_COVERAGE = [
  "buyer-debtor", // a closed window where the buyer owes
  "seller-debtor", // a closed window where the seller owes
  "no-debt", // a closed window with both sides even (complete, or nothing sent)
  "over-shipment", // a shipment beyond what remained, or with other resources, counted in part
  "claim", // a successful claim
  "claim-repeated", // a second claim on the same trade
  "claim-over-debt", // InvalidClaim: more than remains
  "claim-over-stock", // InvalidClaim: more than the debtor's building holds
  "claim-over-capacity", // InvalidClaim: more than the creditor's building can take
  "claim-zero", // InvalidClaim: nothing claimed
  "claim-not-creditor", // InvalidTrade: the debtor claims its own debt
  "claim-early", // InvalidTrade: a claim inside the window
  "claim-not-owner", // NotOwner: into a building that is not the creditor's
  "voluntary-payment", // the debtor's transport naming the trade after the window
  "debt-transport", // InDebt: a debtor's transport to a third party
  "debt-transport-allowed", // a debtor's transport to a creditor or to itself leaves
  "debt-offer", // InDebt on offerTrade
  "debt-accept", // InDebt on acceptTrade
  "debt-vacation", // InDebt on startVacation
  "window-vacation", // TradeOpen on startVacation
  "hidden-bounce", // a debtor's hidden transport to a third party turns back with its cargo
  "claim-second-creditor", // a claim on a debtor already registered by someone else
  "two-creditors", // one debtor registered with two creditors at once
] as const;

/** The revert each tagged action is meant to produce ("" = it must succeed). */
const EXPECTED: Record<string, string> = {
  "claim-over-debt": "InvalidClaim",
  "claim-over-stock": "InvalidClaim",
  "claim-over-capacity": "InvalidClaim",
  "claim-zero": "InvalidClaim",
  "claim-not-creditor": "InvalidTrade",
  "claim-early": "InvalidTrade",
  "claim-not-owner": "NotOwner",
  "debt-transport": "InDebt",
  "debt-offer": "InDebt",
  "debt-accept": "InDebt",
  "debt-vacation": "InDebt",
  "window-vacation": "TradeOpen",
};

const COVERED = new Set<string>();
/** Scheduled removals and transfers the bots executed once due (B-26); none means the bias is off. */
const EXECUTED = { removals: 0, transfers: 0 };
/** Hidden transports a debtor sent to a third party: they must come back with their cargo. */
const BOUNCERS = new Set<number>();
/** Successful claims per trade. */
const CLAIMS = new Map<number, number>();

/** The world as the action will see it: due missions processed and both buildings settled. */
function settledClaimable(
  w: sim.World,
  t: sim.Trade,
  from: sim.Building,
  to: sim.Building,
  now: bigint,
): { max: bigint[]; stock: bigint[]; free: bigint[] } {
  const { rs: ruleset, ...rest } = w;
  const c = Object.assign(structuredClone(rest), { rs: ruleset }) as sim.World;
  sim.processDue(c, now, Number.MAX_SAFE_INTEGER);
  const f = c.buildings.get(from.id);
  const o = c.buildings.get(to.id);
  const zero = rs.resources.map(() => 0n);
  if (!f || !o) return { max: zero, stock: zero, free: zero };
  sim.settle(c, f, now);
  sim.settle(c, o, now);
  const scale = sim.stockScale(rs);
  const cap = sim.capacities(c, o);
  return {
    max: sim.claimable(c, c.trades.get(t.id)!, f, o),
    stock: f.stock.map((x) => x / scale),
    free: cap.map((x, r) => (x > o.stock[r]! ? (x - o.stock[r]!) / scale : 0n)),
  };
}

/** Trades, deliveries, defaults, claims, payments and the debt restrictions, for player `p` at `b`. */
function marketCandidates(
  w: sim.World,
  p: sim.Player,
  b: sim.Building,
  r: () => number,
  now: bigint,
): Action[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const out: Action[] = [];
  const trades = [...w.trades.values()];
  const others = [...w.players.values()].filter((x) => x.id !== p.id);
  const buildingsOf = (id: bigint) => [...w.buildings.values()].filter((x) => x.owner === id);
  const troops = b.troops.map((n, i) => (rs.troops[i]!.isAttack ? Math.ceil(Number(n) * 0.5) : 0));
  const canSend = troops.some((n) => n > 0);
  const indebted = p.debts > 0;
  const transport = (
    to: sim.Building["coord"],
    res: number[],
    trade = 0,
    cover?: string,
  ): Action => ({
    action: ACTION.sendMission,
    args: [
      Number(b.id),
      sim.TRANSPORT,
      Number(to.city),
      Number(to.neighborhood),
      Number(to.slot),
      ...troops,
      ...res,
      trade,
    ],
    cover,
  });
  const claim = (
    t: sim.Trade,
    from: bigint,
    to: bigint,
    amount: bigint[],
    cover: string,
  ): Action => ({
    action: ACTION.claimTrade,
    args: [num(t.id), num(from), num(to), ...amount.map(num)],
    cover,
  });

  // Spend: a batch of rowdies drains ammunition and weapons (claims need free capacity, and
  // transports need troops); a mob school drains both plus dollars.
  if (r() < 0.5) {
    if (b.levels[room("boot_camp")]! > 0n) {
      // Movers carry 10000 each: with them shipments, and so debts, get large.
      const mover = r() < 0.35;
      out.push({
        action: ACTION.train,
        args: [Number(b.id), troop(mover ? "mover" : "rowdy"), mover ? 1 : 2 + Math.floor(r() * 6)],
      });
    } else out.push({ action: ACTION.queueRoom, args: [Number(b.id), room("boot_camp")] });
    if (r() < 0.3) out.push({ action: ACTION.queueRoom, args: [Number(b.id), room("mob_school")] });
  }

  // After the window: the debtor pays back, the creditor claims, the rest try and fail.
  const closed = trades.filter((t) => t.accepted && now > sim.tradeWindow(w, t));
  for (const t of closed) {
    const d = sim.tradeDebt(w, t);
    if (!sim.inDefault(d)) continue;
    const creditorBuildings = buildingsOf(d.creditor);
    const debtorBuildings = buildingsOf(d.debtor);
    if (d.debtor === p.id) {
      if (creditorBuildings.length > 0 && canSend && r() < 0.35) {
        const res = d.remaining.map((x) => (x === 0n ? 0 : Math.max(1, Math.ceil(num(x) * r()))));
        if (r() < 0.3) res[res.findIndex((x) => x > 0)]! += 1 + Math.floor(r() * 30);
        out.push(transport(creditorBuildings[0]!.coord, res, num(t.id), "voluntary-payment"));
      }
      if (creditorBuildings.length > 0 && r() < 0.3) {
        out.push(claim(t, b.id, creditorBuildings[0]!.id, d.remaining, "claim-not-creditor"));
      }
    } else if (d.creditor === p.id && debtorBuildings.length > 0) {
      // Usually a random building of the debtor; sometimes the one holding least of what is owed.
      let from = pick(debtorBuildings);
      if (r() < 0.4) {
        const scale = sim.stockScale(rs);
        const least = (x: sim.Building) =>
          d.remaining.reduce(
            (m, o, i) => (o > 0n && x.stock[i]! / scale < m ? x.stock[i]! / scale : m),
            2n ** 64n,
          );
        from = debtorBuildings.reduce((a, x) => (least(x) < least(a) ? x : a));
      }
      const { max, stock, free } = settledClaimable(w, t, from, b, now);
      const owedIdx = d.remaining.map((x, i) => (x > 0n ? i : -1)).filter((i) => i >= 0);
      const only = (i: number, v: bigint) => rs.resources.map((_, k) => (k === i ? v : 0n));
      const k = r();
      if (max.some((x) => x > 0n)) {
        const debtor = w.players.get(d.debtor)!;
        // A small claim on a debtor someone else already registered keeps both debts alive.
        if (debtor.debts > 0 && sim.owes(w, d.debtor, p.id) === 0) {
          const part = max.map((x) => (x > 4n ? x / 4n : x));
          out.push(claim(t, from.id, b.id, part, "claim-second-creditor"));
        }
        if (k < 0.25) out.push(claim(t, from.id, b.id, max, "claim"));
        else if (k < 0.7) {
          const div = 2n + BigInt(Math.floor(r() * 4));
          out.push(
            claim(
              t,
              from.id,
              b.id,
              max.map((x) => (x > 1n ? x / div : x)),
              "claim",
            ),
          );
        }
      }
      if (k >= 0.7 || max.every((x) => x === 0n)) {
        const i = pick(owedIdx);
        const bound = r();
        if (bound < 0.3)
          out.push(claim(t, from.id, b.id, only(i, d.remaining[i]! + 1n), "claim-over-debt"));
        else if (bound < 0.5) {
          // The debtor's stock binds: ask one more than a building holds, still within the debt.
          for (const x of debtorBuildings) {
            const held = settledClaimable(w, t, x, b, now).stock;
            const j = owedIdx.find((i) => held[i]! < d.remaining[i]!);
            if (j === undefined) continue;
            out.push(claim(t, x.id, b.id, only(j, held[j]! + 1n), "claim-over-stock"));
            break;
          }
        } else if (bound < 0.75) {
          // The creditor's free capacity binds: one more than fits, within the debt and the stock.
          const j = owedIdx.find((x) => free[x]! < d.remaining[x]! && free[x]! < stock[x]!);
          if (j !== undefined)
            out.push(claim(t, from.id, b.id, only(j, free[j]! + 1n), "claim-over-capacity"));
        } else if (bound < 0.88) out.push(claim(t, from.id, b.id, [0n, 0n, 0n, 0n], "claim-zero"));
        else out.push(claim(t, from.id, from.id, max, "claim-not-owner"));
      }
    }
  }

  // Offers made to me, and new offers; both revert while in debt.
  for (const t of trades.filter((x) => x.buyer === p.id && !x.accepted)) {
    if (r() < 0.7)
      out.push({
        action: ACTION.acceptTrade,
        args: [num(t.id)],
        cover: indebted ? "debt-accept" : undefined,
      });
  }
  if (others.length > 0 && r() < 0.5) {
    const offers = [
      [0, 300, 0, 0, 0, 100], // 3-5-1: 300 weapons for 100 dollars
      [0, 200, 0, 400, 0, 0], // 2-4-1: 200 weapons for 400 ammunition
      [1, 500, 0, 0, 0, 100], // 3-5-1: 500 ammunition for 100 dollars
      [1, 400, 200, 0, 0, 0], // 2-4-1: 400 ammunition for 200 weapons
      [3, 100, 300, 0, 0, 0], // 3-5-1: 100 dollars for 300 weapons
      [3, 50, 0, 250, 0, 0], // 3-5-1: 50 dollars for 250 ammunition
    ];
    const [sold, qty, ...price] = pick(offers);
    const mult = r() < 0.2 ? 8 + Math.floor(r() * 8) : 1 + Math.floor(r() * 3);
    out.push({
      action: ACTION.offerTrade,
      args: [num(pick(others).id), sold!, qty! * mult, ...price.map((x) => x! * mult)],
      cover: indebted ? "debt-offer" : undefined,
    });
  }

  // Inside the window: deliver or pay part of what remains; sometimes more, or with other cargo.
  const open = trades.filter(
    (t) => t.accepted && now <= sim.tradeWindow(w, t) && (t.seller === p.id || t.buyer === p.id),
  );
  for (const t of open) {
    if (r() < 0.3) out.push(claim(t, b.id, b.id, [0n, 0n, 0n, 0n], "claim-early"));
    if (!canSend || r() < 0.55) continue;
    const dest = buildingsOf(t.seller === p.id ? t.buyer : t.seller)[0];
    if (!dest) continue;
    const res = [0, 0, 0, 0];
    const share = r();
    let over = false;
    const part = (remaining: bigint) =>
      remaining === 0n ? 0 : Math.max(1, Math.ceil(num(remaining) * share));
    if (t.seller === p.id) {
      res[t.sold] = part(t.quantity - t.delivered);
      if (r() < 0.3) {
        res[t.sold]! += 1 + Math.floor(r() * 60);
        over = true;
      }
      if (r() < 0.2) {
        res[t.price.findIndex((x) => x > 0n)]! += 1 + Math.floor(r() * 20);
        over = true;
      }
    } else {
      t.price.forEach((x, i) => (res[i] = part(x - t.paid[i]!)));
      if (r() < 0.3) {
        res[t.price.findIndex((x) => x > 0n)]! += 1 + Math.floor(r() * 40);
        over = true;
      }
    }
    if (res.every((x) => x === 0)) continue;
    out.push(transport(dest.coord, res, num(t.id), over ? "over-shipment" : undefined));
  }

  // The debt restrictions (B-11) and the vacation lock (D-18).
  if (indebted) {
    const creditors = others.filter((x) => sim.owes(w, p.id, x.id) > 0);
    const third = others.filter((x) => sim.owes(w, p.id, x.id) === 0);
    const cargo = [10, 10, 0, 0];
    const restricted: Action[] = [];
    const dest = third.length > 0 ? buildingsOf(pick(third).id)[0] : undefined;
    if (canSend && dest) {
      restricted.push(transport(dest.coord, cargo, 0, "debt-transport"));
      if (!sim.onVacation(w.players.get(dest.owner)!, now)) {
        // An honest hidden transport to a third party: it leaves, and bounces on arrival.
        const d = Number(distance(rs, b.coord, dest.coord) / rs.config.distanceUnit);
        restricted.push({
          action: ACTION.sendHiddenMission,
          args: [
            Number(b.id),
            sim.TRANSPORT,
            Number(dest.coord.city),
            Number(dest.coord.neighborhood),
            Number(dest.coord.slot),
            1 + Math.floor(r() * 1_000_000_000),
            d + Math.floor(r() * 10),
            ...troops,
            ...cargo,
          ],
          cover: "hidden-bounce",
        });
      }
    }
    if (canSend) {
      const own = buildingsOf(p.id).filter((x) => x.id !== b.id);
      const to = r() < 0.5 && own.length > 0 ? own[0] : buildingsOf(pick(creditors).id)[0];
      if (to) restricted.push(transport(to.coord, cargo, 0, "debt-transport-allowed"));
    }
    restricted.push({ action: ACTION.startVacation, args: [], cover: "debt-vacation" });
    restricted.push({
      action: ACTION.offerTrade,
      args: [num(pick(others).id), 0, 300, 0, 0, 0, 100],
      cover: "debt-offer",
    });
    const offered = trades.find((x) => x.buyer === p.id && !x.accepted);
    if (offered) {
      restricted.push({
        action: ACTION.acceptTrade,
        args: [num(offered.id)],
        cover: "debt-accept",
      });
    }
    // Shuffle, and try them before anything else: the first that works ends the turn.
    for (let i = restricted.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [restricted[i], restricted[j]] = [restricted[j]!, restricted[i]!];
    }
    out.unshift(...restricted);
  } else if (now <= p.tradeLockUntil && r() < 0.25) {
    out.push({ action: ACTION.startVacation, args: [], cover: "window-vacation" });
  }
  // Whatever is not covered yet goes first, so every case happens within the budget of steps.
  const rank = (a: Action) => (a.cover && !COVERED.has(a.cover) ? 0 : 1);
  return out.sort((a, z) => rank(a) - rank(z));
}

/** Coverage bookkeeping after a market step: the tag's outcome, then the world's facts. */
function trackMarket(w: sim.World, chosen: Action, error: string, now: bigint): void {
  const tag = chosen.cover;
  if (tag === "hidden-bounce") {
    if (error === "") BOUNCERS.add(num(w.nextMission) - 1);
  } else if (tag && error === (EXPECTED[tag] ?? "")) COVERED.add(tag);
  if (chosen.action === ACTION.claimTrade && error === "") {
    const n = (CLAIMS.get(chosen.args[0]!) ?? 0) + 1;
    CLAIMS.set(chosen.args[0]!, n);
    if (n >= 2) COVERED.add("claim-repeated");
  }
  observeMarket(w, now);
}

/** Facts about the world the tags cannot tell: who defaulted, repeated claims, bounces. */
function observeMarket(w: sim.World, now: bigint): void {
  for (const t of w.trades.values()) {
    if (!t.accepted || now <= sim.tradeWindow(w, t)) continue;
    const d = sim.tradeDebt(w, t);
    COVERED.add(
      d.debtor === 0n ? "no-debt" : d.debtor === t.buyer ? "buyer-debtor" : "seller-debtor",
    );
  }
  const creditors = new Map<string, number>();
  for (const [key, n] of w.owes) {
    if (n === 0) continue;
    const debtor = key.split(":")[0]!;
    creditors.set(debtor, (creditors.get(debtor) ?? 0) + 1);
  }
  if ([...creditors.values()].some((n) => n >= 2)) COVERED.add("two-creditors");
  for (const m of w.missions.values()) {
    if (
      BOUNCERS.has(num(m.id)) &&
      m.returning &&
      !m.hidden &&
      m.kind === sim.TRANSPORT &&
      m.cargo.some((x) => x > 0n)
    )
      COVERED.add("hidden-bounce");
  }
}

type Mode = "bots" | "hidden" | "market";

function botScenario(seed: number, mode: Mode = "bots") {
  const hidden = mode === "hidden";
  const market = mode === "market";
  SESSIONS.clear();
  SECRETS.clear();
  const r = rng(seed);
  const w = sim.newWorld(rs);
  const actors = market ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 3);
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
  const total = market ? MARKET.steps : hidden ? HIDDEN.steps : BOTS.steps;
  while (steps.length < total) {
    // Hours to a couple of days between actions: months of game time in total. Market bots also
    // jump past a delivery window now and then, so trades default.
    const before = now;
    now += BigInt(
      Math.floor(
        market && r() < 0.12 ? 950_000 + r() * 300_000 : r() < 0.6 ? r() * 60_000 : r() * 300_000,
      ),
    );
    if (market) {
      // A revealed bouncer that is due: land soon, so its bounce is seen before it gets home.
      const due = [...w.missions.values()].find(
        (m) => BOUNCERS.has(num(m.id)) && !m.hidden && !m.returning && m.arrival <= before,
      );
      if (due) now = before + BigInt(1 + Math.floor(r() * 600));
    }
    if ((hidden || market) && r() < (hidden ? 0.4 : 0.5)) {
      // Land right after the next hidden arrival, often within its reveal grace (market bots:
      // always within it, so the debtor's hidden transports get revealed and bounce).
      const next = [...w.missions.values()]
        .filter((m) => m.hidden && !m.returning && m.arrival > before)
        .filter((m) => !market || BOUNCERS.has(num(m.id)))
        .sort((a, b) => (a.arrival < b.arrival ? -1 : 1))[0];
      if (next) now = next.arrival + BigInt(Math.floor(r() * (market ? 50 : 90)));
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
      candidates.push({ action: ACTION.addController, args: [target, r() < 0.3 ? 1 : 0] });
    } else if (k < 0.1) {
      // Drop a device (maybe itself, maybe the last one) or cancel a scheduled removal; mostly
      // one already scheduled, so removals execute once due (B-26); sometimes another seat's.
      const pool = r() < 0.15 ? owners[Math.floor(r() * actors)]! : seatOwners;
      const scheduled = [...w.players.get(BigInt(seat + 1))!.removalAt.keys()].map(Number);
      const target =
        scheduled.length > 0 && r() < 0.7
          ? scheduled[Math.floor(r() * scheduled.length)]!
          : pool[Math.floor(r() * pool.length)]!;
      candidates.push({
        action: k < 0.09 ? ACTION.removeController : ACTION.cancelRemoval,
        args: [target],
      });
    }
    if (hidden || market) candidates.push(...revealCandidates(w, r, now));
    if (market && r() < 0.65) {
      const pid = w.playerOf.get(controller)!;
      const p = w.players.get(pid)!;
      const own = [...w.buildings.values()].filter((x) => x.owner === pid);
      if (!sim.onVacation(p, now)) {
        candidates.push(...marketCandidates(w, p, own[Math.floor(r() * own.length)]!, r, now));
      }
    }
    candidates.push(...botCandidates(w, controller, r, now, hidden));
    if (candidates.length === 0) continue;
    // Usually the first candidate that works; sometimes a failing one, to test reverts too.
    let chosen = candidates[0]!;
    let error = "";
    for (const c of candidates) {
      chosen = c;
      error = attempt(w, String(actor), c, now);
      if (error === "" || r() < (c.cover ? 0.5 : 0.15)) break;
    }
    // Seats follow the world: a scheduled removal keeps the controller until it executes, and a
    // transfer only moves the seat when it executes (B-26). Count the executions for coverage.
    const seatPlayer = w.players.get(BigInt(seat + 1))!;
    if (
      chosen.action === ACTION.removeController &&
      error === "" &&
      chosen.args[0] !== owner &&
      !seatPlayer.controllers.includes(String(chosen.args[0]))
    )
      EXECUTED.removals++;
    if (chosen.action === ACTION.transferPlayer && error === "" && seatPlayer.transferTo === "")
      EXECUTED.transfers++;
    for (let i = 0; i < actors; i++)
      owners[i] = w.players.get(BigInt(i + 1))!.controllers.map(Number);
    if (chosen.action === ACTION.authorizeSession && error === "") sessions[seat] = chosen.args[0]!;
    if (chosen.action === ACTION.sendHiddenMission && error === "")
      SECRETS.set(num(w.nextMission) - 1, chosen.args.slice(1, 6));
    record(actor, chosen, error);
    if (market) trackMarket(w, chosen, error, now);
    // A session that expired, was revoked or died with a transfer is dropped after one more try.
    const live = sessions[seat];
    if (live !== undefined && sim.sessionPlayer(w, String(live), now) === undefined)
      sessions[seat] = undefined;
  }
  return { actors, seed, steps };
}

// ------------------------------------------------------------------ scripted market scenario

/**
 * A deterministic walk through every case in MARKET_COVERAGE: Alice (actor 0) sells to Bob (1)
 * and Carol (2) and under-delivers both; Bob claims, registering the debt; Alice runs into every
 * restriction, pays part back and her hidden transport bounces; Carol claims as the second
 * creditor. Amounts come from the simulator, so the script states what it relies on and fails
 * loudly if a rule change breaks an assumption. The random market scenarios add breadth.
 */
function scriptedMarketScenario(seed: number) {
  SESSIONS.clear();
  SECRETS.clear();
  const w = sim.newWorld(rs);
  let now = T0;
  const steps: unknown[] = [];
  const act = (actor: number, action: number, args: number[], cover?: string): string => {
    const a: Action = { action, args, cover };
    const error = attempt(w, actor < 0 ? "admin" : String(actor), a, now);
    steps.push({
      action,
      actor: Math.max(actor, 0),
      args,
      error,
      state: snapshot(w),
      time: num(now),
    });
    trackMarket(w, a, error, now);
    if (action === ACTION.sendHiddenMission && error === "")
      SECRETS.set(num(w.nextMission) - 1, args.slice(1, 6));
    return error;
  };
  const expect = (want: string, got: string, what: string) => {
    if (got !== want) throw new Error(`scripted market: ${what}: expected "${want}", got "${got}"`);
  };
  const assume = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`scripted market: ${what}`);
  };
  const ok = (got: string, what: string) => expect("", got, what);
  const jump = (seconds: number) => (now += BigInt(seconds));
  const bld = (actor: number) =>
    [...w.buildings.values()].find((b) => b.owner === BigInt(actor + 1))!;
  const bid = (actor: number) => num(bld(actor).id);
  const at = (b: sim.Building) => [
    Number(b.coord.city),
    Number(b.coord.neighborhood),
    Number(b.coord.slot),
  ];
  const units = (id: string, n: number) => rs.troops.map((t) => (t.id === id ? n : 0));
  /** The last mission sent arrives: time moves to it and the queue is advanced. */
  const arrive = () => {
    const m = w.missions.get(w.nextMission - 1n)!;
    if (m.arrival > now) now = m.arrival;
    ok(act(1, ACTION.advance, [10]), "advance to arrival");
  };
  /** Every mission home (none hidden): time moves to each arrival in turn. */
  const allHome = () => {
    while (w.pending.length > 0) {
      const next = w.missions.get(w.pending[0]!)!;
      if (next.arrival > now) now = next.arrival;
      ok(act(1, ACTION.advance, [10]), "advance until home");
    }
  };
  const transport = (
    actor: number,
    to: sim.Building,
    troops: number[],
    res: number[],
    trade: number,
    cover?: string,
  ) =>
    act(
      actor,
      ACTION.sendMission,
      [bid(actor), sim.TRANSPORT, ...at(to), ...troops, ...res, trade],
      cover,
    );
  const claim = (
    actor: number,
    trade: number,
    from: sim.Building,
    to: sim.Building,
    amount: number[],
    cover: string,
  ) => act(actor, ACTION.claimTrade, [trade, num(from.id), num(to.id), ...amount], cover);
  const debt = (trade: number) => sim.tradeDebt(w, w.trades.get(BigInt(trade))!);
  const [WEAPONS, AMMUNITION, , DOLLAR] = [0, 1, 2, 3];

  // Premium on; three players next to each other; a boot camp each; movers (10000 of cargo) for
  // Alice and Bob, rowdies for everyone. Carol buys no mover yet: her dollars stay near the cap.
  ok(act(-1, ACTION.setGlobalPremium, [Number(T0) + 100_000_000]), "premium");
  for (let i = 0; i < 3; i++) ok(act(i, ACTION.register, [1, 1, 1 + i * 7]), "register");
  for (let i = 0; i < 3; i++) ok(act(i, ACTION.queueRoom, [bid(i), room("boot_camp")]), "camp");
  jump(3 * 86400);
  for (let i = 0; i < 2; i++) ok(act(i, ACTION.train, [bid(i), troop("mover"), 1]), "mover");
  for (let i = 0; i < 3; i++)
    ok(act(i, ACTION.train, [bid(i), troop("rowdy"), i < 2 ? 3 : 5]), "rowdies");
  jump(86400);

  // Four trades accepted at once. A: Alice sells Bob 2000 weapons for 4000 ammunition (2-4-1).
  // B: Alice sells Carol 1500 weapons for 500 dollars (3-5-1). C: Carol sells Bob 500 ammunition
  // for 100 dollars. D: Bob sells Carol 200 weapons for 400 ammunition.
  const A = num(w.nextTrade);
  ok(act(0, ACTION.offerTrade, [2, WEAPONS, 2000, 0, 4000, 0, 0]), "offer A");
  const B = num(w.nextTrade);
  ok(act(0, ACTION.offerTrade, [3, WEAPONS, 1500, 0, 0, 0, 500]), "offer B");
  const C = num(w.nextTrade);
  ok(act(2, ACTION.offerTrade, [2, AMMUNITION, 500, 0, 0, 0, 100]), "offer C");
  const D = num(w.nextTrade);
  ok(act(1, ACTION.offerTrade, [3, WEAPONS, 200, 0, 400, 0, 0]), "offer D");
  ok(act(1, ACTION.acceptTrade, [A]), "accept A");
  ok(act(2, ACTION.acceptTrade, [B]), "accept B");
  ok(act(1, ACTION.acceptTrade, [C]), "accept C");
  ok(act(2, ACTION.acceptTrade, [D]), "accept D");
  const windowEnd = now + rs.config.marketWindowSeconds;
  expect("TradeOpen", act(0, ACTION.startVacation, [], "window-vacation"), "vacation in window");
  expect("InvalidTrade", claim(1, A, bld(0), bld(1), [0, 0, 0, 0], "claim-early"), "early claim");

  // Deliveries. A: Bob pays in full, Alice delivers a quarter. B: Carol pays in full, Alice
  // nothing. C: Carol delivers in full, Bob pays half. D: Bob ships more weapons than it takes
  // plus some dollars (the rest is a plain transport), Carol pays in full.
  ok(transport(1, bld(0), units("mover", 1), [0, 4000, 0, 0], A), "Bob pays A");
  arrive();
  ok(transport(0, bld(1), units("mover", 1), [500, 0, 0, 0], A), "Alice delivers part of A");
  arrive();
  ok(transport(2, bld(0), units("rowdy", 5), [0, 0, 0, 500], B), "Carol pays B");
  arrive();
  ok(transport(1, bld(2), units("rowdy", 3), [300, 0, 0, 5], D, "over-shipment"), "Bob ships D");
  arrive();
  allHome();
  ok(transport(2, bld(1), units("rowdy", 5), [0, 500, 0, 0], C), "Carol delivers C");
  arrive();
  ok(transport(1, bld(2), units("rowdy", 3), [0, 0, 0, 50], C), "Bob pays half of C");
  arrive();
  allHome();
  ok(transport(2, bld(1), units("rowdy", 5), [0, 400, 0, 0], D), "Carol pays D");
  arrive();
  allHome();
  assume(
    w.trades.get(BigInt(A))!.delivered === 500n && w.trades.get(BigInt(D))!.delivered === 200n,
    "deliveries",
  );

  // The windows close. Alice is in default on A (3300 ammunition) and B (550 dollars), Bob on C
  // (275 ammunition), D is complete. Alice trains eight rowdies: her ammunition drops below what
  // she owes, so a claim can exceed her stock without exceeding the debt.
  now = windowEnd + 1n;
  ok(act(0, ACTION.train, [bid(0), troop("rowdy"), 8]), "Alice spends ammunition");
  jump(86400);
  const a = debt(A);
  assume(a.debtor === 1n && a.remaining[AMMUNITION] === 3300n, "A: Alice owes 3300 ammunition");
  assume(debt(B).debtor === 1n && debt(B).remaining[DOLLAR] === 550n, "B: Alice owes 550 dollars");
  assume(
    debt(C).debtor === 2n && debt(C).remaining[AMMUNITION] === 275n,
    "C: Bob owes 275 ammunition",
  );
  assume(debt(D).debtor === 0n, "D: no debt");
  const toBob = settledClaimable(w, w.trades.get(BigInt(A))!, bld(0), bld(1), now);
  assume(
    toBob.stock[AMMUNITION]! < 3300n && toBob.free[AMMUNITION]! >= 3300n,
    "Alice's stock binds",
  );
  const held = num(toBob.stock[AMMUNITION]!);
  expect(
    "InvalidClaim",
    claim(1, A, bld(0), bld(1), [0, held + 1, 0, 0], "claim-over-stock"),
    "over stock",
  );
  expect(
    "InvalidClaim",
    claim(1, A, bld(0), bld(1), [0, 3301, 0, 0], "claim-over-debt"),
    "over debt",
  );
  expect("InvalidClaim", claim(1, A, bld(0), bld(1), [0, 0, 0, 0], "claim-zero"), "zero claim");
  expect("NotOwner", claim(1, A, bld(0), bld(0), [0, 100, 0, 0], "claim-not-owner"), "not owner");
  expect(
    "InvalidTrade",
    claim(0, A, bld(0), bld(1), [0, 100, 0, 0], "claim-not-creditor"),
    "debtor claims",
  );
  ok(claim(1, A, bld(0), bld(1), [0, 1000, 0, 0], "claim"), "Bob claims");
  ok(claim(1, A, bld(0), bld(1), [0, 500, 0, 0], "claim"), "Bob claims again");
  assume(w.players.get(1n)!.debts === 1 && sim.owes(w, 1n, 2n) === 1, "Alice's debt is registered");

  // Alice, in debt: no market, no vacation, no transports but to herself and her creditors. Her
  // hidden transport to Carol leaves (nothing can check it) and bounces on arrival; her payment
  // to Bob counts towards the debt.
  expect(
    "InDebt",
    act(0, ACTION.offerTrade, [3, WEAPONS, 300, 0, 0, 0, 100], "debt-offer"),
    "offer in debt",
  );
  const offered = num(w.nextTrade);
  ok(act(2, ACTION.offerTrade, [1, WEAPONS, 300, 0, 0, 0, 100]), "Carol offers Alice");
  expect("InDebt", act(0, ACTION.acceptTrade, [offered], "debt-accept"), "accept in debt");
  ok(act(2, ACTION.cancelTrade, [offered]), "Carol withdraws");
  expect("InDebt", act(0, ACTION.startVacation, [], "debt-vacation"), "vacation in debt");
  expect(
    "InDebt",
    transport(0, bld(2), units("rowdy", 2), [10, 10, 0, 0], 0, "debt-transport"),
    "transport in debt",
  );
  const salt = 123456789;
  const cover = Number(distance(rs, bld(0).coord, bld(2).coord) / rs.config.distanceUnit) + 2;
  ok(
    act(
      0,
      ACTION.sendHiddenMission,
      [bid(0), sim.TRANSPORT, ...at(bld(2)), salt, cover, ...units("rowdy", 3), 10, 10, 0, 0],
      "hidden-bounce",
    ),
    "hidden transport in debt",
  );
  const hiddenId = num(w.nextMission) - 1;
  now = w.missions.get(BigInt(hiddenId))!.arrival + 5n;
  ok(act(2, ACTION.reveal, [hiddenId, sim.TRANSPORT, ...at(bld(2)), salt]), "Carol reveals it");
  ok(act(1, ACTION.advance, [10]), "it bounces");
  assume(COVERED.has("hidden-bounce"), "the hidden transport bounced");
  ok(
    transport(0, bld(1), units("rowdy", 2), [10, 10, 0, 0], 0, "debt-transport-allowed"),
    "transport to creditor",
  );
  arrive();
  ok(
    transport(0, bld(1), units("rowdy", 2), [0, 300, 0, 0], A, "voluntary-payment"),
    "Alice pays back",
  );
  arrive();
  allHome();
  assume(w.trades.get(BigInt(A))!.returned[AMMUNITION] === 1800n, "A: 1800 returned");

  // Carol, the second creditor: her dollars are near the cap, so a claim can exceed her free
  // capacity without exceeding the debt or Alice's stock; after she spends on a mover, she claims.
  const toCarol = settledClaimable(w, w.trades.get(BigInt(B))!, bld(0), bld(2), now);
  const free = toCarol.free[DOLLAR]!;
  assume(free < 550n && free < toCarol.stock[DOLLAR]!, "Carol's free capacity binds");
  expect(
    "InvalidClaim",
    claim(2, B, bld(0), bld(2), [0, 0, 0, num(free) + 1], "claim-over-capacity"),
    "over capacity",
  );
  ok(act(2, ACTION.train, [bid(2), troop("mover"), 1]), "Carol spends dollars");
  ok(claim(2, B, bld(0), bld(2), [0, 0, 0, 200], "claim-second-creditor"), "Carol claims");
  assume(w.players.get(1n)!.debts === 2 && COVERED.has("two-creditors"), "two creditors");
  return { actors: 3, seed, steps };
}

/**
 * A deterministic walk through the controller rules (B-26, B-15): kinds, a scheduled removal
 * (pending, cancelled, executed), immediate self-removal, and a transfer in two steps, also while
 * suspended. The bots add breadth. Actor 0 is the phone, 1 another player, 2000+ devices, 2001 a
 * recovery code, 500 a session, 1000+ transfer targets.
 */
function scriptedControllersScenario(seed: number) {
  SESSIONS.clear();
  SECRETS.clear();
  const w = sim.newWorld(rs);
  let now = T0;
  const steps: unknown[] = [];
  const act = (actor: number, action: number, args: number[]): string => {
    const a: Action = { action, args };
    const error = attempt(w, actor < 0 ? "admin" : String(actor), a, now);
    steps.push({
      action,
      actor: Math.max(actor, 0),
      args,
      error,
      state: snapshot(w),
      time: num(now),
    });
    return error;
  };
  const expect = (want: string, got: string, what: string) => {
    if (got !== want)
      throw new Error(`scripted controllers: ${what}: expected "${want}", got "${got}"`);
  };
  const assume = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`scripted controllers: ${what}`);
  };
  const ok = (got: string, what: string) => expect("", got, what);
  const jump = (seconds: number) => (now += BigInt(seconds));
  const DAY = 86400;
  const DELAY = Number(rs.config.controllerRemovalDelay);
  const P = () => w.players.get(1n)!;

  ok(act(0, ACTION.register, [1, 1, 1]), "the phone registers");
  ok(act(1, ACTION.register, [1, 1, 8]), "another player registers");
  ok(act(0, ACTION.addController, [2000, 0]), "a laptop");
  ok(act(0, ACTION.addController, [2001, 1]), "a recovery code");
  SESSIONS.add("500");
  ok(act(0, ACTION.authorizeSession, [500, Number(now) + DAY]), "a session");
  assume(P().recovery.has("2001") && !P().recovery.has("2000"), "the code is flagged");

  // The laptop schedules the phone's removal: every session dies now, the phone keeps its rights.
  ok(act(2000, ACTION.removeController, [0]), "the laptop schedules the phone's removal");
  assume(
    P().removalAt.get("0") === now + BigInt(DELAY) &&
      P().sessionEpoch === 1n &&
      sim.sessionPlayer(w, "500", now) === undefined,
    "scheduled, sessions dead",
  );
  ok(act(0, ACTION.queueRoom, [1, room("boss_office")]), "the phone still plays");
  expect("RemovalPending", act(2000, ACTION.removeController, [0]), "not due yet");
  ok(act(0, ACTION.cancelRemoval, [0]), "the phone cancels its own removal");
  expect("NoRemoval", act(0, ACTION.cancelRemoval, [0]), "nothing to cancel");
  expect("NoRemoval", act(0, ACTION.cancelRemoval, [1]), "another player's controller");
  ok(act(0, ACTION.authorizeSession, [500, Number(now) + DAY]), "the session again");
  expect("NotController", act(500, ACTION.cancelRemoval, [0]), "a session cannot cancel");
  expect("NotController", act(500, ACTION.removeController, [0]), "a session cannot remove");

  // The code schedules it again; once due the same call executes it.
  ok(act(2001, ACTION.removeController, [0]), "the code schedules the phone's removal");
  jump(2 * DAY);
  expect("RemovalPending", act(2001, ACTION.removeController, [0]), "still pending");
  jump(DAY + 1);
  ok(act(2001, ACTION.removeController, [0]), "executed");
  assume(P().controllers.join() === "2001,2000" && P().sessionEpoch === 3n, "swap-and-pop, epoch");
  ok(act(0, ACTION.register, [1, 1, 30]), "the freed phone registers a player of its own");
  assume(
    w.players.get(3n)!.recovery.size === 0 && w.players.get(3n)!.removalAt.size === 0,
    "a clean slate",
  );
  ok(act(2000, ACTION.removeController, [2000]), "the laptop removes itself at once");
  assume(P().controllers.join() === "2001", "only the code is left");
  expect("LastController", act(2001, ACTION.removeController, [2001]), "never the last");

  // Transfers: scheduled, pending, re-scheduled, cancelled, checked again when executing.
  ok(act(2001, ACTION.addController, [2002, 0]), "a new device");
  ok(act(2001, ACTION.transferPlayer, [1000]), "transfer scheduled");
  expect("TransferPending", act(2001, ACTION.transferPlayer, [1000]), "not due yet");
  ok(act(2001, ACTION.transferPlayer, [1001]), "re-scheduled to another address");
  assume(P().transferTo === "1001", "re-scheduled");
  ok(act(2002, ACTION.cancelTransfer, []), "the new device cancels it");
  expect("NoTransfer", act(2002, ACTION.cancelTransfer, []), "nothing to cancel");
  expect(
    "ControllerTaken",
    act(2001, ACTION.transferPlayer, [1]),
    "a controller of another player",
  );
  ok(act(2001, ACTION.transferPlayer, [1000]), "scheduled again");
  jump(3 * DAY);
  ok(act(1000, ACTION.register, [1, 1, 40]), "the target registers meanwhile");
  expect("ControllerTaken", act(2001, ACTION.transferPlayer, [1000]), "checked again on execution");
  ok(act(2001, ACTION.transferPlayer, [1002]), "scheduled to a free address");
  jump(3 * DAY);
  ok(act(2001, ACTION.transferPlayer, [1002]), "executed");
  assume(
    P().controllers.join() === "1002" &&
      P().transferTo === "" &&
      P().removalAt.size === 0 &&
      P().recovery.size === 0,
    "transferred, clean",
  );

  // A self-removal drops its own schedule; managing works while suspended, transferring does not.
  ok(act(1002, ACTION.addController, [2003, 0]), "a device");
  ok(act(1002, ACTION.removeController, [2003]), "its removal scheduled");
  ok(act(2003, ACTION.removeController, [2003]), "it removes itself at once");
  expect("NoRemoval", act(1002, ACTION.cancelRemoval, [2003]), "the schedule went with it");
  ok(act(-1, ACTION.suspend, [1, Number(now) + DAY]), "suspended");
  expect("Suspended", act(1002, ACTION.transferPlayer, [1003]), "no transfer while suspended");
  ok(act(1002, ACTION.addController, [2004, 0]), "adding works suspended");
  ok(act(1002, ACTION.removeController, [2004]), "scheduling works suspended");
  ok(act(1002, ACTION.cancelRemoval, [2004]), "cancelling works suspended");
  return { actors: 2, seed, steps };
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../generated/scenarios/vendetta");
rmSync(join(here, "../generated/scenarios"), { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const scenarios = [
  ...Array.from({ length: RANDOM.count }, (_, i) => randomScenario(20261015 + i)),
  ...Array.from({ length: BOTS.count }, (_, i) => botScenario(20271015 + i)),
  ...Array.from({ length: HIDDEN.count }, (_, i) => botScenario(20281015 + i, "hidden")),
  scriptedMarketScenario(20291014),
  ...Array.from({ length: MARKET.count }, (_, i) => botScenario(20291015 + i, "market")),
  scriptedControllersScenario(20301014),
];
const uncovered = MARKET_COVERAGE.filter((c) => !COVERED.has(c));
if (uncovered.length > 0) {
  throw new Error(`market scenarios do not cover: ${uncovered.join(", ")}`);
}
if (EXECUTED.removals === 0 || EXECUTED.transfers === 0) {
  throw new Error(
    `bots executed ${EXECUTED.removals} scheduled removals and ${EXECUTED.transfers} transfers`,
  );
}
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
    `${count(ACTION.removeController)} - controllers (${EXECUTED.removals} executed, ` +
    `${count(ACTION.cancelRemoval)} cancelled), ${EXECUTED.transfers} transfers executed, ` +
    `${count(ACTION.claimTrade)} claims, ` +
    `${steps.filter((x) => x.error === "InDebt").length} InDebt`,
);
