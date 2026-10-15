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

export interface Building {
  id: bigint;
  owner: bigint;
  coord: { city: bigint; neighborhood: bigint; slot: bigint };
  levels: bigint[];
  stock: bigint[]; // per resource, in units of 1/STOCK_SCALE
  lastUpdate: bigint;
  roomQueue: QueueItem[];
  centipoints: bigint;
}

export interface Player {
  id: bigint;
  controller: string;
  research: bigint[];
  researchQueue: QueueItem[];
  researchBuilding: bigint; // building of the research queue, 0 when the queue is empty
  buildings: bigint;
  centipoints: bigint; // rooms of every building + research (B-19)
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
  };
}

export const coordKey = (c: Building["coord"]) => `${c.city}:${c.neighborhood}:${c.slot}`;
