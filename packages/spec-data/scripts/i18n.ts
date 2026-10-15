// Entity names and descriptions in each UI language, taken from the legacy language files
// (application/languages/vendetta/<lang>.php: hab_<id>, ent_<id>, trp_<id> and their _desc) and
// keyed by spec id. Output: generated/i18n/<lang>.json.
import { readFileSync } from "node:fs";

interface Entity {
  id: string;
  legacy_id: string;
}

/** Parses `'key' => 'value',` lines of a PHP language array (single-quoted, \' escapes). */
export function parsePhpStrings(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /'((?:[^'\\]|\\.)*)'\s*=>\s*'((?:[^'\\]|\\.)*)'/g;
  for (const m of source.matchAll(re)) {
    out.set(m[1]!, m[2]!.replace(/\\'/g, "'").replace(/\\\\/g, "\\"));
  }
  return out;
}

export function entityStrings(
  file: string,
  ruleset: { buildings: Entity[]; research: Entity[]; troops: Entity[] },
) {
  const strings = parsePhpStrings(readFileSync(file, "utf8"));
  const pick = (prefix: string, list: Entity[]) =>
    Object.fromEntries(
      list.map((e) => [
        e.id,
        {
          name: strings.get(`${prefix}_${e.legacy_id}`) ?? e.id,
          description: strings.get(`${prefix}_${e.legacy_id}_desc`) ?? "",
        },
      ]),
    );
  return {
    rooms: pick("hab", ruleset.buildings),
    research: pick("ent", ruleset.research),
    troops: pick("trp", ruleset.troops),
  };
}
