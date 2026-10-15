"""Legacy Space4k PHP/DB IDs → English snake_case spec IDs."""

from __future__ import annotations

# Resources: spec id → legacy DB column (same columns as Vendetta)
RESOURCE_SPEC_TO_LEGACY: dict[str, str] = {
    "iron": "arm",
    "lutinum": "mun",
    "hydrogen": "dol",
    "water": "alc",
}

RESOURCE_LEGACY_TO_SPEC: dict[str, str] = {v: k for k, v in RESOURCE_SPEC_TO_LEGACY.items()}

# Vendetta spec id → Space4k spec id (parallel themed IDs)
VENDETTA_TO_SPACE4K_RESOURCE: dict[str, str] = {
    "weapons": "iron",
    "ammunition": "lutinum",
    "dollar": "hydrogen",
    "alcohol": "water",
}

BUILDING_LEGACY_TO_SPEC: dict[str, str] = {
    "centroOperaciones": "headquarter",
    "centroInvestigacion": "research_lab",
    "minaHierro": "iron_mine",
    "refineriaLutino": "lutinum_refinery",
    "plataformaPerforacion": "drilling_rig",
    "plQuimica": "chemical_plant",
    "plQuimicaMejorada": "enhanced_chemical_plant",
    "almacenHierro": "iron_storage",
    "depositoLutino": "lutinum_storage",
    "tanqueAgua": "water_tank",
    "tanqueHidrogeno": "hydrogen_tank",
    "hangar": "shipyard",
    "estacionDefensa": "orbital_defense_station",
    "escudoPlanetario": "planetary_shield",
    "centralEnergetica": "fusion_powerplant",
}

RESEARCH_LEGACY_TO_SPEC: dict[str, str] = {
    "motorCombustion": "combustion_engine",
    "motorIonico": "ion_engine",
    "propulsionEspacio": "space_curvature_propulsion",
    "tecColonizacion": "colonization_tech",
    "capCargaMejorada": "enhanced_cargo_capacity",
    "tecEspionaje": "espionage_technology",
    "propMultidimensional": "space_folding_propulsion",
    "tecDeteccion": "sensor_technology",
    "tecCamuflaje": "camouflage_technology",
    "blindajeMejorado": "enhanced_plating",
    "tecDefensa": "shield_technology",
    "focalizacionEnerg": "energy_focalization",
    "ionizacion": "ionization",
    "proyExplosivos": "explosive_projectiles",
    "proyPlasma": "plasma_projectiles",
    "diplomacia": "diplomacy",
}

TROOP_LEGACY_TO_SPEC: dict[str, str] = {
    "chacal": "shakal",
    "renegado": "renegade",
    "darwin": "darwin",
    "saqueador": "raider",
    "colonizador": "colony_ship",
    "sondaEspionaje": "espionage_probe",
    "tjuger": "tjuger",
    "cougar": "cougar",
    "comerciante": "trader",
    "transportador": "transporter",
    "bombarderoCamuflaje": "camouflage_bomber",
    "aguilaGrandeV": "longeagle_v",
    "noe": "noah",
    "aguilaGrandeX": "longeagle_x",
    "spit": "spit",
    "sentih": "sentih",
    "torreLaserPequena": "light_laser_tower",
    "torreLaser": "laser_tower",
    "lanzadorPulsos": "emp_launcher",
    "torrePlasma": "plasma_tower",
    "lanzamisiles": "rocket_launcher",
}

# Vendetta entity spec id → Space4k entity spec id
VENDETTA_TO_SPACE4K_BUILDING: dict[str, str] = {
    "boss_office": "headquarter",
    "mob_school": "research_lab",
    "weapons_armoury": "iron_mine",
    "ammunition_depot": "lutinum_refinery",
    "brewery": "drilling_rig",
    "bar": "chemical_plant",
    "smuggle": "enhanced_chemical_plant",
    "weapon_storage": "iron_storage",
    "ammunition_storage": "lutinum_storage",
    "alcohol_storage": "water_tank",
    "safe_room": "hydrogen_tank",
    "boot_camp": "shipyard",
    "security": "orbital_defense_station",
    "spring_gun": "planetary_shield",
    "hidden_mines": "fusion_powerplant",
}

VENDETTA_TO_SPACE4K_RESEARCH: dict[str, str] = {
    "routing": "combustion_engine",
    "strategies": "ion_engine",
    "extortion": "space_curvature_propulsion",
    "base_administration": "colonization_tech",
    "smuggling": "enhanced_cargo_capacity",
    "espionage": "espionage_technology",
    "security_patrol": "space_folding_propulsion",
    "gang_protection": "sensor_technology",
    "close_combat": "camouflage_technology",
    "short_range_weapons": "enhanced_plating",
    "firearms_training": "shield_technology",
    "explosives_training": "energy_focalization",
    "guerilla_training": "ionization",
    "psychological_training": "explosive_projectiles",
    "chemical_training": "plasma_projectiles",
    "honor": "diplomacy",
}

VENDETTA_TO_SPACE4K_TROOP: dict[str, str] = {
    "rowdy": "shakal",
    "bouncer": "renegade",
    "knifer": "darwin",
    "gunman": "raider",
    "occupation_troop": "colony_ship",
    "spy": "espionage_probe",
    "mover": "tjuger",
    "cia_agent": "cougar",
    "fbi_agent": "trader",
    "carrier": "transporter",
    "tactical_expert": "camouflage_bomber",
    "sniper": "longeagle_v",
    "assassin": "noah",
    "ninja": "longeagle_x",
    "demolition_expert": "spit",
    "mercenary": "sentih",
    "clandestine_workers": "light_laser_tower",
    "safeguard": "laser_tower",
    "policeman": "emp_launcher",
    "bodyguard": "plasma_tower",
    "guards": "rocket_launcher",
}

# Legacy storage building -> resource it stores/protects (Mob_Server::getDeposito)
STORAGE_BUILDING_RESOURCE: dict[str, str] = {
    "almacenHierro": "iron",
    "depositoLutino": "lutinum",
    "tanqueHidrogeno": "hydrogen",
    "tanqueAgua": "water",
}

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
