// Combat forecast for the attack form (blockchain.md B-20): the battle an attack would fight if
// nothing the world does not know yet happens before it arrives. Client only: no contract
// counterpart, it replays the same state machine on a copy of the world.
import { coordKey, ATTACK, type World } from "./state.js";
import type { Coord } from "./common.js";
import { processDue, sendMission } from "./missions.js";
import { settle } from "./settle.js";

export interface AttackForecast {
  arrival: bigint;
  /** Units per troop type on each side when the battle starts, and those left after it. */
  attacker: bigint[];
  attackerLeft: bigint[];
  defender: bigint[];
  defenderLeft: bigint[];
  /** Loot per resource; only when the defender is left without troops (D-06). */
  loot: bigint[];
}

const before = (w: World, a: bigint, b: bigint) => {
  const x = w.missions.get(a)!;
  const y = w.missions.get(b)!;
  return x.arrival < y.arrival || (x.arrival === y.arrival && x.seq < y.seq);
};

/**
 * Sends the attack on a copy of `w` and runs the copy up to its battle: production, queues,
 * research and every known mission that resolves first are counted; hidden missions nobody has
 * revealed are not (they park, B-22). `arrival` overrides the natural one (a hidden mission arrives
 * at the time it is sent with). Returns null when no battle would happen (an empty slot or one's
 * own building at arrival); throws GameError when the send itself would revert. `w` is not changed.
 */
export function forecastAttack(
  w: World,
  controller: string,
  buildingId: bigint,
  target: Coord,
  troops: bigint[],
  now: bigint,
  arrival?: bigint,
): AttackForecast | null {
  const { rs, ...rest } = w;
  const c = Object.assign(structuredClone(rest), { rs }) as World;
  const none = rs.resources.map(() => 0n);
  const id = sendMission(c, controller, buildingId, ATTACK, target, troops, none, 0n, now);
  const m = c.missions.get(id)!;
  if (arrival !== undefined && arrival !== m.arrival) {
    m.arrival = arrival;
    c.pending.splice(c.pending.indexOf(id), 1);
    let i = c.pending.length;
    while (i > 0 && before(c, id, c.pending[i - 1]!)) i--;
    c.pending.splice(i, 0, id);
  }
  const at = m.arrival;
  while (c.pending[0] !== id) processDue(c, at, 1);

  const b = c.buildings.get(c.buildingAt.get(coordKey(target)) ?? 0n);
  if (!b || b.owner === m.owner) return null;
  settle(c, b, at, m.seq);
  const attacker = [...m.troops];
  const defender = [...b.troops];
  processDue(c, at, 1); // the battle; the mission turns around
  return {
    arrival: at,
    attacker,
    attackerLeft: [...m.troops],
    defender,
    defenderLeft: [...b.troops],
    loot: [...m.cargo],
  };
}
