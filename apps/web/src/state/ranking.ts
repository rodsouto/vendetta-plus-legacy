// Ranking by points (08-progression.md#ranking, B-18), computed from the world the client already
// loads, projected to `at` (B-20). The projection settles every building (B-06), so a player whose
// queues finished ranks with its current points even if no transaction has touched its buildings
// since. It uses no hidden-mission plaintext (B-22): a due hidden mission stays parked until its
// reveal is on chain, as the contract has it, so every client shows the same ranking whatever
// plaintexts it holds. Families rank on the sum of their members' points. Ties go to the lower id,
// the older account or family.
import { sim } from "@vendetta/rules";
import { project } from "../chain/load.js";

export interface PlayerRow {
  id: bigint;
  centipoints: bigint;
  buildings: bigint;
}

export interface FamilyRow {
  id: bigint;
  tag: string;
  name: string;
  members: bigint;
  centipoints: bigint;
}

const byPoints = (
  a: { id: bigint; centipoints: bigint },
  b: { id: bigint; centipoints: bigint },
) =>
  a.centipoints !== b.centipoints
    ? a.centipoints > b.centipoints
      ? -1
      : 1
    : a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0;

/** Every player and every live family of the loaded world `w` at `at`, best first. */
export function ranking(w: sim.World, at: bigint): { players: PlayerRow[]; families: FamilyRow[] } {
  const p = project(w, at);
  const families = new Map<bigint, FamilyRow>();
  for (const f of p.families.values())
    if (f.alive)
      families.set(f.id, { id: f.id, tag: f.tag, name: f.name, members: 0n, centipoints: 0n });
  const players: PlayerRow[] = [];
  for (const x of p.players.values()) {
    players.push({ id: x.id, centipoints: x.centipoints, buildings: x.buildings });
    const f = families.get(sim.familyOf(p, x));
    if (f) {
      f.members += 1n;
      f.centipoints += x.centipoints;
    }
  }
  return { players: players.sort(byPoints), families: [...families.values()].sort(byPoints) };
}
