// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Loss ratios of one fight (05-formulas.md#combat-loss-ratios) in exact integer arithmetic.
///
/// Legacy computes, with A = PAA + PDA and D = PAD + PDD:
///   PPA = D / (D + 2A), PPD = A / (A + 2D), then scales the weaker side's ratio:
///   if A > D: PPA *= 1 - (100A/D - 100) / 2000, else PPD *= 1 - (100D/A - 100) / 2000.
/// Both simplify to one fraction: PPA = (21D - A) / (20(D + 2A)) when A > D, and
/// PPD = (21A - D) / (20(A + 2D)) otherwise. Ratios only depend on A / D, so the powers may carry
/// any common scale. Results are in thousandths, rounded half up (3 decimals, D-15).
library LossRatio {
    uint256 internal constant ONE = 1000;
    uint256 internal constant WIPE_RATIO = 10;

    function compute(uint256 a, uint256 d) internal pure returns (uint256 ppa, uint256 ppd) {
        if (d > a * WIPE_RATIO) return (ONE, 0);
        if (a > d * WIPE_RATIO) return (0, ONE);
        if (a == 0 && d == 0) return (0, 0); // D-25
        if (a > d) {
            ppa = _thousandths(21 * d - a, 20 * (d + 2 * a));
            ppd = _thousandths(a, a + 2 * d);
        } else {
            ppa = _thousandths(d, d + 2 * a);
            ppd = _thousandths(21 * a - d, 20 * (a + 2 * d));
        }
    }

    /// round(num / den, 3 decimals) × 1000, half up.
    function _thousandths(uint256 num, uint256 den) private pure returns (uint256) {
        return (2 * ONE * num + den) / (2 * den);
    }
}
