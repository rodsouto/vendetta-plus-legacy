// Families and wars (09-social.md, D-20, B-31). On-chain: membership, the three fixed ranks and war
// bookkeeping; the family board and circulars are off-chain messaging (B-10). A dissolved family is
// dead: memberships, applications and wars that point to it lapse lazily (no member limit, so they
// are never iterated). Mirrors contracts/src/core/Families.sol.
import { active, atomic } from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import {
  CAPO,
  MEMBER,
  OFFER_DRAW,
  OFFER_NONE,
  OFFER_SURRENDER,
  SUBCAPO,
  type Player,
  type War,
  type World,
} from "./state.js";

/** The player's family, or 0 if none or dissolved. */
export function familyOf(w: World, p: Player): bigint {
  return p.family !== 0n && w.families.get(p.family)?.alive ? p.family : 0n;
}

const leads = (w: World, p: Player) =>
  familyOf(w, p) !== 0n && (p.rank === CAPO || p.rank === SUBCAPO);
const pairKey = (a: bigint, b: bigint) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** The running war between two families, or 0. A war with a dissolved family is over. */
export function warBetween(w: World, a: bigint, b: bigint): bigint {
  const id = w.activeWar.get(pairKey(a, b));
  if (id === undefined) return 0n;
  const war = w.wars.get(id)!;
  return !war.ended && w.families.get(a)!.alive && w.families.get(b)!.alive ? id : 0n;
}

/** Battle hook: lost troop points go to each side's losses if their families are at war. */
export function warScore(
  w: World,
  attacker: Player,
  defender: Player,
  lostA: bigint,
  lostD: bigint,
): void {
  const fa = familyOf(w, attacker);
  const fd = familyOf(w, defender);
  if (fa === 0n || fd === 0n || fa === fd) return;
  const id = warBetween(w, fa, fd);
  if (id === 0n) return;
  const war = w.wars.get(id)!;
  if (war.a === fa) [war.lostA, war.lostB] = [war.lostA + lostA, war.lostB + lostD];
  else [war.lostA, war.lostB] = [war.lostA + lostD, war.lostB + lostA];
}

/** Printable ASCII within [min, max]; uniqueness ignores ASCII case (B-31). */
function validName(text: string, [min, max]: [number, number]): boolean {
  return text.length >= min && text.length <= max && [...text].every((c) => c >= " " && c <= "~");
}

const nameKey = (kind: "tag" | "name", text: string) => `${kind}:${text.toLowerCase()}`;

function member(w: World, id: bigint, family: bigint): Player {
  const p = w.players.get(id);
  if (!p || familyOf(w, p) !== family) fail("NotAllowed");
  return p;
}

export const createFamily = atomic(function createFamily(
  w: World,
  controller: string,
  tag: string,
  name: string,
  now: bigint,
): bigint {
  drain(w, now);
  const p = active(w, controller, now);
  if (familyOf(w, p) !== 0n) fail("InFamily");
  if (!validName(tag, w.rs.config.tagLength) || !validName(name, w.rs.config.nameLength))
    fail("InvalidName");
  if (w.familyNames.has(nameKey("tag", tag)) || w.familyNames.has(nameKey("name", name)))
    fail("NameTaken");
  const id = w.nextFamily++;
  w.families.set(id, { id, alive: true, tag, name, members: 1n });
  w.familyNames.set(nameKey("tag", tag), id);
  w.familyNames.set(nameKey("name", name), id);
  [p.family, p.rank, p.applications] = [id, CAPO, []];
  return id;
});

export const applyToFamily = atomic(function applyToFamily(
  w: World,
  controller: string,
  family: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (familyOf(w, p) !== 0n) fail("InFamily");
  if (!w.families.get(family)?.alive) fail("UnknownFamily");
  p.applications = p.applications.filter((f) => w.families.get(f)!.alive);
  if (p.applications.includes(family)) fail("AlreadyApplied");
  if (p.applications.length >= w.rs.config.maxApplications) fail("TooManyApplications");
  p.applications.push(family);
});

export const withdrawApplication = atomic(function withdrawApplication(
  w: World,
  controller: string,
  family: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (!p.applications.includes(family)) fail("NoApplication");
  p.applications = p.applications.filter((f) => f !== family);
});

export const acceptApplication = atomic(function acceptApplication(
  w: World,
  controller: string,
  applicant: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (!leads(w, p)) fail("NotAllowed");
  const f = familyOf(w, p);
  const a = w.players.get(applicant);
  if (!a || !a.applications.includes(f)) fail("NoApplication");
  if (familyOf(w, a) !== 0n) fail("InFamily");
  [a.family, a.rank, a.applications] = [f, MEMBER, []];
  w.families.get(f)!.members += 1n;
});

export const rejectApplication = atomic(function rejectApplication(
  w: World,
  controller: string,
  applicant: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (!leads(w, p)) fail("NotAllowed");
  const f = familyOf(w, p);
  const a = w.players.get(applicant);
  if (!a || !a.applications.includes(f)) fail("NoApplication");
  a.applications = a.applications.filter((x) => x !== f);
});

export const leaveFamily = atomic(function leaveFamily(
  w: World,
  controller: string,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const f = familyOf(w, p);
  if (f === 0n || p.rank === CAPO) fail("NotAllowed");
  [p.family, p.rank] = [0n, 0];
  w.families.get(f)!.members -= 1n;
});

export const kickMember = atomic(function kickMember(
  w: World,
  controller: string,
  target: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (!leads(w, p)) fail("NotAllowed");
  const f = familyOf(w, p);
  const t = member(w, target, f);
  if (t.rank === CAPO) fail("NotAllowed"); // the Capo cannot be kicked (D-20)
  [t.family, t.rank] = [0n, 0];
  w.families.get(f)!.members -= 1n;
});

export const setRank = atomic(function setRank(
  w: World,
  controller: string,
  target: bigint,
  rank: number,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (!leads(w, p) || (rank !== SUBCAPO && rank !== MEMBER)) fail("NotAllowed");
  const t = member(w, target, familyOf(w, p));
  if (t.rank === CAPO) fail("NotAllowed");
  t.rank = rank;
});

export const handOver = atomic(function handOver(
  w: World,
  controller: string,
  target: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (familyOf(w, p) === 0n || p.rank !== CAPO) fail("NotAllowed");
  const t = member(w, target, p.family);
  if (t.id === p.id) fail("NotAllowed");
  [t.rank, p.rank] = [CAPO, SUBCAPO];
});

/** The Capo dissolves the family; its running wars count as lost (read lazily, see warBetween). */
export const dissolveFamily = atomic(function dissolveFamily(
  w: World,
  controller: string,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const f = familyOf(w, p);
  if (f === 0n || p.rank !== CAPO) fail("NotAllowed");
  const fam = w.families.get(f)!;
  fam.alive = false;
  w.familyNames.delete(nameKey("tag", fam.tag));
  w.familyNames.delete(nameKey("name", fam.name));
  [p.family, p.rank] = [0n, 0];
});

export const declareWar = atomic(function declareWar(
  w: World,
  controller: string,
  other: bigint,
  now: bigint,
): bigint {
  drain(w, now);
  const p = active(w, controller, now);
  if (!leads(w, p)) fail("NotAllowed");
  const f = familyOf(w, p);
  if (other === f || !w.families.get(other)?.alive) fail("UnknownFamily");
  if (warBetween(w, f, other) !== 0n) fail("AlreadyAtWar");
  const war: War = {
    id: w.nextWar++,
    a: f,
    b: other,
    lostA: 0n,
    lostB: 0n,
    ended: false,
    winner: 0n,
    offer: OFFER_NONE,
    offerBy: 0n,
  };
  w.wars.set(war.id, war);
  w.activeWar.set(pairKey(f, other), war.id);
  return war.id;
});

/** The side of `p` in a running war, or a failure. */
function side(w: World, p: Player, warId: bigint): [War, bigint] {
  const war = w.wars.get(warId);
  const f = familyOf(w, p);
  if (!war || f === 0n || (war.a !== f && war.b !== f) || warBetween(w, war.a, war.b) !== warId)
    fail("NotAllowed");
  return [war, f];
}

/** The Capo offers to surrender (the other family wins) or a draw. */
export const offerPeace = atomic(function offerPeace(
  w: World,
  controller: string,
  warId: bigint,
  kind: number,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const [war, f] = side(w, p, warId);
  if (p.rank !== CAPO || (kind !== OFFER_SURRENDER && kind !== OFFER_DRAW)) fail("NotAllowed");
  [war.offer, war.offerBy] = [kind, f];
});

/** The other family's Capo or SubCapo accepts the pending offer, which ends the war. */
export const answerPeace = atomic(function answerPeace(
  w: World,
  controller: string,
  warId: bigint,
  accept: boolean,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const [war, f] = side(w, p, warId);
  if (!leads(w, p)) fail("NotAllowed");
  if (war.offer === OFFER_NONE || war.offerBy === f) fail("NoOffer");
  if (accept) {
    war.ended = true;
    war.winner = war.offer === OFFER_SURRENDER ? f : 0n;
    w.activeWar.delete(pairKey(war.a, war.b));
  }
  [war.offer, war.offerBy] = [OFFER_NONE, 0n];
});
