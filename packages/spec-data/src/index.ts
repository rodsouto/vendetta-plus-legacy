// Spec data as JSON, generated from docs/spec/data/*.yaml (see scripts/build.ts).
// Types are deliberately shallow: the rules engine defines the precise shapes it consumes.
// Test vectors live in ./vectors.ts so they never end up in the client bundle.
import vendetta from "../generated/vendetta.json" with { type: "json" };
import space4k from "../generated/space4k.json" with { type: "json" };
import gameConfig from "../generated/game_config.json" with { type: "json" };

export interface Ruleset {
  ruleset: string;
  resources: unknown[];
  rules: Record<string, unknown>;
  roles: Record<string, unknown>;
  buildings: unknown[];
  research: unknown[];
  troops: unknown[];
}

export const rulesets: Record<"vendetta" | "space4k", Ruleset> = { vendetta, space4k };
export { gameConfig };
