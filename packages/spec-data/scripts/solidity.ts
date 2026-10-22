// Generates a Solidity constants library for one ruleset (docs/spec/data/<ruleset>.yaml +
// game_config.yaml). Indices: troops and research in the order of the ruleset file (canonical
// order, Mob_Data). Modifiers are stored ×10 (all have one decimal). Do not edit the output.

interface Troop {
  id: string;
  trained_at: string;
  cost: Record<string, number>;
  training_duration_s: number;
  points_per_unit: number;
  salary: number | null;
  requirements: Record<string, number> | null;
  role: "attack" | "defense";
  base_attack: number;
  base_defense: number;
  base_capacity: number | null;
  base_speed: number | null;
  speed_research: string | null;
  attack_research_bonuses: string[];
  defense_research_bonuses: string[];
  combat_modifiers: Record<string, number> | null;
}

interface Production {
  kind: "producer" | "converter";
  resource: string;
  factor: number;
  base_rate?: number;
  consumes?: string;
  consumption_per_unit?: number;
  consumption_fixed?: number;
}

interface Room {
  id: string;
  cost: Record<string, number>;
  base_duration_s: number;
  points_per_level: number;
  requirements: Record<string, number> | null;
  production?: Production;
  storage?: { resource: string; base: number; per_level: number; safe_divisor: number };
}

interface ResearchEntry {
  id: string;
  cost: Record<string, number>;
  base_duration_s: number;
  points_per_level: number;
  requirements: Record<string, number> | null;
}

interface RulesetFile {
  ruleset: string;
  resources: string[];
  rules: { troop_defense_multiplier: number };
  roles: Record<string, string>;
  buildings: Room[];
  research: ResearchEntry[];
  troops: Troop[];
}

interface GameConfig {
  time: { upgrade_speed_multiplier: number };
  world: {
    distance_unit: number;
    cities: number;
    neighborhoods: number;
    slots_per_neighborhood: number;
    grid_columns: number;
    grid_rows: number;
  };
  new_player: { starting_resources_each: number; starting_build_speed_room_level: number };
  occupation: {
    starting_resources_each: number;
    starting_build_speed_room_level: number;
    occupation_troops_consumed: number;
  };
  missions: {
    duration_distance_factor: number;
    duration_exponent: number;
    salary_distance_exponent: number;
    salary_divisor: number;
  };
  onchain: {
    max_outgoing_missions_per_player: number;
    max_open_market_offers_per_player: number;
    max_family_applications_per_player: number;
    max_session_seconds: number;
    max_controllers_per_player: number;
    controller_removal_delay_seconds: number;
    hidden_reveal_grace_seconds: number;
    invite_ttl_seconds: number;
  };
  vacation: { duration_days: number; cooldown_days: number };
  market: {
    exchange_rates: Record<string, Record<string, number>>;
    default_penalty_percent: number;
    delivery_window_days: number;
  };
  families: { tag_length: [number, number]; name_length: [number, number] };
  honor: { table: Record<string, number[]>; min_power_percent: number };
  premium: {
    without_premium: Record<string, number>;
    with_premium: Record<string, number>;
  };
}

/** Decimal with at most two places → integer hundredths. */
const centi = (x: number) => {
  const c = Math.round(x * 100);
  if (Math.abs(c - x * 100) > 1e-9) throw new Error(`more than 2 decimals: ${x}`);
  return c;
};

const hex = (bytes: number[]) =>
  bytes
    .map((b) => {
      if (!Number.isInteger(b) || b < 0 || b > 255) throw new Error(`byte out of range: ${b}`);
      return b.toString(16).padStart(2, "0");
    })
    .join("");

const literal = (values: (number | bigint)[]) =>
  `[${values.map((v, i) => (i === 0 ? `uint256(${v})` : `${v}`)).join(", ")}]`;

const uintArray = (name: string, values: (number | bigint)[], doc: string, size = "TROOPS") =>
  `    /// ${doc}
    function ${name}() internal pure returns (uint256[${size}] memory) {
        return ${literal(values)};
    }
`;

const matrix = (name: string, rows: (number | bigint)[][], doc: string, size: string) =>
  `    /// ${doc}
    function ${name}() internal pure returns (uint256[RESOURCES][${size}] memory) {
        return [${rows.map(literal).join(", ")}];
    }
`;

const bytesArray = (name: string, rows: number[][], doc: string, size: string) =>
  `    /// ${doc}
    function ${name}() internal pure returns (bytes[${size}] memory) {
        return [${rows.map((r) => `bytes(hex"${hex(r)}")`).join(", ")}];
    }
`;

export function rulesetLibrary(
  rs: RulesetFile,
  config: GameConfig,
): { name: string; source: string } {
  const name = `${rs.ruleset[0]!.toUpperCase()}${rs.ruleset.slice(1)}Ruleset`;
  const troopIndex = new Map(rs.troops.map((t, i) => [t.id, i]));
  const researchIndex = new Map(rs.research.map((r, i) => [r.id, i]));
  const research = (id: string) => {
    const i = researchIndex.get(id);
    if (i === undefined) throw new Error(`unknown research ${id}`);
    return i;
  };
  // A set of research levels to add up: one bit per research. Duplicates collapse (D-05).
  const mask = (ids: string[]) => ids.reduce((m, id) => m | (1n << BigInt(research(id))), 0n);
  const mult = rs.rules.troop_defense_multiplier;

  const mods: number[] = [];
  for (const x of rs.troops) {
    for (const y of rs.troops) {
      const m = x.combat_modifiers?.[y.id] ?? 1;
      const m10 = Math.round(m * 10);
      if (Math.abs(m10 - m * 10) > 1e-9)
        throw new Error(`modifier ${x.id}->${y.id} has >1 decimal: ${m}`);
      mods.push(m10);
    }
  }
  for (const id of Object.keys(
    Object.assign({}, ...rs.troops.map((t) => t.combat_modifiers ?? {})),
  ))
    if (!troopIndex.has(id)) throw new Error(`modifier against unknown troop ${id}`);

  const rows = Object.entries(config.honor.table)
    .map(([b, v]) => [Number(b), v] as const)
    .sort((a, b) => a[0] - b[0]);
  rows.forEach(([b, v], i) => {
    if (b !== (i + 1) * 5 || v.length !== 9) throw new Error(`honor table row ${b} malformed`);
  });

  const attackMask = rs.troops.reduce(
    (m, t, i) => (t.role === "attack" ? m | (1n << BigInt(i)) : m),
    0n,
  );
  const NONE = 255;

  const roomIndex = new Map(rs.buildings.map((b, i) => [b.id, i]));
  const room = (id: string) => {
    const i = roomIndex.get(id);
    if (i === undefined) throw new Error(`unknown room ${id}`);
    return i;
  };
  const resource = (id: string) => {
    const i = rs.resources.indexOf(id);
    if (i < 0) throw new Error(`unknown resource ${id}`);
    return i;
  };
  const costRow = (c: Record<string, number>) => rs.resources.map((r) => c[r] ?? 0);
  // Requirement triples (kind, index, level): kind 0 = room in the same building, 1 = research.
  const requirements = (req: Record<string, number> | null) =>
    Object.entries(req ?? {}).flatMap(([id, level]) =>
      roomIndex.has(id) ? [0, room(id), level] : [1, research(id), level],
    );
  const prod = rs.buildings.map((b) => b.production);
  const store = rs.buildings.map((b) => b.storage);
  const converted = [...new Set(prod.flatMap((p) => (p?.consumes ? [p.consumes] : [])))];
  if (converted.length !== 1) throw new Error("exactly one converted resource expected");
  const rateDen = prod.reduce((d, p) => {
    const k = p?.consumption_per_unit ?? 1;
    const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
    return (d * k) / g(d, k);
  }, 1);
  /** Exact fraction of a decimal as written (3.3479 → 33479/10000). */
  const fraction = (x: number): [number, number] => {
    const [int, frac = ""] = String(x).split(".");
    let num = Number(int! + frac);
    let den = 10 ** frac.length;
    const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
    const d = g(num, den);
    num /= d;
    den /= d;
    return [num, den];
  };
  const [durNum, durDen] = fraction(config.missions.duration_distance_factor);
  const [durExpNum, durExpDen] = fraction(config.missions.duration_exponent);
  const [salExpNum, salExpDen] = fraction(config.missions.salary_distance_exponent);
  const salaryResource = rs.resources.indexOf(
    rs.buildings.find((b) => b.production?.kind === "converter")!.production!.resource,
  );
  const lootOrder = [
    ...rs.resources.filter((r) => r !== converted[0]),
    ...rs.resources.filter((r) => r === converted[0]),
  ].map(resource);
  const q = (key: string, premium: boolean) => {
    const v = (premium ? config.premium.with_premium : config.premium.without_premium)[key];
    if (v === undefined) throw new Error(`premium.${key} missing`);
    return v;
  };

  const source = `// SPDX-License-Identifier: MIT
// GENERATED by packages/spec-data/scripts/solidity.ts from docs/spec/data/${rs.ruleset}.yaml and
// game_config.yaml. DO NOT EDIT: change the YAML and run \`pnpm codegen\`.
pragma solidity 0.8.28;

// File-level so they can size arrays in other files (library constants cannot).
uint256 constant TROOPS = ${rs.troops.length};
uint256 constant RESEARCH = ${rs.research.length};
uint256 constant ROOMS = ${rs.buildings.length};
uint256 constant RESOURCES = ${rs.resources.length};
uint256 constant MARKET_RATES = ${Object.keys(config.market.exchange_rates).length};

/// Ruleset constants for "${rs.ruleset}". Troop and research indices follow the ruleset file order.
library ${name} {
    /// Research index used for cargo capacity (roles.cargo_research = ${rs.roles.cargo_research}).
    uint256 internal constant CARGO_RESEARCH = ${research(rs.roles.cargo_research!)};
    /// Research index used for the honor table (roles.honor_research = ${rs.roles.honor_research}).
    uint256 internal constant HONOR_RESEARCH = ${research(rs.roles.honor_research!)};
    /// Bit i set = troop i is an attack troop (can travel).
    uint256 internal constant ATTACK_TROOPS = 0x${attackMask.toString(16)};
    /// speedResearch() value for troops that never move.
    uint256 internal constant NO_RESEARCH = ${NONE};
    /// Marker for "no resource" in production and storage tables.
    uint256 internal constant NO_RESOURCE = ${NONE};

    // Roles (rooms).
    uint256 internal constant BUILD_SPEED_ROOM = ${room(rs.roles.build_speed_room!)};
    uint256 internal constant RESEARCH_SPEED_ROOM = ${room(rs.roles.research_speed_room!)};
    uint256 internal constant ATTACK_TRAINING_ROOM = ${room(rs.roles.attack_training_room!)};
    uint256 internal constant DEFENSE_TRAINING_ROOM = ${room(rs.roles.defense_training_room!)};

    // Resources (indices in ruleset order: ${rs.resources.join(", ")}).
    /// The resource converters consume (${converted[0]}).
    uint256 internal constant CONVERTED_RESOURCE = ${resource(converted[0]!)};
    /// Production rates are per hour ×RATE_DEN (lcm of consumption_per_unit), B-03.
    uint256 internal constant RATE_DEN = ${rateDen};
    /// Stock units per resource: 3600 s × RATE_DEN, so a rate ×RATE_DEN per hour is units per second (B-27).
    uint256 internal constant STOCK_SCALE = ${3600 * rateDen};

    // game_config.yaml
    uint256 internal constant UPGRADE_SPEED_MULTIPLIER = ${config.time.upgrade_speed_multiplier};
    uint256 internal constant CITIES = ${config.world.cities};
    uint256 internal constant NEIGHBORHOODS = ${config.world.neighborhoods};
    uint256 internal constant SLOTS = ${config.world.slots_per_neighborhood};
    uint256 internal constant GRID_COLUMNS = ${config.world.grid_columns};
    uint256 internal constant GRID_ROWS = ${config.world.grid_rows};
    uint256 internal constant START_RESOURCES = ${config.new_player.starting_resources_each};
    uint256 internal constant START_BUILD_SPEED_LEVEL = ${config.new_player.starting_build_speed_room_level};
    uint256 internal constant ROOM_QUEUE = ${q("max_room_queue_per_building", false)};
    uint256 internal constant ROOM_QUEUE_PREMIUM = ${q("max_room_queue_per_building", true)};
    uint256 internal constant RESEARCH_QUEUE = ${q("max_research_queue", false)};
    uint256 internal constant RESEARCH_QUEUE_PREMIUM = ${q("max_research_queue", true)};
    uint256 internal constant TROOP_QUEUE = ${q("max_troop_batches_per_queue", false)};
    uint256 internal constant TROOP_QUEUE_PREMIUM = ${q("max_troop_batches_per_queue", true)};
    uint256 internal constant MAX_OUTGOING_MISSIONS = ${config.onchain.max_outgoing_missions_per_player};
    /// A parked hidden mission (nobody revealed it) can be forfeited from here on (B-22).
    uint256 internal constant HIDDEN_REVEAL_GRACE = ${config.onchain.hidden_reveal_grace_seconds};
    /// A controller or transfer invitation lasts this long (B-26).
    uint256 internal constant INVITE_TTL = ${config.onchain.invite_ttl_seconds};
    /// Honor power never drops below this percentage (D-27).
    uint256 internal constant HONOR_MIN_PERCENT = ${config.honor.min_power_percent};
    uint256 internal constant OCCUPATION_TROOP = ${troopIndex.get(rs.roles.occupation_troop!)!};
    uint256 internal constant OCCUPATION_RESOURCES = ${config.occupation.starting_resources_each};
    uint256 internal constant OCCUPATION_BUILD_SPEED_LEVEL = ${config.occupation.starting_build_speed_room_level};
    uint256 internal constant OCCUPATION_TROOPS_CONSUMED = ${config.occupation.occupation_troops_consumed};
    /// Resource that pays mission salaries (what converters produce).
    uint256 internal constant SALARY_RESOURCE = ${salaryResource};
    uint256 internal constant DISTANCE_UNIT = ${config.world.distance_unit};
    // Mission formulas as exact fractions (B-03): duration = round(3600 × (d × F / v)^E).
    uint256 internal constant DURATION_FACTOR_NUM = ${durNum};
    uint256 internal constant DURATION_FACTOR_DEN = ${durDen};
    uint256 internal constant DURATION_EXP_NUM = ${durExpNum};
    uint256 internal constant DURATION_EXP_DEN = ${durExpDen};
    // salary = ⌊d^E × Σ(quantity × salary) / SALARY_DIVISOR⌋
    uint256 internal constant SALARY_EXP_NUM = ${salExpNum};
    uint256 internal constant SALARY_EXP_DEN = ${salExpDen};
    uint256 internal constant SALARY_DIVISOR = ${config.missions.salary_divisor};

    uint256 internal constant VACATION_SECONDS = ${config.vacation.duration_days * 86400};
    uint256 internal constant VACATION_COOLDOWN_SECONDS = ${config.vacation.cooldown_days * 86400};
    uint256 internal constant MARKET_WINDOW_SECONDS = ${config.market.delivery_window_days * 86400};
    /// Added to the restitution a defaulter owes, in percent (D-19).
    uint256 internal constant DEFAULT_PENALTY_PERCENT = ${config.market.default_penalty_percent};
    uint256 internal constant MAX_OPEN_OFFERS = ${config.onchain.max_open_market_offers_per_player};
    uint256 internal constant MAX_APPLICATIONS = ${config.onchain.max_family_applications_per_player};
    uint256 internal constant MAX_SESSION_SECONDS = ${config.onchain.max_session_seconds};
    uint256 internal constant MAX_CONTROLLERS = ${config.onchain.max_controllers_per_player};
    /// Removing another controller or transferring the account waits this long (B-26).
    uint256 internal constant CONTROLLER_REMOVAL_DELAY = ${config.onchain.controller_removal_delay_seconds};
    uint256 internal constant TAG_MIN = ${config.families.tag_length[0]};
    uint256 internal constant TAG_MAX = ${config.families.tag_length[1]};
    uint256 internal constant NAME_MIN = ${config.families.name_length[0]};
    uint256 internal constant NAME_MAX = ${config.families.name_length[1]};

    /// Market exchange rates (D-19): value of 1 dollar in each resource (0 = not tradable).
    function marketRates() internal pure returns (uint256[RESOURCES][MARKET_RATES] memory) {
        return [${Object.values(config.market.exchange_rates)
          .map((rate) => literal(rs.resources.map((r) => rate[r] ?? 0)))
          .join(", ")}];
    }

    /// Loot tie-break order (D-06): resource indices, the converted resource last.
    function lootOrder() internal pure returns (uint256[RESOURCES] memory) {
        return ${literal(lootOrder)};
    }

${matrix(
  "troopCost",
  rs.troops.map((t) => costRow(t.cost)),
  "Cost per unit, per resource.",
  "TROOPS",
)}
${uintArray(
  "troopSeconds",
  rs.troops.map((t) => t.training_duration_s),
  "Training time per unit at training-room level 1, in seconds.",
)}
${uintArray(
  "troopCentipoints",
  rs.troops.map((t) => centi(t.points_per_unit)),
  "Points per unit, ×100.",
)}
${uintArray(
  "troopSalary",
  rs.troops.map((t) => t.salary ?? 0),
  "Mission salary per unit.",
)}
${uintArray(
  "trainedAt",
  rs.troops.map((t) => room(t.trained_at)),
  "Training room (room index) per troop.",
)}
${bytesArray(
  "troopRequirements",
  rs.troops.map((t) => requirements(t.requirements)),
  "Requirements per troop: (kind, index, level) triples, kind 0 = room, 1 = research.",
  "TROOPS",
)}

${matrix(
  "roomCost",
  rs.buildings.map((b) => costRow(b.cost)),
  "Base cost per room (level 0 → 1), per resource.",
  "ROOMS",
)}
${uintArray(
  "roomSeconds",
  rs.buildings.map((b) => b.base_duration_s),
  "Base duration per room, in seconds.",
  "ROOMS",
)}
${uintArray(
  "roomCentipoints",
  rs.buildings.map((b) => centi(b.points_per_level)),
  "Points per room level, ×100.",
  "ROOMS",
)}
${bytesArray(
  "roomRequirements",
  rs.buildings.map((b) => requirements(b.requirements)),
  "Requirements per room: (kind, index, level) triples, kind 0 = room, 1 = research.",
  "ROOMS",
)}
${matrix(
  "researchCost",
  rs.research.map((r) => costRow(r.cost)),
  "Base cost per research (level 0 → 1), per resource.",
  "RESEARCH",
)}
${uintArray(
  "researchSeconds",
  rs.research.map((r) => r.base_duration_s),
  "Base duration per research, in seconds.",
  "RESEARCH",
)}
${uintArray(
  "researchCentipoints",
  rs.research.map((r) => centi(r.points_per_level)),
  "Points per research level, ×100.",
  "RESEARCH",
)}
${bytesArray(
  "researchRequirements",
  rs.research.map((r) => requirements(r.requirements)),
  "Requirements per research: (kind, index, level) triples, kind 0 = room, 1 = research.",
  "RESEARCH",
)}
${uintArray(
  "productionKind",
  prod.map((p) => (p ? (p.kind === "producer" ? 1 : 2) : 0)),
  "Production role per room: 0 none, 1 producer, 2 converter.",
  "ROOMS",
)}
${uintArray(
  "productionResource",
  prod.map((p) => (p ? resource(p.resource) : NONE)),
  "Resource produced, or NO_RESOURCE.",
  "ROOMS",
)}
${uintArray(
  "productionFactor",
  prod.map((p) => p?.factor ?? 0),
  "Factor f in round(f × ((L+1)/2)²).",
  "ROOMS",
)}
${uintArray(
  "productionBase",
  prod.map((p) => p?.base_rate ?? 0),
  "Producer output at level 0 and base added at L > 0.",
  "ROOMS",
)}
${uintArray(
  "consumptionPerUnit",
  prod.map((p) => p?.consumption_per_unit ?? 0),
  "Converter: input consumed per unit of output.",
  "ROOMS",
)}
${uintArray(
  "consumptionFixed",
  prod.map((p) => p?.consumption_fixed ?? 0),
  "Converter: fixed input consumption at L > 0.",
  "ROOMS",
)}
${uintArray(
  "storageResource",
  store.map((x) => (x ? resource(x.resource) : NONE)),
  "Resource stored by the room, or NO_RESOURCE.",
  "ROOMS",
)}
${uintArray(
  "storageBase",
  store.map((x) => x?.base ?? 0),
  "Storage capacity at level 0.",
  "ROOMS",
)}
${uintArray(
  "storagePerLevel",
  store.map((x) => x?.per_level ?? 0),
  "Storage capacity added per level.",
  "ROOMS",
)}
${uintArray(
  "storageSafeDivisor",
  store.map((x) => x?.safe_divisor ?? 1),
  "Protected amount = capacity / divisor.",
  "ROOMS",
)}

${uintArray(
  "baseAttack",
  rs.troops.map((t) => t.base_attack),
  "Base attack per troop.",
)}
${uintArray(
  "baseDefense",
  rs.troops.map((t) => t.base_defense * mult),
  `Base defense per troop, already ×${mult} (rules.troop_defense_multiplier, D-03).`,
)}
${uintArray(
  "baseCapacity",
  rs.troops.map((t) => t.base_capacity ?? 0),
  "Base cargo capacity per troop (0 for defense troops).",
)}
${uintArray(
  "baseSpeed",
  rs.troops.map((t) => t.base_speed ?? 0),
  "Base speed per troop (0 for defense troops).",
)}
${uintArray(
  "speedResearch",
  rs.troops.map((t) => (t.speed_research ? research(t.speed_research) : NONE)),
  "Research index boosting speed, or NO_RESEARCH.",
)}
${uintArray(
  "attackResearchMask",
  rs.troops.map((t) => mask(t.attack_research_bonuses)),
  "Research whose levels add up to the attack bonus (bit = research index).",
)}
${uintArray(
  "defenseResearchMask",
  rs.troops.map((t) => mask(t.defense_research_bonuses)),
  "Research whose levels add up to the defense bonus (bit = research index).",
)}
    /// Matchup modifiers ×10: byte [x * TROOPS + y] = modifier of troop x against troop y (10 = none).
    function modifiers() internal pure returns (bytes memory) {
        return hex"${hex(mods)}";
    }

    /// Honor power %: byte [(row - 1) * 9 + honor] for buildings = row * 5, row 1..20, honor 0..8.
    function honorTable() internal pure returns (bytes memory) {
        return hex"${hex(rows.flatMap(([, v]) => v))}";
    }
}
`;
  return { name, source };
}
