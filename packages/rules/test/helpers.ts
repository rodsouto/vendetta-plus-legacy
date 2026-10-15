import { vectors } from "@vendetta/spec-data/vectors";
import { vendetta as rs } from "../src/index.js";

export { rs };

export type Any = any;

export const legacy = (section: string): Any[] => vectors.vendetta[section]!.cases as Any[];
export const target = (section: string): Any[] => vectors.target[section]!.cases as Any[];

export const troop = (id: string) => rs.troops.find((t) => t.id === id)!;
export const building = (id: string) => rs.buildings.find((b) => b.id === id)!;
export const research = (id: string) => rs.research.find((r) => r.id === id)!;
export const allResearch = (level: number) => rs.research.map(() => BigInt(level));
export const levelsOf = (byId: Record<string, number>) =>
  rs.buildings.map((b) => BigInt(byId[b.id] ?? 0));
export const costsOf = (c: Record<string, bigint>) =>
  Object.fromEntries(
    Object.entries(c)
      .filter(([r]) => r !== "alcohol")
      .map(([r, v]) => [r, Number(v)]),
  );
