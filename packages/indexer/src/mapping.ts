// Ranking (B-18): players' points and buildings, and families with the sum of their members' points.
import { BigInt } from "@graphprotocol/graph-ts";
import {
  BuildingAbandoned,
  BuildingOccupied,
  FamilyChanged,
  FamilyCreated,
  FamilyDissolved,
  PlayerRegistered,
  PointsChanged,
} from "../generated/Game/IGameEvents";
import { Family, Player } from "../generated/schema";

function player(id: BigInt): Player {
  let p = Player.load(id.toString());
  if (p == null) {
    p = new Player(id.toString());
    p.centipoints = BigInt.zero();
    p.buildings = 0;
  }
  return p;
}

/** The player's family while it is alive (a dissolved family keeps no members). */
function familyOf(p: Player): Family | null {
  const id = p.family;
  if (id == null) return null;
  const f = Family.load(id!);
  return f != null && f.alive ? f : null;
}

function join(p: Player, id: string): void {
  if (p.family == id) return;
  leave(p);
  const f = Family.load(id)!;
  f.centipoints = f.centipoints.plus(p.centipoints);
  f.save();
  p.family = id;
}

function leave(p: Player): void {
  const f = familyOf(p);
  if (f != null) {
    f.centipoints = f.centipoints.minus(p.centipoints);
    f.save();
  }
  p.family = null;
}

export function handlePlayerRegistered(e: PlayerRegistered): void {
  const p = player(e.params.player);
  p.buildings = 1;
  p.save();
}

export function handlePointsChanged(e: PointsChanged): void {
  const p = player(e.params.player);
  const f = familyOf(p);
  if (f != null) {
    f.centipoints = f.centipoints.minus(p.centipoints).plus(e.params.centipoints);
    f.save();
  }
  p.centipoints = e.params.centipoints;
  p.save();
}

export function handleBuildingOccupied(e: BuildingOccupied): void {
  const p = player(e.params.player);
  p.buildings = p.buildings + 1;
  p.save();
}

export function handleBuildingAbandoned(e: BuildingAbandoned): void {
  const p = player(e.params.player);
  p.buildings = p.buildings - 1;
  p.save();
}

export function handleFamilyCreated(e: FamilyCreated): void {
  const f = new Family(e.params.family.toString());
  f.tag = e.params.tag;
  f.name = e.params.name;
  f.alive = true;
  f.members = 1;
  f.centipoints = BigInt.zero();
  f.save();
  const p = player(e.params.capo);
  join(p, f.id);
  p.save();
}

/** rank 0 = left or expelled; otherwise joined or promoted (FamilyChanged in the contract). */
export function handleFamilyChanged(e: FamilyChanged): void {
  const p = player(e.params.player);
  const id = e.params.family.toString();
  if (e.params.rank == 0) {
    if (p.family == id) {
      leave(p);
      const f = Family.load(id)!;
      f.members = f.members - 1;
      f.save();
    }
  } else if (p.family != id) {
    join(p, id);
    const f = Family.load(id)!;
    f.members = f.members + 1;
    f.save();
  }
  p.save();
}

export function handleFamilyDissolved(e: FamilyDissolved): void {
  const f = Family.load(e.params.family.toString())!;
  f.alive = false;
  f.members = 0;
  f.centipoints = BigInt.zero();
  f.save();
}
