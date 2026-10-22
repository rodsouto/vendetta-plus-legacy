// World state of the on-chain game, mirrored in TypeScript (blockchain.md B-20). The shape follows
// contracts/src/storage: ids are bigint, stocks are in 1/STOCK_SCALE units (B-27), levels per index.
import { rateDenominator } from "../economy.js";
import type { Ruleset } from "../ruleset.js";

/** A queue item. `finishAt` = 0 while it has not started (B-29: duration is computed at start). */
export interface QueueItem {
  index: number; // room or research index
  seq: bigint; // global creation order, breaks ties between events at the same second (D-08)
  finishAt: bigint;
}

/** A troop batch: paid when queued, delivered whole when it finishes. */
export interface TrainingItem extends QueueItem {
  quantity: bigint;
}

export const ATTACK = 1;
export const STATION = 2;
export const TRANSPORT = 3;
export const OCCUPY = 4;

export interface Mission {
  id: bigint;
  owner: bigint;
  origin: bigint; // building the troops left from and return to
  kind: number; // ATTACK, STATION, TRANSPORT, OCCUPY
  returning: boolean;
  target: { city: bigint; neighborhood: bigint; slot: bigint };
  start: bigint;
  arrival: bigint;
  duration: bigint; // one-way travel time; the return takes the same
  seq: bigint; // order among missions arriving at the same second (D-08)
  troops: bigint[];
  cargo: bigint[]; // whole resources, ruleset order
  trade: bigint; // market trade this transport delivers for (D-19), 0 = none
  from: { city: bigint; neighborhood: bigint; slot: bigint }; // coordinate of the origin at send
  // Hidden missions (B-22): kind and target stay 0 until revealed; public missions have cover 0.
  hidden: boolean; // kind and target not revealed yet
  cover: bigint; // declared distance in grid units (≥ the real one) that duration and salary used
  commit: string; // keccak256(abi.encode(owner, kind, city, neighborhood, slot, salt)), 0x-hex
}

export const CAPO = 1;
export const SUBCAPO = 2;
export const MEMBER = 3;

export interface Family {
  id: bigint;
  alive: boolean; // false once dissolved: memberships, applications and wars pointing to it lapse
  tag: string;
  name: string;
  members: bigint;
}

export const OFFER_NONE = 0;
export const OFFER_SURRENDER = 1;
export const OFFER_DRAW = 2;

export interface War {
  id: bigint;
  a: bigint; // declaring family
  b: bigint;
  lostA: bigint; // centipoints of troops lost by members of a in battles against b
  lostB: bigint;
  ended: boolean;
  winner: bigint; // 0 = draw (or still running)
  offer: number; // OFFER_*
  offerBy: bigint; // family that made the offer
}

export interface Trade {
  id: bigint;
  seller: bigint;
  buyer: bigint;
  sold: number; // resource index
  quantity: bigint;
  price: bigint[]; // per resource
  delivered: bigint;
  paid: bigint[];
  accepted: boolean;
  acceptedAt: bigint;
  rate: number; // index of the exchange rate the price matched (B-11): values the default (D-19)
  registered: boolean; // the creditor claimed once: the debt counts in Player.debts and owes
  returned: bigint[]; // restitution received by the creditor after the window, per resource
}

export interface Building {
  id: bigint;
  owner: bigint;
  coord: { city: bigint; neighborhood: bigint; slot: bigint };
  levels: bigint[];
  stock: bigint[]; // per resource, in units of 1/STOCK_SCALE
  lastUpdate: bigint;
  lastReturn: bigint; // returning troops came home then; sends wait returnCooldown (B-22)
  roomQueue: QueueItem[];
  centipoints: bigint; // rooms only (per-building ranking)
  troops: bigint[]; // units at home
  training: [TrainingItem[], TrainingItem[]]; // attack and defense training rooms
}

export interface Player {
  id: bigint;
  /** Addresses that manage the account: devices and recovery codes, 1..maxControllers (B-26). */
  controllers: string[];
  research: bigint[];
  researchQueue: QueueItem[];
  researchBuilding: bigint; // building of the research queue, 0 when the queue is empty
  buildings: bigint;
  centipoints: bigint; // rooms of every building + research + troops at home and in missions (B-19)
  missions: bigint; // missions in flight, outbound or returning (B-09)
  vacationUntil: bigint; // on vacation while now < vacationUntil (D-18)
  vacationStart: bigint; // when the last vacation started: hidden missions sent during it bounce (B-22)
  suspendedUntil: bigint; // suspended while now < suspendedUntil (B-14)
  premiumUntil: bigint; // B-25
  family: bigint; // valid only while that family is alive
  rank: number; // CAPO, SUBCAPO, MEMBER
  applications: bigint[]; // families applied to (B-31)
  offers: bigint[]; // trades where this player is the seller (B-09 cap)
  sessionEpoch: bigint; // bumped by transferPlayer and removeController: older sessions stop working (B-15)
  debts: number; // registered trade debts not yet paid (B-11): restricts market, vacation and transports
  tradeLockUntil: bigint; // latest window end of an accepted trade: no vacation while now ≤ it (D-18)
  /** Controllers whose removal is scheduled → when it can be executed (B-26). */
  removalAt: Map<string, bigint>;
  /** Controllers that are recovery codes rather than devices (B-15). */
  recovery: Set<string>;
  transferTo: string; // pending transfer target (B-26), "" = none
  transferAt: bigint; // when the pending transfer can be accepted
  vacationSeq: bigint; // creation order of the last vacation start: same-second sends (B-07, B-22)
}

/** A session key: an address allowed to play for a player until `until` (B-15). */
export interface Session {
  player: bigint;
  until: bigint;
  epoch: bigint;
}

export const INVITE_SESSION = 1;
export const INVITE_CONTROLLER = 2;

/**
 * An invitation to play for a player as a session, or to manage it as a controller (B-15, B-26):
 * the invited address binds itself by accepting, nobody binds it. Dies with the player's epoch.
 */
export interface Invite {
  kind: number; // INVITE_*
  recovery: boolean; // controller invitations: a recovery code rather than a device
  until: bigint; // sessions: the authorization's end; controllers: when the invitation expires
  epoch: bigint; // the player's sessionEpoch when invited
}

/** Key of `World.invites`: the invited address and the player. */
export const inviteKey = (invited: string, player: bigint) => `${invited}:${player}`;

export interface World {
  rs: Ruleset;
  seq: bigint;
  globalPremiumUntil: bigint; // B-25: the admin can give premium to every player for a while
  nextPlayer: bigint;
  nextBuilding: bigint;
  players: Map<bigint, Player>;
  buildings: Map<bigint, Building>;
  playerOf: Map<string, bigint>; // controller (any of them) → player
  buildingAt: Map<string, bigint>; // "city:neighborhood:slot" → building
  nextMission: bigint;
  missions: Map<bigint, Mission>;
  /** The global mission queue (B-07): ids ordered by (arrival, seq). */
  pending: bigint[]; // the global queue (B-07), in (arrival, seq) order
  parked: bigint[]; // due hidden missions nobody revealed yet, out of the queue (B-22), in (arrival, seq) order
  nextFamily: bigint;
  families: Map<bigint, Family>;
  familyNames: Map<string, bigint>; // "tag:<lowercase>" / "name:<lowercase>" → family
  nextWar: bigint;
  wars: Map<bigint, War>;
  activeWar: Map<string, bigint>; // "<low>:<high>" family pair → running war
  nextTrade: bigint;
  trades: Map<bigint, Trade>;
  owes: Map<string, number>; // "debtor:creditor" → registered unpaid debts between them (B-11)
  sessions: Map<string, Session>; // session address → authorization
  invites: Map<string, Invite>; // inviteKey(address, player) → invitation (B-15, B-26)
}

/** Units per resource: 3600 s × rate denominator (B-27). */
export const stockScale = (rs: Ruleset) => 3600n * rateDenominator(rs);

export function newWorld(rs: Ruleset): World {
  return {
    rs,
    seq: 0n,
    globalPremiumUntil: 0n,
    nextPlayer: 1n,
    nextBuilding: 1n,
    players: new Map(),
    buildings: new Map(),
    playerOf: new Map(),
    buildingAt: new Map(),
    nextMission: 1n,
    missions: new Map(),
    pending: [],
    parked: [],
    nextFamily: 1n,
    families: new Map(),
    familyNames: new Map(),
    nextWar: 1n,
    wars: new Map(),
    activeWar: new Map(),
    nextTrade: 1n,
    trades: new Map(),
    owes: new Map(),
    sessions: new Map(),
    invites: new Map(),
  };
}

export const coordKey = (c: Building["coord"]) => `${c.city}:${c.neighborhood}:${c.slot}`;
