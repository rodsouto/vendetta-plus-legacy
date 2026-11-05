// Compare public native Go boundary fixtures with the decoder used by tlock-js.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bls12_381 as direct } from "@noble/curves/bls12-381";
const require = createRequire(import.meta.url),
  sdkRequire = createRequire(require.resolve("tlock-js"));
const { bls12_381: sdk } = sdkRequire(
  "@noble/curves/bls12-381",
) as typeof import("@noble/curves/bls12-381");
function usable(curve: typeof direct, raw: Uint8Array): boolean {
  if (raw.length !== 96 || (raw[0]! & 0xc0) !== 0x80) return false;
  try {
    const p = curve.G2.ProjectivePoint.fromHex(raw);
    p.assertValidity();
    if (p.equals(curve.G2.ProjectivePoint.ZERO)) return false;
    return Buffer.from(p.toRawBytes(true)).equals(Buffer.from(raw));
  } catch {
    return false;
  }
}
const file = new URL(
  "../../../../docs/benchmarks/timelock-opening/invalid-point/vectors.json",
  import.meta.url,
);
const source = JSON.parse(readFileSync(file, "utf8")) as {
  vectors: { name: string; encoded: string; valid: boolean }[];
};
const cases = source.vectors.map((v) => {
  const raw = Buffer.from(v.encoded, "hex"),
    directValid = usable(direct, raw),
    sdkValid = usable(sdk, raw);
  if (directValid !== v.valid || sdkValid !== v.valid)
    throw new Error(`Point decoder mismatch: ${v.name}`);
  return {
    name: v.name,
    nativeGoValid: v.valid,
    directNobleValid: directValid,
    tlockNobleValid: sdkValid,
  };
});
const sdkVersion = JSON.parse(
  readFileSync(
    join(dirname(sdkRequire.resolve("@noble/curves/bls12-381")), "package.json"),
    "utf8",
  ),
).version as string;
writeFileSync(
  new URL("interop-results.json", file),
  JSON.stringify(
    {
      scope:
        "Compressed G2 boundary decoder comparison; not tlock decryption, proof or Game integration",
      casesPassed: cases.length,
      tlockCurveVersion: sdkVersion,
      cases,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${cases.length} native Go point cases agree with both noble decoders (tlock dependency ${sdkVersion})`,
);
