import { compileProducerVerifiers } from "./prover/compile.js";
const [keys] = process.argv.slice(2);
if (!keys) throw new Error("usage: compile-prover.ts keys-directory");
await compileProducerVerifiers(keys, process.env.FORGE_BIN || "forge", process.env.SOLC_BIN);
