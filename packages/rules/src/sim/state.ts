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
}

export interface Building {
  id: bigint;
  owner: bigint;
  coord: { city: bigint; neighborhood: bigint; slot: bigint };
  levels: bigint[];
  stock: bigint[]; // per resource, in units of 1/STOCK_SCALE
  lastUpdate: bigint;
  roomQueue: QueueItem[];
  centipoints: bigint; // rooms only (per-building ranking)
  troops: bigint[]; // units at home
  training: [TrainingItem[], TrainingItem[]]; // attack and defense training rooms
}

export interface Player {
  id: bigint;
  controller: string;
  research: bigint[];
  researchQueue: QueueItem[];
  researchBuilding: bigint; // building of the research queue, 0 when the queue is empty
  buildings: bigint;
  centipoints: bigint; // rooms of every building + research + troops at home and in missions (B-19)
  missions: bigint; // missions in flight, outbound or returning (B-09)
  vacationUntil: bigint; // on vacation while now < vacationUntil (D-18)
  suspendedUntil: bigint; // suspended while now < suspendedUntil (B-14)
  premiumUntil: bigint; // B-25
  family: bigint; // valid only while that family is alive
  rank: number; // CAPO, SUBCAPO, MEMBER
  applications: bigint[]; // families applied to (B-31)
  offers: bigint[]; // trades where this player is the seller (B-09 cap)
  sessionEpoch: bigint; // bumped by transferPlayer: older sessions stop working (B-15)
}

/** A session key: an address allowed to play for a player until `until` (B-15). */
export interface Session {
  player: bigint;
  until: bigint;
  epoch: bigint;
}

export interface World {
  rs: Ruleset;
  seq: bigint;
  globalPremiumUntil: bigint; // B-25: the admin can give premium to every player for a while
  nextPlayer: bigint;
  nextBuilding: bigint;
  players: Map<bigint, Player>;
  buildings: Map<bigint, Building>;
  playerOf: Map<string, bigint>; // controller → player
  buildingAt: Map<string, bigint>; // "city:neighborhood:slot" → building
  nextMission: bigint;
  missions: Map<bigint, Mission>;
  /** The global mission queue (B-07): ids ordered by (arrival, seq). */
  pending: bigint[];
  nextFamily: bigint;
  families: Map<bigint, Family>;
  familyNames: Map<string, bigint>; // "tag:<lowercase>" / "name:<lowercase>" → family
  nextWar: bigint;
  wars: Map<bigint, War>;
  activeWar: Map<string, bigint>; // "<low>:<high>" family pair → running war
  nextTrade: bigint;
  trades: Map<bigint, Trade>;
  sessions: Map<string, Session>; // session address → authorization
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
    nextFamily: 1n,
    families: new Map(),
    familyNames: new Map(),
    nextWar: 1n,
    wars: new Map(),
    activeWar: new Map(),
    nextTrade: 1n,
    trades: new Map(),
    sessions: new Map(),
  };
}

export const coordKey = (c: Building["coord"]) => `${c.city}:${c.neighborhood}:${c.slot}`;
