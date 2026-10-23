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
//  - market: bots that trade, pay in full, in part or not at all, withdraw their shares and run
//    into the market rules (D-19, B-11). The generator checks that every case it is meant to cover
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
  transferPlayer: 17, // [new controller (actor id)]: schedules; the target accepts (46)
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
  answerPeace: 29, // [war, kind, accept 0/1]
  offerTrade: 30, // [buyer, fromBuilding, sold, quantity, price × 4]
  cancelTrade: 31, // [trade]
  acceptTrade: 32, // [trade, depositBuilding]
  authorizeSession: 33, // [session (actor id), until]: invites; the session accepts (42)
  revokeSession: 34, // [session (actor id)]
  inviteController: 35, // [controller (actor id), recovery 0/1]: invites; the address accepts (44)
  removeController: 36, // [controller (actor id)]: itself at once; another one schedules, then executes once due
  sendHiddenMission: 37, // [building, kind, city, neighborhood, slot, salt, cover, troops × 21, resources × 4, arrival]
  reveal: 38, // [mission, kind, city, neighborhood, slot, salt]
  withdrawTrade: 39, // [trade, toBuilding, amount × 4]
  cancelRemoval: 40, // [controller (actor id)]
  cancelTransfer: 41, // []
  acceptSession: 42, // [player], by the invited session
  acceptController: 44, // [player], by the invited address
  cancelInvite: 45, // [invited (actor id)]
  acceptTransfer: 46, // [player], by the transfer's target
  forfeit: 47, // [mission], by anyone past the grace
} as const;

/** Whoever forfeits a parked hidden mission (B-22): a bystander, the keeper in real life. */
const ANYONE = 900;
/** Hidden sends take the natural arrival unless they test the fixed one (B-22). */
const NATURAL = 0;

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

/** Every (invited actor, player) pair ever invited, so consumed or dead ones are checked too. */
const INVITED = new Set<string>();

/** Plaintext of the hidden missions sent in the current scenario, by mission id: [kind, city, neighborhood, slot, salt]. */
const SECRETS = new Map<number, number[]>();

/** The player an actor plays for (as controller or session), as Scenarios.t.sol computes it. */
const playerFor = (w: sim.World, controller: string) =>
  w.playerOf.get(controller) ?? w.sessions.get(controller)?.player ?? 0n;

function snapshot(w: sim.World) {
  return {
    invites: [...INVITED].map((k) => {
      const [actor, player] = k.split(":") as [string, string];
      const inv = w.invites.get(sim.inviteKey(actor, BigInt(player)));
      return {
        actor: Number(actor),
        epoch: inv ? num(inv.epoch) : 0,
        kind: inv ? inv.kind : 0,
        player: Number(player),
        recovery: inv?.recovery ? 1 : 0,
        until: inv ? num(inv.until) : 0,
      };
    }),
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
      last_return: num(b.lastReturn),
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
      ].map(num),
      id: num(m.id),
      troops: m.troops.map(num),
    })),
    parked: w.parked.map(num),
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
        p.tradeLockUntil,
        p.transferTo === "" ? 0n : BigInt(p.transferTo),
        p.transferAt,
        p.vacationSeq,
      ].map(num),
      applications: p.applications.map(num),
      offers: p.offers.map(num),
      purchases: p.purchases.map(num),
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
      buyer_took: t.buyerTook.map(num),
      deposit: t.deposit.map(num),
      fields: [
        t.seller,
        t.buyer,
        t.from,
        BigInt(t.sold),
        t.accepted ? 1n : 0n,
        t.closesAt,
        t.quantity,
      ].map(num),
      id: num(t.id),
      paid: t.paid.map(num),
      price: t.price.map(num),
      rate: t.rate.map(num),
      seller_took: t.sellerTook.map(num),
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
      const arrival = n[7 + rs.troops.length + rs.resources.length]!;
      return void sim.sendHiddenMission(
        w,
        controller,
        n[0]!,
        commit,
        n[6]!,
        troops,
        res,
        arrival,
        now,
      );
    }
    case ACTION.reveal:
      return sim.reveal(
        w,
        n[0]!,
        Number(n[1]),
        { city: n[2]!, neighborhood: n[3]!, slot: n[4]! },
        n[5]!,
        now,
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
      return sim.answerPeace(w, controller, n[0]!, Number(n[1]), n[2] === 1n, now);
    case ACTION.offerTrade:
      return void sim.offerTrade(
        w,
        controller,
        n[0]!,
        n[1]!,
        Number(n[2]),
        n[3]!,
        n.slice(4, 8),
        now,
      );
    case ACTION.cancelTrade:
      return sim.cancelTrade(w, controller, n[0]!, now);
    case ACTION.acceptTrade:
      return sim.acceptTrade(w, controller, n[0]!, n[1]!, now);
    case ACTION.withdrawTrade:
      return sim.withdrawTrade(w, controller, n[0]!, n[1]!, n.slice(2, 6), now);
    case ACTION.authorizeSession:
      return sim.authorizeSession(w, controller, String(n[0]), n[1]!, now);
    case ACTION.revokeSession:
      return sim.revokeSession(w, controller, String(n[0]), now);
    case ACTION.inviteController:
      return sim.inviteController(w, controller, String(n[0]), n[1] === 1n, now);
    case ACTION.acceptSession:
      return sim.acceptSession(w, controller, n[0]!, now);
    case ACTION.acceptController:
      return sim.acceptController(w, controller, n[0]!, now);
    case ACTION.cancelInvite:
      return sim.cancelInvite(w, controller, String(n[0]), now);
    case ACTION.acceptTransfer:
      return sim.acceptTransfer(w, controller, n[0]!, now);
    case ACTION.forfeit:
      return sim.forfeit(w, n[0]!, now);
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
  INVITED.clear();
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
    if (hidden && trade === 0 && r() < 0.85)
      return hide(w, controller, b, kind, to, troops, res, r, now);
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
 * (0, beyond the map) or at reveal (shorter than the distance), or cargo on a non-transport. Usually
 * the natural arrival; sometimes a fixed one within the slack, before the natural one (TooLate) or
 * past the slack (InvalidArrival).
 */
function hide(
  w: sim.World,
  controller: string,
  b: sim.Building,
  kind: number,
  to: sim.Building["coord"],
  troops: number[],
  res: number[],
  r: () => number,
  now: bigint,
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
  const a = r();
  const natural = a < 0.3 ? naturalArrival(w, controller, b, cover, troops, cargo, now) : 0;
  const slack = Number(rs.config.hiddenArrivalSlack);
  const arrival =
    a < 0.04
      ? natural - 1
      : a < 0.08
        ? natural + slack + 1
        : a < 0.3
          ? natural + Math.floor(r() * (slack + 1))
          : NATURAL;
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
      arrival,
    ],
  };
}

/** The arrival the send would get at `now` (on a copy), or `now` when it would fail. */
function naturalArrival(
  w: sim.World,
  controller: string,
  b: sim.Building,
  cover: number,
  troops: number[],
  cargo: number[],
  now: bigint,
): number {
  const { rs: ruleset, ...rest } = w;
  const c = Object.assign(structuredClone(rest), { rs: ruleset }) as sim.World;
  try {
    const id = sim.sendHiddenMission(
      c,
      controller,
      b.id,
      `0x${"0".repeat(64)}`,
      BigInt(cover),
      troops.map(BigInt),
      cargo.map(BigInt),
      0n,
      now,
    );
    return num(c.missions.get(id)!.arrival);
  } catch {
    return num(now);
  }
}

/**
 * Forfeits (B-22) of the due hidden missions nobody revealed: mostly past the grace, sometimes too
 * early (TooEarly), now and then on one that is no longer hidden (a no-op).
 */
function forfeitCandidates(w: sim.World, r: () => number, now: bigint): Action[] {
  const out: Action[] = [];
  for (const m of w.missions.values()) {
    if (m.returning) continue;
    const due = m.hidden && m.arrival <= now;
    if (!due && r() > 0.02) continue;
    if (r() < 0.5) out.push({ action: ACTION.forfeit, args: [num(m.id)] });
  }
  return out;
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
        if (war.offer !== sim.OFFER_NONE && war.offerBy !== f) {
          // The answer names the offer it saw; sometimes the other kind, which NoOffer.
          const kind = r() < 0.15 ? 3 - war.offer : war.offer;
          out.push({ action: ACTION.answerPeace, args: [num(war.id), kind, r() < 0.6 ? 1 : 0] });
        }
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
    if (mine.length > 0)
      out.push({ action: ACTION.acceptTrade, args: [num(pick(mine).id), num(b.id)] });
    const owing = trades.filter((t) => sim.tradePayable(w, t.id, p.id, t.seller, now));
    if (owing.length > 0) {
      const t = pick(owing);
      // Usually the seller's building (D-26); sometimes another one, which InvalidTrade.
      const dest = [...w.buildings.values()].find((x) => x.owner === (r() < 0.1 ? p.id : t.seller));
      if (dest) {
        const res = t.price.map((x, i) => Math.min(150, num(x - t.paid[i]!)));
        if (r() < 0.2) res[t.sold]! += 10; // sometimes cargo that does not settle
        out.push(send(sim.TRANSPORT, dest.coord, army(0.4), res, num(t.id)));
      }
    }
    const shares = trades.filter((t) => sim.shareLeft(t, p.id, now).some((x) => x > 0n));
    if (shares.length > 0) {
      const t = pick(shares);
      const amount = sim.shareLeft(t, p.id, now).map((x) => num(x > 200n ? 200n : x));
      out.push({ action: ACTION.withdrawTrade, args: [num(t.id), num(b.id), ...amount] });
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
      out.push({ action: ACTION.offerTrade, args: [buyer, num(b.id), sold!, qty!, ...price] });
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
    // Sometimes the pending target again (TransferPending), mostly a new one; the target accepts
    // once due (see botScenario).
    const to =
      p.transferTo !== "" && r() < 0.3 ? Number(p.transferTo) : 1000 + Math.floor(r() * 1000);
    out.push({ action: ACTION.transferPlayer, args: [to] });
  }
  return out;
}

// ------------------------------------------------------------------ market scenarios (D-19, B-11)

/** What the market scenarios must exercise at least once, together; the generator fails otherwise. */
const MARKET_COVERAGE = [
  "paid-in-full", // a trade fully paid: final before its window closes
  "partly-paid", // a closed window with part of the price paid
  "unpaid", // a closed window with nothing paid
  "over-payment", // a payment beyond what remained, or with other resources, counted in part
  "withdraw-buyer", // the buyer withdraws goods or its deposit
  "withdraw-seller", // the seller withdraws the rest and its deposit share
  "withdraw-repeated", // a second withdrawal by the same party on the same trade
  "withdraw-over-share", // InvalidWithdrawal: more than the share left
  "withdraw-over-capacity", // InvalidWithdrawal: more than the building can take
  "withdraw-zero", // InvalidWithdrawal: nothing
  "withdraw-early", // InvalidWithdrawal: the seller before the trade is final
  "withdraw-third-party", // InvalidTrade: a player that is not a party
  "withdraw-not-owner", // NotOwner: into a building that is not the caller's
  "shares-left-offer", // SharesLeft on offerTrade
  "shares-left-accept", // SharesLeft on acceptTrade
  "accept-no-stock", // CannotAfford: the offer's building lacks the goods
  "accept-not-owner", // NotOwner: the deposit from a building that is not the buyer's
  "window-vacation", // TradeOpen on startVacation
  "trade-wrong-target", // InvalidTrade: a payment towards a building that is not the seller's
  "seller-ships", // InvalidTrade: the seller names the trade on a transport
  "late-payment", // InvalidTrade: a payment that would arrive after the window
] as const;

/** The revert each tagged action is meant to produce ("" = it must succeed). */
const EXPECTED: Record<string, string> = {
  "withdraw-over-share": "InvalidWithdrawal",
  "withdraw-over-capacity": "InvalidWithdrawal",
  "withdraw-zero": "InvalidWithdrawal",
  "withdraw-early": "InvalidWithdrawal",
  "withdraw-third-party": "InvalidTrade",
  "withdraw-not-owner": "NotOwner",
  "shares-left-offer": "SharesLeft",
  "shares-left-accept": "SharesLeft",
  "accept-no-stock": "CannotAfford",
  "accept-not-owner": "NotOwner",
  "window-vacation": "TradeOpen",
  "trade-wrong-target": "InvalidTrade",
  "seller-ships": "InvalidTrade",
  "late-payment": "InvalidTrade",
};

const COVERED = new Set<string>();
/** Scheduled removals and transfers the bots executed once due (B-26); none means the bias is off. */
const EXECUTED = { removals: 0, transfers: 0 };
/** Successful withdrawals per trade and side ("<trade>:<tag>"). */
const WITHDRAWALS = new Map<string, number>();

/** A copy of the world as an action will see it: due missions processed, `ids` settled. */
function projected(w: sim.World, now: bigint, ids: bigint[]): sim.World {
  const { rs: ruleset, ...rest } = w;
  const c = Object.assign(structuredClone(rest), { rs: ruleset }) as sim.World;
  sim.processDue(c, now, Number.MAX_SAFE_INTEGER);
  for (const id of ids) {
    const b = c.buildings.get(id);
    if (b) sim.settle(c, b, now);
  }
  return c;
}

/** What `player` can withdraw into `to` and the building's free capacity, as the action sees them. */
function settledWithdrawable(
  w: sim.World,
  t: sim.Trade,
  player: bigint,
  to: sim.Building,
  now: bigint,
): { max: bigint[]; free: bigint[] } {
  const c = projected(w, now, [to.id]);
  const o = c.buildings.get(to.id);
  const zero = rs.resources.map(() => 0n);
  if (!o) return { max: zero, free: zero };
  const scale = sim.stockScale(rs);
  const cap = sim.capacities(c, o);
  return {
    max: sim.withdrawable(c, c.trades.get(t.id)!, player, o, now),
    free: cap.map((x, r) => (x > o.stock[r]! ? (x - o.stock[r]!) / scale : 0n)),
  };
}

/** A building's stock in whole units, as an action sees it. */
function settledStock(w: sim.World, id: bigint, now: bigint): bigint[] {
  const b = projected(w, now, [id]).buildings.get(id);
  return b ? b.stock.map((x) => x / sim.stockScale(rs)) : rs.resources.map(() => 0n);
}

/** A share left in a final trade blocks offers and acceptances (D-19). */
const blocked = (w: sim.World, p: sim.Player, now: bigint) =>
  [...p.offers, ...p.purchases].some((id) => {
    const t = w.trades.get(id)!;
    return sim.tradeFinal(t, now) && sim.shareLeft(t, p.id, now).some((x) => x > 0n);
  });

/** Offers, acceptances, payments, withdrawals and the market rules, for player `p` at `b`. */
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
  const stuck = blocked(w, p, now);
  const only = (i: number, v: bigint) => rs.resources.map((_, k) => (k === i ? v : 0n));
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
  const withdraw = (t: sim.Trade, to: bigint, amount: bigint[], cover: string): Action => ({
    action: ACTION.withdrawTrade,
    args: [num(t.id), num(to), ...amount.map(num)],
    cover,
  });

  // Spend: a batch of rowdies drains ammunition and weapons (withdrawals need free capacity, and
  // payments need troops); a mob school drains both plus dollars.
  if (r() < 0.5) {
    if (b.levels[room("boot_camp")]! > 0n) {
      // Movers carry 10000 each: with them payments get large.
      const mover = r() < 0.35;
      out.push({
        action: ACTION.train,
        args: [Number(b.id), troop(mover ? "mover" : "rowdy"), mover ? 1 : 2 + Math.floor(r() * 6)],
      });
    } else out.push({ action: ACTION.queueRoom, args: [Number(b.id), room("boot_camp")] });
    if (r() < 0.3) out.push({ action: ACTION.queueRoom, args: [Number(b.id), room("mob_school")] });
  }

  // Withdrawals: my shares into my building; sometimes the edges.
  for (const t of trades.filter((x) => x.accepted && (x.seller === p.id || x.buyer === p.id))) {
    const left = sim.shareLeft(t, p.id, now);
    const side = t.buyer === p.id ? "withdraw-buyer" : "withdraw-seller";
    if (t.seller === p.id && !sim.tradeFinal(t, now) && r() < 0.2)
      out.push(withdraw(t, b.id, only(t.sold, 1n), "withdraw-early"));
    if (left.every((x) => x === 0n)) continue;
    const { max, free } = settledWithdrawable(w, t, p.id, b, now);
    const k = r();
    if (k < 0.6 && max.some((x) => x > 0n)) {
      const div = r() < 0.5 ? 1n : 2n + BigInt(Math.floor(r() * 3));
      out.push(
        withdraw(
          t,
          b.id,
          max.map((x) => (x > 1n ? x / div : x)),
          side,
        ),
      );
    } else if (k < 0.72) {
      const i = left.findIndex((x) => x > 0n);
      out.push(withdraw(t, b.id, only(i, left[i]! + 1n), "withdraw-over-share"));
    } else if (k < 0.84) {
      const j = left.findIndex((x, i) => x > free[i]!);
      if (j >= 0) out.push(withdraw(t, b.id, only(j, free[j]! + 1n), "withdraw-over-capacity"));
    } else if (k < 0.92) out.push(withdraw(t, b.id, only(0, 0n), "withdraw-zero"));
    else {
      const other = others.length > 0 ? buildingsOf(pick(others).id)[0] : undefined;
      if (other) out.push(withdraw(t, other.id, left, "withdraw-not-owner"));
    }
  }
  const foreign = trades.filter((x) => x.accepted && x.seller !== p.id && x.buyer !== p.id);
  if (foreign.length > 0 && r() < 0.1)
    out.push(withdraw(pick(foreign), b.id, only(0, 1n), "withdraw-third-party"));

  // Offers made to me: the deposit from my building, sometimes from someone else's.
  for (const t of trades.filter((x) => x.buyer === p.id && !x.accepted)) {
    if (r() < 0.3) continue;
    let cover: string | undefined;
    let deposit = b.id;
    if (stuck) cover = "shares-left-accept";
    else if (p.purchases.length < rs.config.maxPurchases) {
      if (r() < 0.1 && others.length > 0) {
        deposit = buildingsOf(pick(others).id)[0]?.id ?? b.id;
        if (deposit !== b.id) cover = "accept-not-owner";
      } else if (settledStock(w, t.from, now)[t.sold]! < t.quantity) cover = "accept-no-stock";
    }
    out.push({ action: ACTION.acceptTrade, args: [num(t.id), num(deposit)], cover });
  }
  // New offers from my building; large ones often find the building short at acceptance.
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
    const mult = r() < 0.2 ? 8 + Math.floor(r() * 30) : 1 + Math.floor(r() * 3);
    out.push({
      action: ACTION.offerTrade,
      args: [num(pick(others).id), num(b.id), sold!, qty! * mult, ...price.map((x) => x! * mult)],
      cover: stuck ? "shares-left-offer" : undefined,
    });
  }

  // Inside the window: the buyer pays part of what remains, sometimes more or with other cargo;
  // the seller sometimes tries to ship.
  const open = trades.filter(
    (t) => !sim.tradeFinal(t, now) && t.accepted && (t.seller === p.id || t.buyer === p.id),
  );
  for (const t of open) {
    if (!canSend || r() < 0.55) continue;
    const counterparty = buildingsOf(t.seller === p.id ? t.buyer : t.seller)[0];
    if (t.seller === p.id) {
      if (counterparty && r() < 0.15)
        out.push(transport(counterparty.coord, num1(t.sold), num(t.id), "seller-ships"));
      continue;
    }
    if (r() < 0.1) {
      // Towards a building that is not the seller's: InvalidTrade (D-26).
      const wrong = buildingsOf(p.id).concat(buildingsOf(pick(others).id))[0];
      if (wrong && wrong.owner !== t.seller)
        out.push(transport(wrong.coord, [0, 0, 0, 1], num(t.id), "trade-wrong-target"));
    }
    if (!counterparty) continue;
    const share = r();
    let over = false;
    const res = t.price.map((x, i) =>
      x === t.paid[i]! ? 0 : Math.max(1, Math.ceil(num(x - t.paid[i]!) * share)),
    );
    if (r() < 0.3) {
      res[t.price.findIndex((x) => x > 0n)]! += 1 + Math.floor(r() * 40);
      over = true;
    }
    if (r() < 0.2) {
      res[t.sold]! += 1 + Math.floor(r() * 20);
      over = true;
    }
    if (res.every((x) => x === 0)) continue;
    out.push(transport(counterparty.coord, res, num(t.id), over ? "over-payment" : undefined));
  }

  // The vacation lock (D-18).
  if (now <= p.tradeLockUntil && r() < 0.25)
    out.push({ action: ACTION.startVacation, args: [], cover: "window-vacation" });
  // Whatever is not covered yet goes first, so every case happens within the budget of steps.
  const rank = (a: Action) => (a.cover && !COVERED.has(a.cover) ? 0 : 1);
  return out.sort((a, z) => rank(a) - rank(z));
}

/** One unit of resource `i`, as transport cargo. */
const num1 = (i: number) => rs.resources.map((_, k) => (k === i ? 1 : 0));

/** Coverage bookkeeping after a market step: the tag's outcome, then the world's facts. */
function trackMarket(w: sim.World, chosen: Action, error: string, now: bigint): void {
  const tag = chosen.cover;
  if (tag && error === (EXPECTED[tag] ?? "")) COVERED.add(tag);
  if (chosen.action === ACTION.withdrawTrade && error === "" && tag) {
    const key = `${chosen.args[0]}:${tag}`;
    const n = (WITHDRAWALS.get(key) ?? 0) + 1;
    WITHDRAWALS.set(key, n);
    if (n >= 2) COVERED.add("withdraw-repeated");
  }
  observeMarket(w, now);
}

/** Facts about the world the tags cannot tell: how trades ended. */
function observeMarket(w: sim.World, now: bigint): void {
  for (const t of w.trades.values()) {
    if (!sim.tradeFinal(t, now)) continue;
    if (t.paid.every((x, r) => x === t.price[r])) COVERED.add("paid-in-full");
    else COVERED.add(t.paid.every((x) => x === 0n) ? "unpaid" : "partly-paid");
  }
}

type Mode = "bots" | "hidden" | "market";

function botScenario(seed: number, mode: Mode = "bots") {
  const hidden = mode === "hidden";
  const market = mode === "market";
  SESSIONS.clear();
  INVITED.clear();
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
  // An invited session or device accepts in a later step (B-15, B-26).
  const sessions: (number | undefined)[] = Array.from({ length: actors }, () => undefined);
  const pending: { actor: number; action: number }[][] = Array.from({ length: actors }, () => []);
  let nextSession = 500;
  const total = market ? MARKET.steps : hidden ? HIDDEN.steps : BOTS.steps;
  while (steps.length < total) {
    // Hours to a couple of days between actions: months of game time in total. Market bots also
    // jump past a delivery window now and then, so trades end unpaid or partly paid.
    const before = now;
    now += BigInt(
      Math.floor(
        market && r() < 0.12 ? 450_000 + r() * 150_000 : r() < 0.6 ? r() * 60_000 : r() * 300_000,
      ),
    );
    if (hidden && r() < 0.4) {
      // Land right after the next hidden arrival, often within its reveal grace, so reveals,
      // forfeits and actions interleave with parked missions.
      const next = [...w.missions.values()]
        .filter((m) => m.hidden && !m.returning && m.arrival > before)
        .sort((a, b) => (a.arrival < b.arrival ? -1 : 1))[0];
      if (next) now = next.arrival + BigInt(Math.floor(r() * 90));
    }
    if (r() < 0.035) {
      // The admin suspends, lifts or grants premium to a random player.
      const player = 1 + Math.floor(r() * actors);
      const k = r();
      let a: Action;
      if (k < 0.3) {
        a = { action: ACTION.suspend, args: [player, Number(now) + Math.floor(r() * 200_000)] };
      } else if (k < 0.45) {
        a = { action: ACTION.suspend, args: [player, 0] };
      } else {
        a = {
          action: ACTION.grantPremium,
          args: [player, Number(now) + Math.floor(r() * 3_000_000)],
        };
      }
      record(0, a, attempt(w, "admin", a, now));
      continue;
    }
    if ((hidden || market) && r() < 0.2) {
      // A bystander forfeits a parked hidden mission (B-22).
      const forfeits = forfeitCandidates(w, r, now);
      if (forfeits.length > 0) {
        const a = forfeits[Math.floor(r() * forfeits.length)]!;
        record(ANYONE, a, attempt(w, String(ANYONE), a, now));
        continue;
      }
    }
    const seat = Math.floor(r() * actors);
    const seatOwners = owners[seat]!;
    const owner = seatOwners[Math.floor(r() * seatOwners.length)]!;
    const controller = String(owner);
    const session = sessions[seat];
    const seatPlayerId = BigInt(seat + 1);
    // An invited session or device accepts (mostly), sometimes for the wrong player; the target
    // of a due transfer takes the account.
    const invited = pending[seat]!;
    if (invited.length > 0 && r() < 0.6) {
      const inv = invited.shift()!;
      const player = r() < 0.1 ? Number(seatPlayerId) + 1 : Number(seatPlayerId);
      const a = { action: inv.action, args: [player] };
      const error = attempt(w, String(inv.actor), a, now);
      if (error === "" && inv.action === ACTION.acceptSession) sessions[seat] = inv.actor;
      for (let i = 0; i < actors; i++)
        owners[i] = w.players.get(BigInt(i + 1))!.controllers.map(Number);
      record(inv.actor, a, error);
      continue;
    }
    const seatP = w.players.get(seatPlayerId)!;
    if (seatP.transferTo !== "" && now >= seatP.transferAt && r() < 0.7) {
      const to = Number(seatP.transferTo);
      const a = { action: ACTION.acceptTransfer, args: [Number(seatPlayerId)] };
      const error = attempt(w, String(to), a, now);
      if (error === "") EXECUTED.transfers++;
      for (let i = 0; i < actors; i++)
        owners[i] = w.players.get(BigInt(i + 1))!.controllers.map(Number);
      record(to, a, error);
      continue;
    }
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
      INVITED.add(`${target}:${seatPlayerId}`);
      candidates.push({ action: ACTION.authorizeSession, args: [target, Number(now) + span] });
    } else if (k < 0.05 && session !== undefined) {
      candidates.push({ action: ACTION.revokeSession, args: [session] });
    } else if (k < 0.075) {
      // Another device or a recovery code; sometimes an address already in use, sometimes an
      // invitation dropped before it is accepted.
      const other = owners[Math.floor(r() * actors)]![0]!;
      const target =
        r() < 0.15 ? other : r() < 0.05 && session !== undefined ? session : nextDevice++;
      INVITED.add(`${target}:${seatPlayerId}`);
      candidates.push({ action: ACTION.inviteController, args: [target, r() < 0.3 ? 1 : 0] });
      if (invited.length > 0 && r() < 0.3)
        candidates.unshift({ action: ACTION.cancelInvite, args: [invited[0]!.actor] });
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
    for (let i = 0; i < actors; i++)
      owners[i] = w.players.get(BigInt(i + 1))!.controllers.map(Number);
    if (chosen.action === ACTION.authorizeSession && error === "")
      pending[seat]!.push({ actor: chosen.args[0]!, action: ACTION.acceptSession });
    if (chosen.action === ACTION.inviteController && error === "")
      pending[seat]!.push({ actor: chosen.args[0]!, action: ACTION.acceptController });
    if (chosen.action === ACTION.cancelInvite && error === "")
      pending[seat] = pending[seat]!.filter((x) => x.actor !== chosen.args[0]);
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
 * A deterministic walk through every case in MARKET_COVERAGE: Alice (actor 0), Bob (1) and Carol
 * (2) trade four times at once; one trade is paid in full, one in part, one not at all, one with
 * an over-payment. Buyers withdraw inside the window, sellers once final, and the market rules
 * stop the rest. Amounts come from the simulator, so the script states what it relies on and
 * fails loudly if a rule change breaks an assumption. The random market scenarios add breadth.
 */
function scriptedMarketScenario(seed: number) {
  SESSIONS.clear();
  INVITED.clear();
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
  /**
   * Every mission home (none hidden): time moves to each arrival in turn, then past the return
   * cooldown, so the next send is not TroopsResting (B-22).
   */
  const allHome = () => {
    while (w.pending.length > 0) {
      const next = w.missions.get(w.pending[0]!)!;
      if (next.arrival > now) now = next.arrival;
      ok(act(1, ACTION.advance, [10]), "advance until home");
    }
    now += rs.config.returnCooldown;
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
  const withdraw = (
    actor: number,
    trade: number,
    to: sim.Building,
    amount: number[],
    cover: string,
  ) => act(actor, ACTION.withdrawTrade, [trade, num(to.id), ...amount], cover);
  const left = (trade: number, actor: number) =>
    sim.shareLeft(w.trades.get(BigInt(trade))!, BigInt(actor + 1), now);
  const room4 = (trade: number, actor: number) =>
    settledWithdrawable(w, w.trades.get(BigInt(trade))!, BigInt(actor + 1), bld(actor), now);
  const [WEAPONS, AMMUNITION, , DOLLAR] = [0, 1, 2, 3];
  const only = (i: number, v: number) => rs.resources.map((_, k) => (k === i ? v : 0));

  // Premium on; three players next to each other; a boot camp each; movers (10000 of cargo) for
  // Alice and Bob, rowdies for everyone.
  ok(act(-1, ACTION.setGlobalPremium, [Number(T0) + 100_000_000]), "premium");
  for (let i = 0; i < 3; i++) ok(act(i, ACTION.register, [1, 1, 1 + i * 7]), "register");
  for (let i = 0; i < 3; i++) ok(act(i, ACTION.queueRoom, [bid(i), room("boot_camp")]), "camp");
  jump(3 * 86400);
  for (let i = 0; i < 2; i++) ok(act(i, ACTION.train, [bid(i), troop("mover"), 1]), "mover");
  for (let i = 0; i < 3; i++)
    ok(act(i, ACTION.train, [bid(i), troop("rowdy"), i < 2 ? 3 : 5]), "rowdies");
  jump(86400);

  // A: Alice sells Bob 2000 weapons for 4000 ammunition (2-4-1). B: Alice sells Carol 1500
  // weapons for 500 dollars (3-5-1). C: Carol sells Bob 500 ammunition for 100 dollars. D: Bob
  // sells Carol 200 weapons for 400 ammunition. E: Carol offers Alice 300 weapons for 100 dollars,
  // accepted later. F: Bob offers Carol 30000 weapons, more than his building can hold.
  const A = num(w.nextTrade);
  ok(act(0, ACTION.offerTrade, [2, bid(0), WEAPONS, 2000, 0, 4000, 0, 0]), "offer A");
  const B = num(w.nextTrade);
  ok(act(0, ACTION.offerTrade, [3, bid(0), WEAPONS, 1500, 0, 0, 0, 500]), "offer B");
  const C = num(w.nextTrade);
  ok(act(2, ACTION.offerTrade, [2, bid(2), AMMUNITION, 500, 0, 0, 0, 100]), "offer C");
  const D = num(w.nextTrade);
  ok(act(1, ACTION.offerTrade, [3, bid(1), WEAPONS, 200, 0, 400, 0, 0]), "offer D");
  const E = num(w.nextTrade);
  ok(act(2, ACTION.offerTrade, [1, bid(2), WEAPONS, 300, 0, 0, 0, 100]), "offer E");
  const F = num(w.nextTrade);
  ok(act(1, ACTION.offerTrade, [3, bid(1), WEAPONS, 30000, 0, 0, 0, 10000]), "offer F");
  expect(
    "NotOwner",
    act(1, ACTION.acceptTrade, [A, bid(0)], "accept-not-owner"),
    "deposit from Alice's building",
  );
  expect("CannotAfford", act(2, ACTION.acceptTrade, [F, bid(2)], "accept-no-stock"), "F");
  ok(act(1, ACTION.cancelTrade, [F]), "Bob withdraws F");
  ok(act(1, ACTION.acceptTrade, [A, bid(1)]), "accept A");
  ok(act(2, ACTION.acceptTrade, [B, bid(2)]), "accept B");
  ok(act(1, ACTION.acceptTrade, [C, bid(1)]), "accept C");
  ok(act(2, ACTION.acceptTrade, [D, bid(2)]), "accept D");
  const windowEnd = now + rs.config.marketWindowSeconds;
  assume(w.trades.get(BigInt(A))!.deposit[AMMUNITION] === 400n, "A: a 400 ammunition deposit");
  expect("TradeOpen", act(0, ACTION.startVacation, [], "window-vacation"), "vacation in window");
  expect(
    "InvalidTrade",
    transport(0, bld(1), units("rowdy", 1), only(WEAPONS, 10), A, "seller-ships"),
    "Alice ships A",
  );
  expect(
    "InvalidTrade",
    transport(1, bld(2), units("rowdy", 1), only(AMMUNITION, 10), A, "trade-wrong-target"),
    "Bob pays A to Carol",
  );
  expect(
    "InvalidWithdrawal",
    withdraw(0, A, bld(0), only(WEAPONS, 1), "withdraw-early"),
    "Alice withdraws A early",
  );
  expect(
    "InvalidTrade",
    withdraw(0, C, bld(0), only(AMMUNITION, 1), "withdraw-third-party"),
    "Alice withdraws C",
  );

  // Payments. A: Bob pays in full. B: Carol pays 200 of 500 dollars. D: Carol pays in full plus
  // 50 dollars (a plain transport). C: Bob pays nothing.
  ok(transport(1, bld(0), units("mover", 1), [0, 4000, 0, 0], A), "Bob pays A");
  arrive();
  ok(transport(2, bld(0), units("rowdy", 5), only(DOLLAR, 200), B), "Carol pays part of B");
  arrive();
  allHome();
  ok(transport(2, bld(1), units("rowdy", 5), [0, 400, 0, 50], D, "over-payment"), "Carol pays D");
  arrive();
  allHome();
  assume(sim.tradeFinal(w.trades.get(BigInt(A))!, now), "A is final early");
  assume(left(A, 1)[WEAPONS] === 2000n && left(A, 1)[AMMUNITION] === 400n, "A: Bob's shares");

  // Carol withdraws what B earned so far (1500 × 200 / 500 = 600 weapons), after making room.
  ok(act(2, ACTION.queueRoom, [bid(2), room("mob_school")]), "Carol makes room");
  assume(left(B, 2)[WEAPONS] === 600n && left(B, 2)[DOLLAR] === 0n, "B: 600 weapons earned");
  assume(room4(B, 2).max[WEAPONS] === 600n, "Carol has room for them");
  expect(
    "InvalidWithdrawal",
    withdraw(2, B, bld(2), only(WEAPONS, 601), "withdraw-over-share"),
    "over share",
  );
  expect("InvalidWithdrawal", withdraw(2, B, bld(2), [0, 0, 0, 0], "withdraw-zero"), "zero");
  expect(
    "NotOwner",
    withdraw(2, B, bld(0), only(WEAPONS, 10), "withdraw-not-owner"),
    "into Alice's building",
  );
  ok(withdraw(2, B, bld(2), only(WEAPONS, 300), "withdraw-buyer"), "Carol withdraws");
  ok(withdraw(2, B, bld(2), only(WEAPONS, 300), "withdraw-buyer"), "Carol withdraws again");

  // The last second of the window: any payment would arrive after it.
  now = windowEnd;
  expect(
    "InvalidTrade",
    transport(1, bld(2), units("rowdy", 3), only(DOLLAR, 100), C, "late-payment"),
    "Bob pays C too late",
  );

  // The windows close. B: Alice gets 900 weapons and ⌈50 × 300 / 500⌉ = 30 dollars, Carol 20.
  // C: Carol gets her 500 ammunition and Bob's 10-dollar deposit back.
  now = windowEnd + 1n;
  assume(left(B, 0)[WEAPONS] === 900n && left(B, 0)[DOLLAR] === 30n, "B: Alice's shares");
  assume(left(B, 2)[DOLLAR] === 20n, "B: Carol's deposit share");
  assume(left(C, 2)[AMMUNITION] === 500n && left(C, 2)[DOLLAR] === 10n, "C: Carol's shares");
  assume(
    left(C, 1).every((x) => x === 0n),
    "C: nothing for Bob",
  );
  expect(
    "SharesLeft",
    act(0, ACTION.offerTrade, [2, bid(0), WEAPONS, 300, 0, 0, 0, 100], "shares-left-offer"),
    "Alice offers with B's shares left",
  );
  expect("SharesLeft", act(0, ACTION.acceptTrade, [E, bid(0)], "shares-left-accept"), "accept E");
  ok(withdraw(0, B, bld(0), only(WEAPONS, 900), "withdraw-seller"), "Alice withdraws B");

  // Bob's weapons are near the cap: A's 2000 do not fit at once.
  const bob = room4(A, 1);
  assume(bob.free[WEAPONS]! < 2000n, "Bob's free capacity binds");
  expect(
    "InvalidWithdrawal",
    withdraw(1, A, bld(1), only(WEAPONS, num(bob.free[WEAPONS]!) + 1), "withdraw-over-capacity"),
    "over capacity",
  );
  ok(withdraw(1, A, bld(1), only(AMMUNITION, 400), "withdraw-buyer"), "Bob takes the deposit back");
  ok(act(1, ACTION.queueRoom, [bid(1), room("mob_school")]), "Bob makes room");
  ok(withdraw(1, A, bld(1), only(WEAPONS, 1000), "withdraw-buyer"), "Bob withdraws part of A");
  return { actors: 3, seed, steps };
}

/**
 * A deterministic walk through the controller rules (B-26, B-15): invitations accepted by the
 * invited address (or not: wrong player, cancelled, expired, dead with the epoch), kinds, a
 * scheduled removal (pending, cancelled, executed), immediate self-removal, and a transfer in two
 * steps accepted by its target, also while suspended. The bots add breadth. Actor 0 is the phone,
 * 1 another player, 2000+ devices, 2001 a recovery code, 500 a session, 1000+ transfer targets.
 */
function scriptedControllersScenario(seed: number) {
  SESSIONS.clear();
  INVITED.clear();
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
  const TTL = Number(rs.config.inviteTtl);
  const P = () => w.players.get(1n)!;
  const invite = (by: number, who: number, recovery: number) => {
    INVITED.add(`${who}:1`);
    return act(by, ACTION.inviteController, [who, recovery]);
  };
  const inviteSession = (by: number, who: number, until: number) => {
    SESSIONS.add(String(who));
    INVITED.add(`${who}:1`);
    return act(by, ACTION.authorizeSession, [who, until]);
  };

  ok(act(0, ACTION.register, [1, 1, 1]), "the phone registers");
  ok(act(1, ACTION.register, [1, 1, 8]), "another player registers");
  ok(invite(0, 2000, 0), "a laptop invited");
  assume(!w.playerOf.has("2000"), "an invitation binds nothing");
  expect("NoInvite", act(2000, ACTION.acceptController, [2]), "for another player");
  ok(act(2000, ACTION.acceptController, [1]), "the laptop accepts");
  ok(invite(0, 2001, 1), "a recovery code invited");
  ok(act(2001, ACTION.acceptController, [1]), "the code accepts");
  ok(inviteSession(0, 500, Number(now) + DAY), "a session invited");
  expect("NotRegistered", act(500, ACTION.queueRoom, [1, room("boss_office")]), "not bound yet");
  ok(act(500, ACTION.acceptSession, [1]), "the session accepts");
  assume(P().recovery.has("2001") && !P().recovery.has("2000"), "the code is flagged");
  assume(sim.sessionPlayer(w, "500", now) === 1n, "the session plays");

  // The laptop schedules the phone's removal: every session and invitation dies now, the phone
  // keeps its rights.
  ok(invite(0, 2002, 0), "another device invited");
  ok(act(2000, ACTION.removeController, [0]), "the laptop schedules the phone's removal");
  assume(
    P().removalAt.get("0") === now + BigInt(DELAY) &&
      P().sessionEpoch === 1n &&
      sim.sessionPlayer(w, "500", now) === undefined,
    "scheduled, sessions dead",
  );
  expect("NoInvite", act(2002, ACTION.acceptController, [1]), "the invitation died with the epoch");
  ok(act(0, ACTION.queueRoom, [1, room("boss_office")]), "the phone still plays");
  expect("RemovalPending", act(2000, ACTION.removeController, [0]), "not due yet");
  ok(act(0, ACTION.cancelRemoval, [0]), "the phone cancels its own removal");
  expect("NoRemoval", act(0, ACTION.cancelRemoval, [0]), "nothing to cancel");
  expect("NoRemoval", act(0, ACTION.cancelRemoval, [1]), "another player's controller");
  ok(inviteSession(0, 500, Number(now) + DAY), "the session invited again");
  ok(act(500, ACTION.acceptSession, [1]), "and accepted again");
  expect("NotController", act(500, ACTION.cancelRemoval, [0]), "a session cannot cancel");
  expect("NotController", act(500, ACTION.removeController, [0]), "a session cannot remove");
  expect("NotController", act(500, ACTION.inviteController, [2003, 0]), "nor invite");
  expect("NotController", act(500, ACTION.cancelInvite, [2002]), "nor cancel an invitation");

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

  // Invitations are cancelled, or expire.
  ok(invite(2001, 2004, 0), "a device invited");
  ok(act(2001, ACTION.cancelInvite, [2004]), "and uninvited");
  expect("NoInvite", act(2004, ACTION.acceptController, [1]), "cancelled");
  expect("NoInvite", act(2001, ACTION.cancelInvite, [2004]), "nothing left to cancel");
  ok(invite(2001, 2005, 0), "another device invited");
  jump(TTL);
  expect("NoInvite", act(2005, ACTION.acceptController, [1]), "expired");

  // Transfers: scheduled, pending, re-scheduled, cancelled, checked again when the target accepts.
  ok(invite(2001, 2002, 0), "a new device invited");
  ok(act(2002, ACTION.acceptController, [1]), "and in");
  ok(act(2001, ACTION.transferPlayer, [1000]), "transfer scheduled");
  expect("TransferPending", act(2001, ACTION.transferPlayer, [1000]), "already scheduled");
  expect("TransferPending", act(1000, ACTION.acceptTransfer, [1]), "not due yet");
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
  expect("ControllerTaken", act(1000, ACTION.acceptTransfer, [1]), "checked again when accepting");
  ok(act(2001, ACTION.transferPlayer, [1002]), "scheduled to a free address");
  expect("NoTransfer", act(1000, ACTION.acceptTransfer, [1]), "not the target any more");
  jump(3 * DAY);
  ok(act(1002, ACTION.acceptTransfer, [1]), "the target takes the account");
  assume(
    P().controllers.join() === "1002" &&
      P().transferTo === "" &&
      P().removalAt.size === 0 &&
      P().recovery.size === 0 &&
      P().sessionEpoch === 5n, // two removals scheduled, one executed, a self-removal, the transfer
    "transferred, clean",
  );

  // A self-removal drops its own schedule; managing works while suspended, transferring and
  // accepting a transfer do not.
  ok(invite(1002, 2003, 0), "a device invited");
  ok(act(2003, ACTION.acceptController, [1]), "and in");
  ok(act(1002, ACTION.removeController, [2003]), "its removal scheduled");
  ok(act(2003, ACTION.removeController, [2003]), "it removes itself at once");
  expect("NoRemoval", act(1002, ACTION.cancelRemoval, [2003]), "the schedule went with it");
  ok(act(1002, ACTION.transferPlayer, [1003]), "a transfer scheduled before the suspension");
  ok(act(-1, ACTION.suspend, [1, Number(now) + 4 * DAY]), "suspended");
  expect("Suspended", act(1002, ACTION.transferPlayer, [1004]), "no transfer while suspended");
  jump(3 * DAY + 1);
  expect("Suspended", act(1003, ACTION.acceptTransfer, [1]), "no accepting while suspended");
  ok(invite(1002, 2006, 0), "inviting works suspended");
  ok(act(2006, ACTION.acceptController, [1]), "accepting works suspended");
  ok(act(1002, ACTION.removeController, [2006]), "scheduling works suspended");
  ok(act(1002, ACTION.cancelRemoval, [2006]), "cancelling works suspended");
  ok(act(1002, ACTION.cancelTransfer, []), "cancelling the transfer works suspended");
  return { actors: 2, seed, steps };
}

/**
 * Scripted walk-through of the reveal order window and the return cooldown (B-22): the second of
 * two hidden missions waits for the first (parked or still queued), garbage ahead holds it for the
 * window only, and an attack timed after the enemy's return still catches the troops although a
 * garbage mission parked in between delays its reveal past the window.
 */
function scriptedHiddenScenario(seed: number) {
  SESSIONS.clear();
  INVITED.clear();
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
    if (got !== want) throw new Error(`scripted hidden: ${what}: expected "${want}", got "${got}"`);
  };
  const assume = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`scripted hidden: ${what}`);
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
  const rowdies = (n: number) => rs.troops.map((t) => (t.id === "rowdy" ? n : 0));
  const COVER = 3; // enough for the neighbours' distance
  const hidden = (actor: number, to: sim.Building, n: number, salt: number, fixed = NATURAL) =>
    act(actor, ACTION.sendHiddenMission, [
      bid(actor),
      sim.ATTACK,
      ...at(to),
      salt,
      COVER,
      ...rowdies(n),
      0,
      0,
      0,
      0,
      fixed,
    ]);
  const reveal = (id: number, to: sim.Building, salt: number) =>
    act(ANYONE, ACTION.reveal, [id, sim.ATTACK, ...at(to), salt]);
  const transport = (actor: number, to: sim.Building, n: number) =>
    act(actor, ACTION.sendMission, [
      bid(actor),
      sim.TRANSPORT,
      ...at(to),
      ...rowdies(n),
      0,
      0,
      0,
      0,
      0,
    ]);
  const last = () => num(w.nextMission) - 1;
  const arrival = (id: number) => w.missions.get(BigInt(id))!.arrival;
  const ROWDY = troop("rowdy");
  const WINDOW = rs.config.hiddenOrderWindow;
  const COOLDOWN = rs.config.returnCooldown;
  const GRACE = rs.config.hiddenRevealGrace;

  // Premium on; Alice (0) and Bob (1) next to each other, with rowdies.
  ok(act(-1, ACTION.setGlobalPremium, [Number(T0) + 100_000_000]), "premium");
  ok(act(0, ACTION.register, [1, 1, 1]), "Alice registers");
  ok(act(1, ACTION.register, [1, 1, 2]), "Bob registers");
  ok(act(0, ACTION.queueRoom, [bid(0), room("boot_camp")]), "Alice's camp");
  ok(act(1, ACTION.queueRoom, [bid(1), room("boot_camp")]), "Bob's camp");
  jump(3 * 86400);
  ok(act(0, ACTION.train, [bid(0), ROWDY, 7]), "Alice's rowdies"); // the stock cap: 7 at once
  ok(act(1, ACTION.train, [bid(1), ROWDY, 7]), "Bob's rowdies");
  jump(86400);

  // 1. Garbage ahead: two hidden missions a second apart, nobody reveals the first. The second
  // waits for the first's window, parked.
  ok(hidden(0, bld(1), 1, 11), "garbage g1");
  const g1 = last();
  jump(1);
  ok(hidden(0, bld(1), 1, 12), "h1");
  const h1 = last();
  assume(arrival(h1) === arrival(g1) + 1n, "a second apart");
  now = arrival(h1);
  ok(act(1, ACTION.advance, [10]), "both parked");
  assume(w.parked.length === 2, "both parked");
  now = arrival(g1) + WINDOW - 1n;
  expect("OutOfOrder", reveal(h1, bld(1), 12), "held by g1 within its window (parked)");
  now = arrival(g1) + WINDOW;
  ok(reveal(h1, bld(1), 12), "the window passed: h1 overtakes g1");
  ok(act(1, ACTION.advance, [10]), "h1 resolves");
  now = arrival(g1) + GRACE;
  ok(act(ANYONE, ACTION.forfeit, [g1]), "g1 forfeited");

  // 2. Both revealable, still queued: the later waits for the earlier, which frees it.
  jump(86400);
  ok(hidden(0, bld(1), 1, 21), "a2");
  const a2 = last();
  jump(1);
  ok(hidden(0, bld(1), 1, 22), "b2");
  const b2 = last();
  now = arrival(b2) + 2n;
  expect("OutOfOrder", reveal(b2, bld(1), 22), "the reveal drains, parks both: b2 is held");
  assume(w.parked.length === 0, "the failed reveal left nothing parked");
  ok(reveal(a2, bld(1), 21), "a2 revealed");
  ok(reveal(b2, bld(1), 22), "a2 on its way frees b2");
  ok(act(1, ACTION.advance, [10]), "both resolve");

  // 3. The interception: Bob's troops come home at R; his own garbage lands at R+1 and Alice's
  // attack at R+2. The garbage holds the attack's reveal until R+16; Bob's troops rest until R+30.
  jump(86400);
  const copy = (() => {
    const { rs: r, ...rest } = w;
    return { ...structuredClone(rest), rs: r } as sim.World;
  })();
  const probe = sim.sendMission(
    copy,
    "1",
    bld(1).id,
    sim.TRANSPORT,
    bld(0).coord,
    rowdies(5).map(BigInt),
    [0n, 0n, 0n, 0n],
    0n,
    now,
  );
  sim.advance(copy, 10, copy.missions.get(probe)!.arrival);
  const roundTrip = copy.missions.get(probe)!.arrival - now;
  const hiddenTrip =
    copy.missions.get(
      sim.sendHiddenMission(
        copy,
        "0",
        bld(0).id,
        sim.hiddenCommit(1n, sim.ATTACK, bld(1).coord, 1n),
        BigInt(COVER),
        rowdies(1).map(BigInt),
        [0n, 0n, 0n, 0n],
        BigInt(NATURAL),
        now,
      ),
    )!.arrival - now;
  ok(transport(1, bld(0), 5), "Bob's troops go out and come back");
  const R = now + roundTrip;
  now = R + 1n - hiddenTrip;
  ok(hidden(1, bld(0), 1, 31), "Bob's garbage g3 (no second account needed)");
  const g3 = last();
  now = R + 2n - hiddenTrip;
  ok(hidden(0, bld(1), 3, 32), "the attack");
  const a3 = last();
  assume(arrival(g3) === R + 1n && arrival(a3) === R + 2n, "timed after the return");
  now = R;
  ok(act(1, ACTION.advance, [10]), "Bob's troops are home");
  assume(bld(1).troops[ROWDY] === 6n && bld(1).lastReturn === R, "home at R");
  now = R + 10n;
  expect("OutOfOrder", reveal(a3, bld(1), 32), "the keeper's reveal is held by g3");
  now = R + 15n;
  expect("TroopsResting", transport(1, bld(0), 5), "Bob cannot slip away (public send)");
  now = R + 16n;
  ok(reveal(a3, bld(1), 32), "g3's window passed");
  assume(w.parked.length === 1 && w.parked[0] === BigInt(g3), "g3 stays parked");
  ok(act(1, ACTION.advance, [10]), "the battle, 3 rowdies against 6 at home");
  const a3m = w.missions.get(BigInt(a3));
  assume(a3m === undefined || a3m.troops[ROWDY]! < 3n, "the attack met the defenders");
  now = R + COOLDOWN - 1n;
  expect("TroopsResting", hidden(1, bld(0), 1, 41), "still resting (hidden send)");
  now = R + COOLDOWN;
  ok(hidden(1, bld(0), 1, 42), "the cooldown is over");
  // A fixed arrival: from the natural one to the slack after it.
  const natural = num(now + hiddenTrip);
  const SLACK = num(rs.config.hiddenArrivalSlack);
  expect("TooLate", hidden(0, bld(1), 1, 51, natural - 1), "before the natural arrival");
  expect("InvalidArrival", hidden(0, bld(1), 1, 52, natural + SLACK + 1), "past the slack");
  ok(hidden(0, bld(1), 1, 53, natural + SLACK), "at the end of the slack");
  assume(arrival(last()) === BigInt(natural + SLACK), "it arrives when fixed");
  now = arrival(g3) + GRACE;
  ok(act(ANYONE, ACTION.forfeit, [g3]), "g3 forfeited");
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
  scriptedHiddenScenario(20311014),
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
const errors = (name: string) => steps.filter((x) => x.error === name).length;
// The B-22 timing rules must be exercised by the replay (recorded reverts, not candidates).
for (const name of ["TroopsResting", "OutOfOrder", "TooLate", "InvalidArrival"]) {
  if (errors(name) === 0) throw new Error(`no scenario step reverts ${name}`);
}
console.log(
  `packages/rules/generated/scenarios/vendetta/: ${scenarios.length} scenarios, ${steps.length} steps, ` +
    `${steps.filter((x) => x.error).length} expected reverts; ok: ${count(ACTION.train)} train, ` +
    `${count(ACTION.sendMission)} missions, ${count(ACTION.sendHiddenMission)} hidden, ` +
    `${count(ACTION.reveal)} reveals, ${count(ACTION.forfeit)} forfeits, ` +
    `${count(ACTION.recall)} recalls, ${count(ACTION.abandon)} abandons, ` +
    `${count(ACTION.authorizeSession)} sessions (${count(ACTION.acceptSession)} accepted), ` +
    `${count(ACTION.inviteController)} invited + ${count(ACTION.acceptController)} joined - ` +
    `${count(ACTION.removeController)} controllers (${EXECUTED.removals} executed, ` +
    `${count(ACTION.cancelRemoval)} cancelled), ${EXECUTED.transfers} transfers executed, ` +
    `${count(ACTION.acceptTrade)} trades accepted, ${count(ACTION.withdrawTrade)} withdrawals, ` +
    `${errors("SharesLeft")} SharesLeft, ${errors("TroopsResting")} TroopsResting, ` +
    `${errors("OutOfOrder")} OutOfOrder`,
);
