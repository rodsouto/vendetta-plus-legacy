#!/usr/bin/env python3
"""Extract game rulesets from legacy PHP classes into data/<game>.yaml.

Generates one ruleset per game type (vendetta, space4k). Values are read from the PHP entity classes
(library/Mob/{Habitacion,Entrenamiento,Tropa}/<Game>/), English text from
application/languages/<game>/en.php, and engine roles from library/Mob/Server.php mappings
(hardcoded below, see ROLES). Entity order follows library/Mob/Data.php, which is also the iteration
order of the combat engine.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from types import ModuleType

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import space4k_id_map  # noqa: E402
import vendetta_id_map  # noqa: E402

DATA_DIR = ROOT / "docs" / "spec" / "data"
DATA_PHP = ROOT / "library/Mob/Data.php"

# Typos in the legacy English language files, fixed for the spec.
NAME_FIXES = {
    "Chemical Trainig": "Chemical Training",
}

# Engine roles per game, from library/Mob/Server.php (legacy ids). The engine refers to entities only
# through these roles, so the same rules run on any ruleset.
ROLES = {
    "vendetta": {
        "build_speed_room": "oficina",           # getNameHabTiempo
        "research_speed_room": "escuela",        # getNameHabTiempoEnt
        "attack_training_room": "campo",         # getNameHabAtaque
        "defense_training_room": "seguridad",    # getNameHabDefensa
        "cargo_research": "contrabando",         # getNameHabCapCarga (a research)
        "honor_research": "honor",               # getNameEntPoderAtaque
        "occupation_troop": "ocupacion",         # getNameTrpOcupacion
        "spy_troop": "espia",                    # getNameTrpEspia
    },
    "space4k": {
        "build_speed_room": "centroOperaciones",
        "research_speed_room": "centroInvestigacion",
        "attack_training_room": "hangar",
        "defense_training_room": "estacionDefensa",
        "cargo_research": "capCargaMejorada",
        "honor_research": "diplomacia",
        "occupation_troop": "colonizador",
        "spy_troop": "sondaEspionaje",
    },
}
ROLE_KIND = {
    "build_speed_room": "building", "research_speed_room": "building", "attack_training_room": "building",
    "defense_training_room": "building", "cargo_research": "research", "honor_research": "research",
    "occupation_troop": "troop", "spy_troop": "troop",
}

# Legacy resource slots (Mob_Server::getNameHabRecurso): which room produces what.
PRODUCERS = {
    "vendetta": {"armeria": "weapons", "municion": "ammunition", "cerveceria": "alcohol",
                 "taberna": "dollar", "contrabando": "dollar"},
    "space4k": {"minaHierro": "iron", "refineriaLutino": "lutinum", "plataformaPerforacion": "water",
                "plQuimica": "hydrogen", "plQuimicaMejorada": "hydrogen"},
}

GAMES: dict[str, dict] = {
    "vendetta": {
        "dir": "Vendetta",
        "idmap": vendetta_id_map,
        "resources": ["weapons", "ammunition", "alcohol", "dollar"],
        "converted_from": "alcohol",
        # Mob_Tropa_Abstract::__construct multiplies _defensa by 10 only when the game is vendetta
        # and the combat system is Modificadores.
        "troop_defense_multiplier": 10,
    },
    "space4k": {
        "dir": "Space4k",
        "idmap": space4k_id_map,
        "resources": ["iron", "lutinum", "water", "hydrogen"],
        "converted_from": "water",
        "troop_defense_multiplier": 1,
    },
}


def clean_text(s: str) -> str:
    # PHP single-quoted strings keep backslashes literally; strip escape artifacts.
    s = re.sub(r"\\+(['\"])", r"\1", s)
    return re.sub(r"\s+", " ", s).strip()


def load_lang(game: str) -> dict[str, str]:
    text = (ROOT / f"application/languages/{game}/en.php").read_text(encoding="utf-8", errors="replace")
    pairs = re.findall(r"'([^']+)'\s*=>\s*'((?:\\.|[^'\\])*)'", text)
    return {k: clean_text(v) for k, v in pairs}


def data_php_list(method: str, var: str | None = None) -> list[str]:
    """Return the legacy IDs listed in a Mob_Data method (optionally a named $var inside it)."""
    text = DATA_PHP.read_text(encoding="utf-8")
    m = re.search(rf"function\s+{method}\s*\([^)]*\)\s*\{{(.*?)\n\s*\}}", text, re.DOTALL)
    if not m:
        raise SystemExit(f"Cannot find {method} in Data.php")
    body = m.group(1)
    if var:
        body = re.search(rf"\${var}\s*=\s*array\((.*?)\);", body, re.DOTALL).group(1)
    return re.findall(r'"([^"]+)"', body)


def php_scalar(raw: str):
    raw = raw.strip().strip('"').strip("'")
    if raw == "null":
        return None
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    try:
        f = float(raw)
        return int(f) if f.is_integer() else f
    except ValueError:
        return raw


def parse_php_array(content: str, prop: str):
    """Parse `protected $_<prop> = array(...)` into a dict (keyed) or list (plain).

    Handles both quote styles. Returns None if the property is absent.
    A plain list keeps duplicates so callers can detect legacy copy-paste bugs.
    """
    m = re.search(rf"protected\s+\$_{prop}\s*=\s*array\s*\((.*?)\)\s*;", content, re.DOTALL)
    if not m:
        return None
    raw = m.group(1)
    pairs = re.findall(r"""["']([^"']+)["']\s*=>\s*([^,]+)""", raw)
    if pairs:
        return {k: php_scalar(v) for k, v in pairs}
    return re.findall(r"""["']([^"']+)["']""", raw)


def parse_scalar(content: str, prop: str):
    m = re.search(rf"protected\s+\$_{prop}\s*=\s*([^;]+);", content)
    return php_scalar(m.group(1)) if m else None


def strip_comments(content: str) -> str:
    content = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
    return re.sub(r"(?m)^\s*//.*$", "", content)


class Extractor:
    def __init__(self, game: str):
        self.game = game
        self.cfg = GAMES[game]
        self.idmap: ModuleType = self.cfg["idmap"]
        self.lang = load_lang(game)

    def path(self, kind_dir: str, legacy_id: str, sub: str | None = None) -> Path:
        parts = [ROOT / "library/Mob" / kind_dir / self.cfg["dir"]] + ([sub] if sub else [])
        return Path(*parts) / f"{legacy_id[0].upper()}{legacy_id[1:]}.php"

    def costs(self, content: str) -> dict:
        out = {}
        for legacy, spec in self.idmap.RESOURCE_LEGACY_TO_SPEC.items():
            val = parse_scalar(content, legacy)
            if val:
                out[spec] = val
        return out

    def base(self, path: Path, legacy_id: str, kind: str, prefix: str) -> tuple[dict, str]:
        content = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
        spec_id = self.idmap.legacy_to_spec_id(legacy_id, kind)
        name = self.lang.get(f"{prefix}_{legacy_id}", spec_id)
        return {
            "id": spec_id,
            "legacy_id": legacy_id,
            "name": NAME_FIXES.get(name, name),
            "description": self.lang.get(f"{prefix}_{legacy_id}_desc", ""),
        }, content

    def production(self, content: str, legacy_id: str) -> dict | None:
        if "function getProduccion" not in content:
            return None
        resource = PRODUCERS[self.game][legacy_id]
        factor = int(re.search(r"round\((\d+)\s*\*\s*pow", content).group(1))
        if "getConsumoAlcohol" in content:
            per_unit, fixed = re.search(r"getProduccion\(\)\s*\*\s*(\d+)\)\s*\+\s*(\d+)", content).groups()
            consumes = self.cfg["converted_from"]
            return {
                "kind": "converter",
                "resource": resource,
                "consumes": consumes,
                "factor": factor,
                "consumption_per_unit": int(per_unit),
                "consumption_fixed": int(fixed),
                "formula": f"rate(L) = 0 if L == 0 else round({factor} * ((L+1)/2)^2); "
                           f"consumption(L) = 0 if L == 0 else rate(L) * {per_unit} + {fixed}",
            }
        base = int(re.search(r"return\s+\$base\s*\?\s*(\d+)", content).group(1))
        return {
            "kind": "producer",
            "resource": resource,
            "factor": factor,
            "base_rate": base,
            "formula": f"rate(L) = {base} if L == 0 else {base} + round({factor} * ((L+1)/2)^2)",
        }

    def storage(self, content: str, legacy_id: str) -> dict | None:
        if "function getAlmacenamiento" not in content:
            return None
        base, per_level = map(int, re.search(r"return\s+(\d+)\s*\+\s*(\d+)\s*\*\s*\$this->getNivel", content).groups())
        divisor = int(re.search(r"getAlmacenamiento\(\)\s*/\s*(\d+)", content).group(1))
        return {
            "resource": self.idmap.STORAGE_BUILDING_RESOURCE[legacy_id],
            "base": base,
            "per_level": per_level,
            "safe_divisor": divisor,
            "formula": f"capacity(L) = {base} + {per_level} * L; safe(L) = capacity(L) / {divisor}",
        }

    def building(self, legacy_id: str) -> dict:
        data, content = self.base(self.path("Habitacion", legacy_id), legacy_id, "building", "hab")
        data["cost"] = self.costs(content)
        data["base_duration_s"] = parse_scalar(content, "duracion")
        data["points_per_level"] = parse_scalar(content, "puntos")
        data["requirements"] = self.idmap.map_ids(parse_php_array(content, "requisitos") or {}, "building")
        if prod := self.production(content, legacy_id):
            data["production"] = prod
        if storage := self.storage(content, legacy_id):
            data["storage"] = storage
        return data

    def research(self, legacy_id: str) -> dict:
        data, content = self.base(self.path("Entrenamiento", legacy_id), legacy_id, "research", "ent")
        data["cost"] = self.costs(content)
        data["base_duration_s"] = parse_scalar(content, "duracion")
        data["points_per_level"] = parse_scalar(content, "puntos")
        data["requirements"] = self.idmap.map_ids(parse_php_array(content, "requisitos") or {}, "research")
        return data

    def troop(self, legacy_id: str, role: str, roles: dict) -> dict:
        sub = "Ataque" if role == "attack" else "Defensa"
        data, content = self.base(self.path("Tropa", legacy_id, sub), legacy_id, "troop", "trp")
        data["role"] = role
        data["trained_at"] = roles["attack_training_room" if role == "attack" else "defense_training_room"]
        data["cost"] = self.costs(content)
        data["training_duration_s"] = parse_scalar(content, "duracion")
        data["points_per_unit"] = parse_scalar(content, "puntos")
        data["base_attack"] = parse_scalar(content, "ataque")
        # Raw class value; the engine multiplies it by rules.troop_defense_multiplier.
        data["base_defense"] = parse_scalar(content, "defensa")
        data["base_capacity"] = parse_scalar(content, "capacidad")
        data["base_speed"] = parse_scalar(content, "velocidad")
        data["salary"] = parse_scalar(content, "salario")
        speed = parse_scalar(content, "bonificacionVelocidad")
        data["speed_research"] = self.idmap.legacy_to_spec_id(speed, "research") if speed else None
        data["requirements"] = self.idmap.map_ids(parse_php_array(content, "requisitos") or {}, "research")

        notes = []
        for prop, key in (("bonificacionesA", "attack_research_bonuses"), ("bonificacionesD", "defense_research_bonuses")):
            raw = parse_php_array(content, prop) or []
            raw = list(raw.values()) if isinstance(raw, dict) else raw
            mapped = self.idmap.map_ids(raw, "research")
            deduped = list(dict.fromkeys(mapped))
            if len(deduped) != len(mapped):
                dupes = sorted({x for x in mapped if mapped.count(x) > 1})
                notes.append(f"Legacy $_{prop} lists {', '.join(dupes)} more than once, so the PHP sums "
                             f"that level twice. Spec counts it once (decision D-05).")
                # Raw legacy list (with duplicates) so reference code can reproduce legacy stats.
                data[f"legacy_{key}"] = mapped
            data[key] = deduped
        data["combat_modifiers"] = self.idmap.map_ids(parse_php_array(content, "modificadores") or {}, "troop")
        if notes:
            data["legacy_notes"] = notes
        return data

    def run(self) -> dict:
        title = self.game.capitalize()
        roles = {r: self.idmap.legacy_to_spec_id(legacy, ROLE_KIND[r]) for r, legacy in ROLES[self.game].items()}
        buildings = [self.building(b) for b in data_php_list(f"getHabitaciones{title}")]
        research = [self.research(r) for r in data_php_list(f"getEntrenamientos{title}")]
        troops = ([self.troop(t, "attack", roles) for t in data_php_list(f"getTropas{title}", "ataque")]
                  + [self.troop(t, "defense", roles) for t in data_php_list(f"getTropas{title}", "defensa")])
        return {
            "ruleset": self.game,
            "resources": self.cfg["resources"],
            "rules": {"troop_defense_multiplier": self.cfg["troop_defense_multiplier"]},
            "roles": roles,
            "buildings": buildings,
            "research": research,
            "troops": troops,
        }


def main() -> None:
    for game in GAMES:
        doc = Extractor(game).run()
        out = DATA_DIR / f"{game}.yaml"
        header = (
            f"# {game} ruleset — GENERATED by scripts/extract_vendetta_spec.py. Do not edit by hand.\n"
            f"# Source: library/Mob/{{Habitacion,Entrenamiento,Tropa}}/{GAMES[game]['dir']}/*.php"
            f" + application/languages/{game}/en.php\n"
            "# Entity order = canonical order of library/Mob/Data.php (also the combat iteration order).\n"
            "# base_defense is the raw class value; effective defense uses rules.troop_defense_multiplier.\n\n"
        )
        out.write_text(header + yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
        print(f"Wrote {out.relative_to(ROOT)} ({len(doc['buildings'])} buildings, "
              f"{len(doc['research'])} research, {len(doc['troops'])} troops)")


if __name__ == "__main__":
    main()
