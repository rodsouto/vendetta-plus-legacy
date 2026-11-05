import { decodeAbiParameters, hexToBytes, type Hex } from "viem";
import type { sim } from "@vendetta/rules";

// Game.getHiddenEvidence returns abi.encode(HiddenEvidenceState).
export const hiddenEvidenceParameters = [
  {
    type: "tuple",
    components: [
      {
        name: "receipt",
        type: "tuple",
        components: [
          { name: "statement", type: "bytes32" },
          { name: "arrival", type: "uint40" },
          { name: "seq", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "consumed", type: "bool" },
          { name: "plain", type: "bytes" },
        ],
      },
      { name: "openingConsumer", type: "address" },
      { name: "invalidPointConsumer", type: "address" },
      { name: "cancelled", type: "bool" },
    ],
  },
] as const;
export function decodeHiddenEvidence(encoded: Hex): sim.hiddenEvidence.HiddenEvidence | undefined {
  const [e] = decodeAbiParameters(hiddenEvidenceParameters, encoded);
  if (e.receipt.status === 0) return undefined;
  return {
    receipt: {
      ...e.receipt,
      arrival: BigInt(e.receipt.arrival),
      plain: hexToBytes(e.receipt.plain),
    },
    openingConsumer: e.openingConsumer.toLowerCase(),
    invalidPointConsumer: e.invalidPointConsumer.toLowerCase(),
    cancelled: e.cancelled,
  };
}
