// Ruleset loaded from the generated JSON, with every value the formulas need precomputed: canonical
// indices (troops and research in file order), research bonuses as index sets (duplicates collapse,
// D-05), modifiers ×10 and points in centipoints. Mirrors packages/spec-data/scripts/solidity.ts, so
// the client and the contracts read the same numbers. Formulas use roles, never entity names (D-21).
import { gameConfig, rulesets } from "@vendetta/spec-data";
import { decimalToFraction, type Fraction } from "./math.js";

export type ResourceCosts = Record<string, bigint>;

interface RawTroop {
  id: string;
  requirements: Record<string, number> | null;
  role: "attack" | "defense";
  trained_at: string;
  cost: Record<string, number>;
  training_duration_s: number;
  points_per_unit: number;
  base_attack: number;
  base_defense: number;
  base_capacity: number | null;
  base_speed: number | null;
  salary: number | null;
  speed_research: string | null;
  attack_research_bonuses: string[];
  defense_research_bonuses: string[];
  combat_modifiers: Record<string, number> | null;
}

interface RawProduction {
  kind: "producer" | "converter";
  resource: string;
  factor: number;
  base_rate?: number;
  consumes?: string;
  consumption_per_unit?: number;
  consumption_fixed?: number;
}

interface RawBuilding {
  id: string;
  requirements: Record<string, number> | null;
  cost: Record<string, number>;
  base_duration_s: number;
  points_per_level: number;
  production?: RawProduction;
  storage?: { resource: string; base: number; per_level: number; safe_divisor: number };
}

interface RawResearch {
  id: string;
  requirements: Record<string, number> | null;
  cost: Record<string, number>;
  base_duration_s: number;
  points_per_level: number;
}

interface RawRuleset {
  ruleset: string;
  resources: string[];
  rules: { troop_defense_multiplier: number };
  roles: Record<string, string>;
  buildings: RawBuilding[];
  research: RawResearch[];
  troops: RawTroop[];
}

export interface Troop {
  id: string;
  requirements: Requirement[];
  index: number;
  isAttack: boolean;
  trainedAt: number; // building index
  cost: ResourceCosts;
  trainingSeconds: bigint;
  centipoints: bigint;
  baseAttack: bigint;
  baseDefense: bigint; // already × troop_defense_multiplier (D-03)
  baseCapacity: bigint;
  baseSpeed: bigint;
  salary: bigint;
  speedResearch: number | null;
  attackResearch: number[];
  defenseResearch: number[];
}

/** A requirement on a completed level: a room of the same building, or a research of the player. */
export interface Requirement {
  kind: "room" | "research";
  index: number;
  level: bigint;
}

export interface Building {
  id: string;
  requirements: Requirement[];
  index: number;
  cost: ResourceCosts;
  baseSeconds: bigint;
  centipoints: bigint;
  production?: RawProduction;
  storage?: { resource: string; base: bigint; perLevel: bigint; safeDivisor: bigint };
}

export interface Research {
  id: string;
  requirements: Requirement[];
  index: number;
  cost: ResourceCosts;
  baseSeconds: bigint;
  centipoints: bigint;
}

export interface Ruleset {
  name: string;
  resources: string[];
  /** Loot tie-break order (D-06): resources in file order, the one converters consume last. */
  lootOrder: string[];
  troops: Troop[];
  buildings: Building[];
  research: Research[];
  /** modifiers[x][y] = modifier of troop x against troop y, ×10 (10 = none). */
  modifiers: number[][];
  roles: {
    buildSpeedRoom: number;
    researchSpeedRoom: number;
    attackTrainingRoom: number;
    defenseTrainingRoom: number;
    cargoResearch: number;
    honorResearch: number;
    occupationTroop: number;
    /** Resource index that pays mission salaries: the one converters produce (dollar). */
    salaryResource: number;
  };
  config: Config;
}

export interface Config {
  upgradeSpeedMultiplier: bigint;
  gridColumns: bigint;
  gridRows: bigint;
  distanceUnit: bigint;
  durationFactor: Fraction;
  durationExponent: Fraction;
  salaryExponent: Fraction;
  salaryDivisor: bigint;
  maxRounds: number;
  wipeRatio: bigint;
  /** Power % by buildings / 5 (row 1 = 5 buildings) and honor level. */
  honorTable: number[][];
  honorMaxLevel: number;
  honorMinBuildings: bigint;
  honorTableMaxBuildings: bigint;
  cities: bigint;
  neighborhoods: bigint;
  slots: bigint;
  startResources: bigint;
  startBuildSpeedLevel: bigint;
  occupationResources: bigint;
  occupationBuildSpeedLevel: bigint;
  occupationTroopsConsumed: bigint;
  /** Missions a player can have in flight (B-09). */
  maxOutgoingMissions: number;
  /** A parked hidden mission (nobody revealed it) can be forfeited from here on (B-22). */
  hiddenRevealGrace: bigint;
  /** A building that just took returning troops in cannot send a mission this long (B-22). */
  returnCooldown: bigint;
  /** Reveals go in arrival order: a parked hidden mission holds the ones behind it this long at most (B-22). */
  hiddenOrderWindow: bigint;
  /** A controller or transfer invitation lasts this long (B-26). */
  inviteTtl: bigint;
  /** Honor power never drops below this percentage (D-27). */
  honorMinPercent: bigint;
  vacationSeconds: bigint;
  vacationCooldownSeconds: bigint;
  marketWindowSeconds: bigint;
  /** Added to the restitution a defaulter owes, in percent (D-19). */
  marketPenaltyPercent: bigint;
  maxOpenOffers: number;
  maxApplications: number;
  /** Longest session key authorization, in seconds (B-15). */
  maxSessionSeconds: bigint;
  /** Addresses that manage one account: devices and recovery codes (B-26). */
  maxControllers: number;
  /** Removing another controller or transferring the account waits this long, in seconds (B-26). */
  controllerRemovalDelay: bigint;
  /** Market exchange rates: value of 1 dollar in each resource, per resource index (0 = not tradable). */
  marketRates: bigint[][];
  tagLength: [number, number];
  nameLength: [number, number];
  /** Queue limits without and with premium (B-25). */
  roomQueue: [number, number];
  researchQueue: [number, number];
  troopQueue: [number, number];
}

/** Decimal with at most two places → integer hundredths (points). */
function centi(x: number): bigint {
  const { num, den } = decimalToFraction(x);
  if (100n % den !== 0n) throw new RangeError(`more than 2 decimals: ${x}`);
  return (num * 100n) / den;
}

function costs(raw: Record<string, number>, resources: string[]): ResourceCosts {
  return Object.fromEntries(resources.map((r) => [r, BigInt(raw[r] ?? 0)]));
}

export function loadRuleset(raw: RawRuleset, cfg: typeof gameConfig): Ruleset {
  const indexOf = (list: { id: string }[], kind: string) => {
    const m = new Map(list.map((x, i) => [x.id, i]));
    return (id: string) => {
      const i = m.get(id);
      if (i === undefined) throw new Error(`unknown ${kind} ${id}`);
      return i;
    };
  };
  const troopIndex = indexOf(raw.troops, "troop");
  const buildingIndex = indexOf(raw.buildings, "building");
  const researchIndex = indexOf(raw.research, "research");
  const research = (ids: string[]) => [...new Set(ids.map(researchIndex))].sort((a, b) => a - b);
  const mult = BigInt(raw.rules.troop_defense_multiplier);
  const roomIds = new Set(raw.buildings.map((b) => b.id));
  const requirements = (req: Record<string, number> | null): Requirement[] =>
    Object.entries(req ?? {}).map(([id, level]) =>
      roomIds.has(id)
        ? { kind: "room", index: buildingIndex(id), level: BigInt(level) }
        : { kind: "research", index: researchIndex(id), level: BigInt(level) },
    );

  const consumed = new Set(
    raw.buildings.flatMap((b) => (b.production?.consumes ? [b.production.consumes] : [])),
  );
  const lootOrder = [
    ...raw.resources.filter((r) => !consumed.has(r)),
    ...raw.resources.filter((r) => consumed.has(r)),
  ];

  const modifiers = raw.troops.map((x) =>
    raw.troops.map((y) => {
      const m = x.combat_modifiers?.[y.id] ?? 1;
      const { num, den } = decimalToFraction(m);
      if (10n % den !== 0n) throw new RangeError(`modifier with more than one decimal: ${m}`);
      return Number((num * 10n) / den);
    }),
  );
  for (const t of raw.troops) for (const y of Object.keys(t.combat_modifiers ?? {})) troopIndex(y);

  const honorRows = Object.entries(cfg.honor.table as Record<string, number[]>)
    .map(([b, row]) => [Number(b), row] as const)
    .sort((a, b) => a[0] - b[0]);
  honorRows.forEach(([b], i) => {
    if (b !== (i + 1) * 5) throw new Error(`honor table row ${b} out of order`);
  });

  const m = cfg.missions;
  return {
    name: raw.ruleset,
    resources: raw.resources,
    lootOrder,
    troops: raw.troops.map((t, index) => ({
      id: t.id,
      index,
      isAttack: t.role === "attack",
      trainedAt: buildingIndex(t.trained_at),
      cost: costs(t.cost, raw.resources),
      trainingSeconds: BigInt(t.training_duration_s),
      centipoints: centi(t.points_per_unit),
      requirements: requirements(t.requirements),
      baseAttack: BigInt(t.base_attack),
      baseDefense: BigInt(t.base_defense) * mult,
      baseCapacity: BigInt(t.base_capacity ?? 0),
      baseSpeed: BigInt(t.base_speed ?? 0),
      salary: BigInt(t.salary ?? 0),
      speedResearch: t.speed_research ? researchIndex(t.speed_research) : null,
      attackResearch: research(t.attack_research_bonuses),
      defenseResearch: research(t.defense_research_bonuses),
    })),
    buildings: raw.buildings.map((b, index) => ({
      id: b.id,
      index,
      cost: costs(b.cost, raw.resources),
      baseSeconds: BigInt(b.base_duration_s),
      centipoints: centi(b.points_per_level),
      requirements: requirements(b.requirements),
      production: b.production,
      storage: b.storage && {
        resource: b.storage.resource,
        base: BigInt(b.storage.base),
        perLevel: BigInt(b.storage.per_level),
        safeDivisor: BigInt(b.storage.safe_divisor),
      },
    })),
    research: raw.research.map((r, index) => ({
      id: r.id,
      index,
      cost: costs(r.cost, raw.resources),
      baseSeconds: BigInt(r.base_duration_s),
      centipoints: centi(r.points_per_level),
      requirements: requirements(r.requirements),
    })),
    modifiers,
    roles: {
      buildSpeedRoom: buildingIndex(raw.roles.build_speed_room!),
      researchSpeedRoom: buildingIndex(raw.roles.research_speed_room!),
      attackTrainingRoom: buildingIndex(raw.roles.attack_training_room!),
      defenseTrainingRoom: buildingIndex(raw.roles.defense_training_room!),
      cargoResearch: researchIndex(raw.roles.cargo_research!),
      honorResearch: researchIndex(raw.roles.honor_research!),
      occupationTroop: troopIndex(raw.roles.occupation_troop!),
      salaryResource: raw.resources.indexOf(
        raw.buildings.find((b) => b.production?.kind === "converter")!.production!.resource,
      ),
    },
    config: {
      upgradeSpeedMultiplier: BigInt(cfg.time.upgrade_speed_multiplier),
      gridColumns: BigInt(cfg.world.grid_columns),
      gridRows: BigInt(cfg.world.grid_rows),
      distanceUnit: BigInt(cfg.world.distance_unit),
      durationFactor: decimalToFraction(m.duration_distance_factor),
      durationExponent: decimalToFraction(m.duration_exponent),
      salaryExponent: decimalToFraction(m.salary_distance_exponent),
      salaryDivisor: BigInt(m.salary_divisor),
      maxRounds: cfg.combat.max_rounds,
      wipeRatio: BigInt(cfg.combat.wipe_ratio),
      honorTable: honorRows.map(([, row]) => row),
      honorMaxLevel: cfg.honor.max_honor_level,
      honorMinBuildings: BigInt(cfg.honor.min_buildings_for_penalty),
      honorTableMaxBuildings: BigInt(cfg.honor.table_max_buildings),
      cities: BigInt(cfg.world.cities),
      neighborhoods: BigInt(cfg.world.neighborhoods),
      slots: BigInt(cfg.world.slots_per_neighborhood),
      startResources: BigInt(cfg.new_player.starting_resources_each),
      startBuildSpeedLevel: BigInt(cfg.new_player.starting_build_speed_room_level),
      occupationResources: BigInt(cfg.occupation.starting_resources_each),
      occupationBuildSpeedLevel: BigInt(cfg.occupation.starting_build_speed_room_level),
      occupationTroopsConsumed: BigInt(cfg.occupation.occupation_troops_consumed),
      maxOutgoingMissions: cfg.onchain.max_outgoing_missions_per_player,
      hiddenRevealGrace: BigInt(cfg.onchain.hidden_reveal_grace_seconds),
      returnCooldown: BigInt(cfg.onchain.return_cooldown_seconds),
      hiddenOrderWindow: BigInt(cfg.onchain.hidden_order_window_seconds),
      inviteTtl: BigInt(cfg.onchain.invite_ttl_seconds),
      honorMinPercent: BigInt(cfg.honor.min_power_percent),
      vacationSeconds: BigInt(cfg.vacation.duration_days) * 86400n,
      vacationCooldownSeconds: BigInt(cfg.vacation.cooldown_days) * 86400n,
      marketWindowSeconds: BigInt(cfg.market.delivery_window_days) * 86400n,
      marketPenaltyPercent: BigInt(cfg.market.default_penalty_percent),
      maxOpenOffers: cfg.onchain.max_open_market_offers_per_player,
      maxApplications: cfg.onchain.max_family_applications_per_player,
      maxSessionSeconds: BigInt(cfg.onchain.max_session_seconds),
      maxControllers: cfg.onchain.max_controllers_per_player,
      controllerRemovalDelay: BigInt(cfg.onchain.controller_removal_delay_seconds),
      marketRates: Object.values(
        cfg.market.exchange_rates as Record<string, Record<string, number>>,
      ).map((rate) => raw.resources.map((r) => BigInt(rate[r] ?? 0))),
      tagLength: cfg.families.tag_length as [number, number],
      nameLength: cfg.families.name_length as [number, number],
      roomQueue: [
        cfg.premium.without_premium.max_room_queue_per_building,
        cfg.premium.with_premium.max_room_queue_per_building,
      ],
      researchQueue: [
        cfg.premium.without_premium.max_research_queue,
        cfg.premium.with_premium.max_research_queue,
      ],
      troopQueue: [
        cfg.premium.without_premium.max_troop_batches_per_queue,
        cfg.premium.with_premium.max_troop_batches_per_queue,
      ],
    },
  };
}

export const vendetta: Ruleset = loadRuleset(
  rulesets.vendetta as unknown as RawRuleset,
  gameConfig,
);
