// Exact integer arithmetic on bigint (blockchain.md B-03). Every non-integer formula of the spec is
// expressed as a comparison between integers, so results never depend on floating point.

export interface Fraction {
  num: bigint;
  den: bigint;
}

/** floor(√n). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let x = above(n, 2);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}

/** round(√n), half up: s = isqrt(n), plus one when n ≥ s² + s + 1 (i.e. √n ≥ s + ½). */
export function roundSqrt(n: bigint): bigint {
  const s = isqrt(n);
  return n >= s * s + s + 1n ? s + 1n : s;
}

/** floor(n^(1/k)) for n ≥ 0, k ≥ 1. */
export function iroot(n: bigint, k: number): bigint {
  if (n < 0n) throw new RangeError("iroot of a negative number");
  if (k < 1) throw new RangeError("root degree must be ≥ 1");
  if (k === 1 || n < 2n) return n;
  const K = BigInt(k);
  // Newton from an estimate above the root, then exact correction.
  let x = above(n, k);
  for (;;) {
    const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (y >= x) break;
    x = y;
  }
  while (x ** K > n) x--;
  while ((x + 1n) ** K <= n) x++;
  return x;
}

/**
 * floor(scale × (a / b)^(p / q)) for a ≥ 0, b > 0, scale ≥ 0: the largest k with
 * k^q · b^p ≤ scale^q · a^p. Exact for any rational exponent.
 */
export function floorPow(a: bigint, b: bigint, p: number, q: number, scale = 1n): bigint {
  if (b <= 0n) throw new RangeError("denominator must be positive");
  const P = BigInt(p);
  const Q = BigInt(q);
  const lhs = b ** P;
  const rhs = scale ** Q * a ** P;
  // iroot of the floored quotient is at most one below the answer; the loops make it exact.
  let k = iroot(rhs / lhs, q);
  while (k > 0n && k ** Q * lhs > rhs) k--;
  while ((k + 1n) ** Q * lhs <= rhs) k++;
  return k;
}

/** A starting point ≥ n^(1/k) for Newton's method (2^ceil(bits / k)). */
function above(n: bigint, k: number): bigint {
  return 1n << BigInt(Math.ceil(n.toString(2).length / k));
}

/** round(num / den), half up, for num ≥ 0 and den > 0. */
export function roundHalfUp(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den);
}

/** Exact fraction of a decimal number as written (3.3479 → 33479/10000, 0.2 → 1/5). */
export function decimalToFraction(x: number): Fraction {
  const text = String(x);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new RangeError(`not a plain decimal: ${text}`);
  const [int, frac = ""] = text.split(".");
  let num = BigInt(int! + frac);
  let den = 10n ** BigInt(frac.length);
  const g = gcd(num, den);
  num /= g;
  den /= g;
  return { num, den };
}

export function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
