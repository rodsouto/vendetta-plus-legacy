// Battle resolution under the target rules (06-combat.md; D-04, D-15, D-16, D-25), exact (B-03).
// Mirrors contracts/src/combat/Combat.sol and LossRatio.sol; both are checked against the same vectors.
import type { Ruleset } from "./ruleset.js";

export const LOSS_ONE = 1000n;
const NO_MODIFIER = 10;

/**
 * Loss ratios of one fight in thousandths, from the two sides' total power A and D (any common
 * scale). The legacy formula simplifies to one fraction per side: when A > D,
 * PPA = (21D − A) / (20(D + 2A)) and PPD = A / (A + 2D); otherwise PPA = D / (D + 2A) and
 * PPD = (21A − D) / (20(A + 2D)). Rounded half up to 3 decimals (D-15).
 */
export function lossRatios(a: bigint, d: bigint, wipeRatio = 10n): [bigint, bigint] {
  if (d > a * wipeRatio) return [LOSS_ONE, 0n];
  if (a > d * wipeRatio) return [0n, LOSS_ONE];
  if (a === 0n && d === 0n) return [0n, 0n]; // D-25
  const th = (num: bigint, den: bigint) => (2n * LOSS_ONE * num + den) / (2n * den);
  return a > d
    ? [th(21n * d - a, 20n * (d + 2n * a)), th(a, a + 2n * d)]
    : [th(d, d + 2n * a), th(21n * a - d, 20n * (a + 2n * d))];
}

export interface Side {
  count: bigint[];
  attack: bigint[];
  defense: bigint[];
  /** Honor power percentage. */
  pct: bigint;
}

export interface BattleResult {
  rounds: number;
  attackerRemaining: bigint[];
  defenderRemaining: bigint[];
  /** Per reported round, deaths per troop type. */
  attackerDeaths: bigint[][];
  defenderDeaths: bigint[][];
}

/** D-04: highest modifier > 1, then most units, then canonical order; null if no enemy left. */
function target(rs: Ruleset, actor: number, enemy: bigint[]): number | null {
  let best: number | null = null;
  let bestMod = 0;
  let bestCount = 0n;
  enemy.forEach((count, t) => {
    if (count === 0n) return;
    let m = rs.modifiers[actor]![t]!;
    if (m <= NO_MODIFIER) m = 0;
    if (best === null || m > bestMod || (m === bestMod && count > bestCount)) {
      [best, bestMod, bestCount] = [t, m, count];
    }
  });
  return best;
}

export function resolveBattle(rs: Ruleset, attacker: Side, defender: Side): BattleResult {
  const n = rs.troops.length;
  const ac = [...attacker.count];
  const dc = [...defender.count];
  const attackerDeaths: bigint[][] = [];
  const defenderDeaths: bigint[][] = [];

  const fight = (round: number, x: number, y: number) => {
    const pa =
      ac[x]! *
      (attacker.attack[x]! + attacker.defense[x]!) *
      BigInt(rs.modifiers[x]![y]!) *
      attacker.pct;
    const pd =
      dc[y]! *
      (defender.attack[y]! + defender.defense[y]!) *
      BigInt(rs.modifiers[y]![x]!) *
      defender.pct;
    const [ppa, ppd] = lossRatios(pa, pd, rs.config.wipeRatio);
    const da = (ac[x]! * ppa + LOSS_ONE / 2n) / LOSS_ONE;
    const dd = (dc[y]! * ppd + LOSS_ONE / 2n) / LOSS_ONE;
    ac[x]! -= da;
    dc[y]! -= dd;
    attackerDeaths[round]![x]! += da;
    defenderDeaths[round]![y]! += dd;
  };

  let attackerAlive = true;
  let defenderAlive = true;
  let lastRoundFights = 0;
  let round = 0;
  while (round < rs.config.maxRounds && attackerAlive && defenderAlive) {
    attackerAlive = defenderAlive = false;
    lastRoundFights = 0;
    attackerDeaths.push(Array(n).fill(0n));
    defenderDeaths.push(Array(n).fill(0n));
    // Attacker phase, then defender phase; pairs may fight twice (D-16).
    for (let x = 0; x < n; x++) {
      if (ac[x] === 0n) continue;
      const y = target(rs, x, dc);
      if (y === null) break;
      fight(round, x, y);
      lastRoundFights++;
      attackerAlive ||= ac[x]! > 0n;
      defenderAlive ||= dc[y]! > 0n;
    }
    for (let y = 0; y < n; y++) {
      if (dc[y] === 0n) continue;
      const x = target(rs, y, ac);
      if (x === null) break;
      fight(round, x, y);
      lastRoundFights++;
      attackerAlive ||= ac[x]! > 0n;
      defenderAlive ||= dc[y]! > 0n;
    }
    round++;
  }
  // A trailing round with no fights is not reported (unless it is the only one).
  if (round > 1 && lastRoundFights === 0) {
    round--;
    attackerDeaths.pop();
    defenderDeaths.pop();
  }
  return {
    rounds: round,
    attackerRemaining: ac,
    defenderRemaining: dc,
    attackerDeaths,
    defenderDeaths,
  };
}
