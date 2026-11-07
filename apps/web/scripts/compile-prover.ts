import { compileProducerVerifiers } from "./prover/compile.js";
const [keys, output] = process.argv.slice(2);
if (!keys || !output)
  throw new Error("usage: compile-prover.ts keys-directory fresh-output-directory");
await compileProducerVerifiers(
  keys,
  process.env.FORGE_BIN || "forge",
  process.env.SOLC_BIN,
  output,
);
console.log("Verifier output:", output);
