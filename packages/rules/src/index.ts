// Vendetta rules engine: pure, deterministic, exact integer math on bigint (blockchain.md B-03,
// B-20). Shared by the client (optimistic UI) and used as the reference for the contracts.
export * from "./math.js";
export * from "./ruleset.js";
export * from "./stats.js";
export * from "./combat.js";
export * from "./loot.js";
export * from "./honor.js";
export * from "./costs.js";
export * from "./economy.js";
export * from "./map.js";
export * from "./points.js";
export { rulesets, gameConfig } from "@vendetta/spec-data";
export * as sim from "./sim/index.js";
