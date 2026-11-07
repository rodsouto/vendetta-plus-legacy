import { parseAbi } from "viem";
export const openingAbi = parseAbi([
  "error InvalidExhaustionClaim()",
  "error MismatchedScalar()",
  "error UnfinishedPrefix()",
  "error InvalidProof()",
  "error WrongStatement()",
  "error NonCanonicalWord()",
  "function begin(bytes32) returns (bytes32)",
  "function verifier() view returns (address)",
  "function prefix() view returns (address)",
  "function check(bytes32,bytes,uint256[55]) view returns (bool,bytes)",
]);
export const pointAbi = parseAbi([
  "error InvalidProof()",
  "error WrongStatement()",
  "error NonCanonicalWord()",
  "function verifier() view returns(address)",
  "function check(bytes32,bytes,uint256[2]) view returns (bool)",
]);
export const prefixAbi = parseAbi([
  "function contextInitialized(bytes32) view returns (bool)",
  "function receiptForContext(bytes32) view returns (bytes32)",
  "function states(bytes32) view returns (bytes32,uint256,uint32,uint32,uint8)",
  "function advance(bytes32,uint16)",
]);
