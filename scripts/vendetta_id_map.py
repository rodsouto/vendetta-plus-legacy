"""Legacy Spanish PHP/DB IDs → English snake_case spec IDs."""

from __future__ import annotations

# Resources: spec id → legacy DB column
RESOURCE_SPEC_TO_LEGACY: dict[str, str] = {
    "weapons": "arm",
    "ammunition": "mun",
    "dollar": "dol",
    "alcohol": "alc",
}

RESOURCE_LEGACY_TO_SPEC: dict[str, str] = {v: k for k, v in RESOURCE_SPEC_TO_LEGACY.items()}

BUILDING_LEGACY_TO_SPEC: dict[str, str] = {
    "oficina": "boss_office",
    "escuela": "mob_school",
    "armeria": "weapons_armoury",
    "municion": "ammunition_depot",
    "cerveceria": "brewery",
    "taberna": "bar",
    "contrabando": "smuggle",
    "almacenArm": "weapon_storage",
    "deposito": "ammunition_storage",
    "almacenAlc": "alcohol_storage",
    "caja": "safe_room",
    "campo": "boot_camp",
    "seguridad": "security",
    "torreta": "spring_gun",
    "minas": "hidden_mines",
}

RESEARCH_LEGACY_TO_SPEC: dict[str, str] = {
    "rutas": "routing",
    "encargos": "strategies",
    "extorsion": "extortion",
    "administracion": "base_administration",
    "contrabando": "smuggling",
    "espionaje": "espionage",
    "seguridad": "security_patrol",
    "proteccion": "gang_protection",
    "combate": "close_combat",
    "armas": "short_range_weapons",
    "tiro": "firearms_training",
    "explosivos": "explosives_training",
    "guerrilla": "guerilla_training",
    "psicologico": "psychological_training",
    "quimico": "chemical_training",
    "honor": "honor",
}

TROOP_LEGACY_TO_SPEC: dict[str, str] = {
    "maton": "rowdy",
    "portero": "bouncer",
    "acuchillador": "knifer",
    "pistolero": "gunman",
    "ocupacion": "occupation_troop",
    "espia": "spy",
    "porteador": "mover",
    "cia": "cia_agent",
    "fbi": "fbi_agent",
    "transportista": "carrier",
    "tactico": "tactical_expert",
    "francotirador": "sniper",
    "asesino": "assassin",
    "ninja": "ninja",
    "demoliciones": "demolition_expert",
    "mercenario": "mercenary",
    "ilegal": "clandestine_workers",
    "centinela": "safeguard",
    "policia": "policeman",
    "guardaespaldas": "bodyguard",
    "guardia": "guards",
}

# Legacy storage building -> resource it stores/protects (Mob_Server::getDeposito)
STORAGE_BUILDING_RESOURCE: dict[str, str] = {
    "almacenArm": "weapons",
    "deposito": "ammunition",
    "caja": "dollar",
    "almacenAlc": "alcohol",
}

# NOTE: "contrabando" and "seguridad" are both a building and a research in legacy PHP,
# so IDs must always be resolved with an explicit kind.
_MAPS_BY_KIND: dict[str, dict[str, str]] = {
    "building": BUILDING_LEGACY_TO_SPEC,
    "research": RESEARCH_LEGACY_TO_SPEC,
    "troop": TROOP_LEGACY_TO_SPEC,
}


def lcfirst(key: str) -> str:
    return key[0].lower() + key[1:] if key else key


def legacy_to_spec_id(legacy: str, kind: str) -> str:
    """Resolve a legacy id (any casing) of the given kind to its English spec id."""
    mapping = _MAPS_BY_KIND[kind]
    key = lcfirst(legacy)
    if key not in mapping:
        raise KeyError(f"Unknown legacy {kind} id: {legacy!r}")
    return mapping[key]


def map_ids(value, kind: str):
    """Map dict keys or list items from legacy ids to spec ids of the given kind."""
    if isinstance(value, dict):
        return {legacy_to_spec_id(k, kind): v for k, v in value.items()}
    return [legacy_to_spec_id(x, kind) for x in value]


def spec_id_for_file(stem: str, entity_kind: str) -> tuple[str, str]:
    """Return (english_spec_id, legacy_php_id)."""
    legacy = stem[0].lower() + stem[1:]
    if entity_kind == "building":
        spec = BUILDING_LEGACY_TO_SPEC[legacy]
    elif entity_kind == "research":
        spec = RESEARCH_LEGACY_TO_SPEC[legacy]
    else:
        spec = TROOP_LEGACY_TO_SPEC[legacy]
    return spec, legacy
