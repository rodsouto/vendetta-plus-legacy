// Loot apportionment (D-06), exact. Mirrors contracts/src/combat/Loot.sol.
//
// Splits `capacity` across the unprotected stock in proportion to what remains, largest remainder
// first (ties by `order`), never exceeding capacity or stock; capacity freed by resources that run
// out is redistributed until capacity or stock is exhausted.
export function apportionLoot(capacity: bigint, unprotected: readonly bigint[]): bigint[] {
  const n = unprotected.length;
  const loot = Array<bigint>(n).fill(0n);
  const rem = [...unprotected];
  let cap = capacity;
  while (cap > 0n) {
    const total = rem.reduce((s, x) => s + x, 0n);
    if (total === 0n) break;
    if (cap >= total) {
      rem.forEach((x, i) => (loot[i]! += x));
      break;
    }
    const share = rem.map((x) => (cap * x) / total);
    const frac = rem.map((x) => (cap * x) % total);
    let left = cap - share.reduce((s, x) => s + x, 0n);
    const ranked = rem
      .map((x, i) => i)
      .filter((i) => rem[i]! > 0n)
      .sort((a, b) => (frac[b]! > frac[a]! ? 1 : frac[b]! < frac[a]! ? -1 : a - b));
    for (let k = 0; left > 0n; k++, left--) share[ranked[k % ranked.length]!]! += 1n;
    let freed = 0n;
    for (let i = 0; i < n; i++) {
      const take = share[i]! < rem[i]! ? share[i]! : rem[i]!;
      freed += share[i]! - take;
      loot[i]! += take;
      rem[i]! -= take;
    }
    if (freed === cap) break;
    cap = freed;
  }
  return loot;
}
