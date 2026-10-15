<?php
/**
 * generate_test_vectors.php
 *
 * Produces docs/spec/data/test_vectors.yaml: exact outputs of the ORIGINAL
 * legacy PHP formulas (Vendetta, "s1 mods" server = Modificadores combat
 * system) so that the modern rewrite can be validated against them.
 *
 * Strategy: load the real classes from library/Mob/ (rooms, research, troops,
 * combat, Mob_Edificio, Mob_Jugador, Mob_Server, Mob_Loader, Mob_Data,
 * Mob_Habitacion_Manager, Mob_Combat_Manager) and the real Zend_Registry.
 * Only DB / front-controller dependencies are stubbed:
 *   - Zend_Controller_Front (returns a bootstrap whose options say
 *     games.vendetta.s1.combatSystemType = "Modificadores")
 *   - env GAME_TYPE=vendetta, GAME_SERVER_NAME=s1 (read by real Mob_Server)
 *   - Mob_Model_Edificio::getRecursos (alcohol stock for getProduccion)
 *   - TestEdificio extends the real Mob_Edificio, populated without a DB.
 * Formulas that live in forms/plugins (mission duration, salary, resource
 * tick) are copied verbatim below with a file:line citation.
 *
 * Usage: php scripts/generate_test_vectors.php [vendetta|space4k]   (default vendetta; PHP 7.4; deprecations muted)
 *   vendetta -> docs/spec/data/test_vectors.yaml
 *   space4k  -> docs/spec/data/test_vectors_space4k.yaml (GAME_TYPE=space4k,
 *               games.space4k.s1.combatSystemType = "Modificadores"; scenarios are
 *               positional translations of the Vendetta ones, see tr()).
 */

error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING & ~E_STRICT);
ini_set('display_errors', 'stderr');
ini_set('serialize_precision', '-1');
ini_set('precision', '17');

$ROOT = dirname(__DIR__);
define('APPLICATION_PATH', $ROOT . '/application');
set_include_path($ROOT . '/library' . PATH_SEPARATOR . get_include_path());
$GAME = isset($argv[1]) ? strtolower($argv[1]) : 'vendetta';
if (!in_array($GAME, array('vendetta', 'space4k'), true)) {
    fwrite(STDERR, "Usage: php scripts/generate_test_vectors.php [vendetta|space4k]\n");
    exit(1);
}
$GDIR = ucfirst($GAME); // legacy class directory: Vendetta / Space4k
putenv("GAME_TYPE=$GAME");
putenv('GAME_SERVER_NAME=s1');

// ---------------------------------------------------------------- stubs ----
class StubBootstrap {
    public function getOptions() {
        return array('games' => array(getenv('GAME_TYPE') => array('s1' => array('combatSystemType' => 'Modificadores'))));
    }
}
class Zend_Controller_Front {
    private static $_i;
    public static function getInstance() { return self::$_i ?: (self::$_i = new self); }
    public function getParam($k) { return $k == 'bootstrap' ? new StubBootstrap : null; }
}
/** Stub of the DB model used by Mob_Habitacion_Manager::getProduccion. */
class Mob_Model_Edificio {
    public static $alcohol = 0;
    public function getRecursos($idEdificio) { return array('recursos_alc' => self::$alcohol); }
}

require_once 'Zend/Registry.php';
$mob = $ROOT . '/library/Mob';
require_once "$mob/Server.php";
require_once "$mob/Loader.php";
require_once "$mob/Data.php";
require_once "$mob/Habitacion/Abstract.php";
foreach (glob("$mob/Habitacion/$GDIR/*.php") as $f) require_once $f;
require_once "$mob/Habitacion/Manager.php";
require_once "$mob/Entrenamiento/Abstract.php";
foreach (glob("$mob/Entrenamiento/$GDIR/*.php") as $f) require_once $f;
require_once "$mob/Tropa/Abstract.php";
require_once "$mob/Tropa/Ataque.php";
require_once "$mob/Tropa/Defensa.php";
foreach (glob("$mob/Tropa/$GDIR/*/*.php") as $f) require_once $f;
require_once "$mob/Combat/Abstract.php";
require_once "$mob/Combat/Modificadores.php";
require_once "$mob/Combat/Manager.php";
require_once "$mob/Edificio.php";
require_once "$mob/Jugador.php";

if (!Mob_Server::esDeModificadores() || Mob_Server::getGameType() != $GAME) {
    fwrite(STDERR, "Stub setup failed: server is not $GAME/Modificadores\n");
    exit(1);
}

/** Real Mob_Edificio populated in memory (no DB). */
class TestEdificio extends Mob_Edificio {
    public function __construct(array $rooms = array(), array $research = array(), array $data = array()) {
        // real loaders: one fresh instance per room / research / troop
        $this->_setHabitaciones()->_setTropas()->_setTropasSeguridad()->_setEntrenamientos();
        foreach ($this->_habitaciones as $k => $h) $h->setNivel(isset($rooms[$k]) ? $rooms[$k] : 0);
        foreach ($this->_entrenamientos as $k => $e) $e->setNivel(isset($research[$k]) ? $research[$k] : 0);
        $this->_data = array_merge(array('coord1' => 1, 'coord2' => 1, 'coord3' => 1,
            'recursos_arm' => 0, 'recursos_mun' => 0, 'recursos_dol' => 0, 'recursos_alc' => 0), $data);
    }
}

// ------------------------------------------------------- id mapping --------
/** Pick the Vendetta or the Space4k variant of a text / field name. */
function G($vendetta, $space4k) { return $GLOBALS['GAME'] == 'space4k' ? $space4k : $vendetta; }

if ($GAME == 'space4k') {
// Mirrors scripts/space4k_id_map.py
$RES = array('arm' => 'iron', 'mun' => 'lutinum', 'dol' => 'hydrogen', 'alc' => 'water');
$BLD = array('centroOperaciones' => 'headquarter', 'centroInvestigacion' => 'research_lab', 'minaHierro' => 'iron_mine',
    'refineriaLutino' => 'lutinum_refinery', 'plataformaPerforacion' => 'drilling_rig', 'plQuimica' => 'chemical_plant',
    'plQuimicaMejorada' => 'enhanced_chemical_plant', 'almacenHierro' => 'iron_storage', 'depositoLutino' => 'lutinum_storage',
    'tanqueAgua' => 'water_tank', 'tanqueHidrogeno' => 'hydrogen_tank', 'hangar' => 'shipyard',
    'estacionDefensa' => 'orbital_defense_station', 'escudoPlanetario' => 'planetary_shield',
    'centralEnergetica' => 'fusion_powerplant');
$RSH = array('motorCombustion' => 'combustion_engine', 'motorIonico' => 'ion_engine',
    'propulsionEspacio' => 'space_curvature_propulsion', 'tecColonizacion' => 'colonization_tech',
    'capCargaMejorada' => 'enhanced_cargo_capacity', 'tecEspionaje' => 'espionage_technology',
    'propMultidimensional' => 'space_folding_propulsion', 'tecDeteccion' => 'sensor_technology',
    'tecCamuflaje' => 'camouflage_technology', 'blindajeMejorado' => 'enhanced_plating', 'tecDefensa' => 'shield_technology',
    'focalizacionEnerg' => 'energy_focalization', 'ionizacion' => 'ionization', 'proyExplosivos' => 'explosive_projectiles',
    'proyPlasma' => 'plasma_projectiles', 'diplomacia' => 'diplomacy');
$TRP = array('chacal' => 'shakal', 'renegado' => 'renegade', 'darwin' => 'darwin', 'saqueador' => 'raider',
    'colonizador' => 'colony_ship', 'sondaEspionaje' => 'espionage_probe', 'tjuger' => 'tjuger', 'cougar' => 'cougar',
    'comerciante' => 'trader', 'transportador' => 'transporter', 'bombarderoCamuflaje' => 'camouflage_bomber',
    'aguilaGrandeV' => 'longeagle_v', 'noe' => 'noah', 'aguilaGrandeX' => 'longeagle_x', 'spit' => 'spit',
    'sentih' => 'sentih', 'torreLaserPequena' => 'light_laser_tower', 'torreLaser' => 'laser_tower',
    'lanzadorPulsos' => 'emp_launcher', 'torrePlasma' => 'plasma_tower', 'lanzamisiles' => 'rocket_launcher');
} else {
// Mirrors scripts/vendetta_id_map.py
$RES = array('arm' => 'weapons', 'mun' => 'ammunition', 'dol' => 'dollar', 'alc' => 'alcohol');
$BLD = array('oficina' => 'boss_office', 'escuela' => 'mob_school', 'armeria' => 'weapons_armoury',
    'municion' => 'ammunition_depot', 'cerveceria' => 'brewery', 'taberna' => 'bar', 'contrabando' => 'smuggle',
    'almacenArm' => 'weapon_storage', 'deposito' => 'ammunition_storage', 'almacenAlc' => 'alcohol_storage',
    'caja' => 'safe_room', 'campo' => 'boot_camp', 'seguridad' => 'security', 'torreta' => 'spring_gun',
    'minas' => 'hidden_mines');
$RSH = array('rutas' => 'routing', 'encargos' => 'strategies', 'extorsion' => 'extortion',
    'administracion' => 'base_administration', 'contrabando' => 'smuggling', 'espionaje' => 'espionage',
    'seguridad' => 'security_patrol', 'proteccion' => 'gang_protection', 'combate' => 'close_combat',
    'armas' => 'short_range_weapons', 'tiro' => 'firearms_training', 'explosivos' => 'explosives_training',
    'guerrilla' => 'guerilla_training', 'psicologico' => 'psychological_training', 'quimico' => 'chemical_training',
    'honor' => 'honor');
$TRP = array('maton' => 'rowdy', 'portero' => 'bouncer', 'acuchillador' => 'knifer', 'pistolero' => 'gunman',
    'ocupacion' => 'occupation_troop', 'espia' => 'spy', 'porteador' => 'mover', 'cia' => 'cia_agent',
    'fbi' => 'fbi_agent', 'transportista' => 'carrier', 'tactico' => 'tactical_expert', 'francotirador' => 'sniper',
    'asesino' => 'assassin', 'ninja' => 'ninja', 'demoliciones' => 'demolition_expert', 'mercenario' => 'mercenary',
    'ilegal' => 'clandestine_workers', 'centinela' => 'safeguard', 'policia' => 'policeman',
    'guardaespaldas' => 'bodyguard', 'guardia' => 'guards');
}
$TRP_INV = array_flip($TRP);

/**
 * Scenarios below are written with Vendetta legacy IDs. tr() translates one
 * positionally to the current game: index i of Mob_Data::get{Habitaciones,
 * Entrenamientos,Tropas}Vendetta() -> index i of the current game's list
 * (troops per 'ataque'/'defensa' sub-list). Identity for vendetta.
 * $kind: 'hab' | 'ent' | 'trp'.
 */
function tr($id, $kind) {
    static $maps = array();
    if (!isset($maps[$kind])) {
        $g = ucfirst(Mob_Server::getGameType());
        if ($kind == 'trp') {
            $map = array();
            foreach (array('ataque', 'defensa') as $t) $map += array_combine(
                call_user_func(array('Mob_Data', 'getTropasVendetta'), $t), call_user_func(array('Mob_Data', "getTropas$g"), $t));
        } else {
            $fn = $kind == 'hab' ? 'getHabitaciones' : 'getEntrenamientos';
            $map = array_combine(call_user_func(array('Mob_Data', $fn . 'Vendetta')), call_user_func(array('Mob_Data', $fn . $g)));
        }
        $maps[$kind] = $map;
    }
    if (!isset($maps[$kind][$id])) throw new Exception("tr(): unknown Vendetta $kind id '$id'");
    return $maps[$kind][$id];
}
/** tr() applied to the keys of an array. */
function trKeys(array $a, $kind) { $o = array(); foreach ($a as $k => $v) $o[tr($k, $kind)] = $v; return $o; }

function mapKeys(array $a, array $map) { $o = array(); foreach ($a as $k => $v) $o[$map[$k]] = $v; return $o; }
function allResearch($lvl) { $o = array(); foreach (Mob_Data::getEntrenamientos() as $e) $o[$e] = $lvl; return $o; }
/** Normalize legacy numeric output (strings from honor.php, floats from round()). */
function num($v) {
    if (is_string($v) && is_numeric($v)) $v = $v + 0;
    return $v;
}

$out = array();

// ------------------------------------------------ 1. building_upgrade -----
$cases = array();
foreach (Mob_Data::getHabitaciones() as $hab) {
    foreach (array(array(0, 1), array(4, 5), array(9, 10), array(19, 20)) as $tr) {
        foreach (array(1, 10, 20) as $of) {
            $ed = new TestEdificio(array(Mob_Server::getNameHabTiempo() => $of));
            $h = $ed->getHabitacion($hab);
            $h->setNivel($tr[0]);
            $cost = array();
            foreach ($RES as $r => $s) if ($r != 'alc') $cost[$s] = num($h->getCosto($r));
            $cases[] = array('building' => $BLD[$hab], 'from_level' => $tr[0], 'to_level' => $tr[1],
                $BLD[Mob_Server::getNameHabTiempo()] . '_level' => $of, 'cost' => $cost,
                'time_seconds' => num($h->getTiempoMejora('segundos', $tr[1], $of)));
        }
    }
}
$out['building_upgrade'] = array(
    '_source' => G('library/Mob/Habitacion/Abstract.php getCosto(), getTiempoMejora("segundos", to_level, boss_office_level)',
        'library/Mob/Habitacion/Abstract.php getCosto(), getTiempoMejora("segundos", to_level, headquarter_level)'),
    '_formula' => G('cost = base * (from_level+1)^2 ; time = round((to_level^2 * duration / boss_office_level) / 3)',
        'cost = base * (from_level+1)^2 ; time = round((to_level^2 * duration / headquarter_level) / 3)'),
    'cases' => $cases);

// ------------------------------------------------ 2. research_upgrade -----
$cases = array();
foreach (Mob_Data::getEntrenamientos() as $ent) {
    foreach (array(array(0, 1), array(4, 5), array(9, 10), array(19, 20)) as $tr) {
        foreach (array(1, 5, 15) as $esc) {
            $ed = new TestEdificio(array(Mob_Server::getNameHabTiempoEnt() => $esc));
            $e = $ed->getEntrenamiento($ent);
            $e->setNivel($tr[0]);
            $cost = array();
            foreach ($RES as $r => $s) if ($r != 'alc') $cost[$s] = num($e->getCosto($r));
            $cases[] = array('research' => $RSH[$ent], 'from_level' => $tr[0], 'to_level' => $tr[1],
                $BLD[Mob_Server::getNameHabTiempoEnt()] . '_level' => $esc, 'cost' => $cost,
                'time_seconds' => num($e->getTiempoMejora('segundos', $tr[1], $esc)));
        }
    }
}
$out['research_upgrade'] = array(
    '_source' => G('library/Mob/Entrenamiento/Abstract.php getCosto(), getTiempoMejora("segundos", to_level, mob_school_level)',
        'library/Mob/Entrenamiento/Abstract.php getCosto(), getTiempoMejora("segundos", to_level, research_lab_level)'),
    '_formula' => G('cost = base * (from_level+1)^2 ; time = round(round(to_level^2 * duration / mob_school_level) / 3)',
        'cost = base * (from_level+1)^2 ; time = round(round(to_level^2 * duration / research_lab_level) / 3)'),
    'cases' => $cases);

// ------------------------------------------------ 3. troop_training -------
$cases = array();
foreach (Mob_Data::getTropas() as $t) {
    $tr = Mob_Loader::getTropa($t);
    foreach (array(1, 100) as $q) {
        foreach (array(1, 10) as $lvl) {
            $cost = array();
            foreach ($RES as $r => $s) if ($r != 'alc') $cost[$s] = num($tr->getCosto($r) * $q);
            $per = $tr->getTiempoEntrenamiento(false, $lvl);
            $cases[] = array('troop' => $TRP[$t], 'quantity' => $q,
                'training_building' => $BLD[$tr->getHabEntrenamiento()], 'training_building_level' => $lvl,
                'cost' => $cost, 'time_per_unit_seconds' => num($per), 'batch_time_seconds' => num($per * $q));
        }
    }
}
$out['troop_training'] = array(
    '_source' => 'library/Mob/Tropa/Abstract.php getCosto(), getTiempoEntrenamiento(false, level)',
    '_formula' => 'cost = base * quantity ; time_per_unit = duration / training_building_level (NOT divided by 3, NOT rounded); batch = per_unit * quantity',
    'cases' => $cases);

// ------------------------------------------------ 4. troop_stats ----------
$cases = array();
foreach (Mob_Data::getTropas() as $t) {
    $cls = Mob_Loader::getClassTropa($t);
    $rc = new ReflectionClass($cls);
    $def = $rc->getDefaultProperties();
    $base = array(
        'attack' => num($def['_ataque']), 'defense_raw' => num($def['_defensa']),
        G('defense_after_x10', 'defense_base') => null, 'speed' => isset($def['_velocidad']) ? num($def['_velocidad']) : null,
        'capacity' => isset($def['_capacidad']) ? num($def['_capacidad']) : null,
        'salary' => isset($def['_salario']) ? num($def['_salario']) : null,
        'speed_research' => isset($def['_bonificacionVelocidad']) ? $RSH[lcfirst($def['_bonificacionVelocidad'])] : null,
        'attack_research' => array_map(function ($x) use ($RSH) { return $RSH[lcfirst($x)]; }, $def['_bonificacionesA']),
        'defense_research' => array_map(function ($x) use ($RSH) { return $RSH[lcfirst($x)]; }, $def['_bonificacionesD']),
        'matchup_modifiers' => $def['_modificadores'] ? mapKeys($def['_modificadores'], $GLOBALS['TRP']) : (object)array(),
    );
    $byLevel = array();
    foreach (array(0, 5, 15) as $lvl) {
        $ed = new TestEdificio(array(), allResearch($lvl));
        $obj = $ed->getTropa($t);
        $base[G('defense_after_x10', 'defense_base')] = num($obj->getDefensaBase());
        try { $speed = num($obj->getVelocidad()); } catch (Throwable $e) { $speed = null; }
        $cap = $obj->getTipo() == 1 ? num($obj->getCapacidad()) : null;
        $byLevel[] = array('all_research_level' => $lvl, 'attack' => num($obj->getAtaque()),
            'defense' => num($obj->getDefensa()), 'speed' => $speed, 'capacity' => $cap);
    }
    $cases[] = array('troop' => $TRP[$t], 'type' => $rc->isSubclassOf('Mob_Tropa_Ataque') ? 'attack' : 'defense',
        'base' => $base, 'effective' => $byLevel);
}
$dupResearch = array();
foreach ($cases as $c) foreach (array('attack_research', 'defense_research') as $k)
    foreach (array_count_values($c['base'][$k]) as $r => $n) if ($n > 1) $dupResearch[] = "$c[troop]: $r";
$out['troop_stats'] = G(array(
    '_source' => 'library/Mob/Tropa/Abstract.php __construct (defense *= 10 when Modificadores+vendetta), getAtaque, getDefensa, getVelocidad, getCapacidad',
    '_formula' => 'attack = floor((1 + sqrt(sum of levels of attack_research)/10) * base_attack); defense = floor((1 + sqrt(sum levels of defense_research)/10) * defense_raw*10); speed = round(base_speed*(1+sqrt(level speed_research)/10)); capacity = round(base_capacity*(1+sqrt(level smuggling)/10)). A research listed twice (tactical_expert: firearms_training) counts twice in the sum.',
    '_note' => 'Defense troops have no speed/capacity/salary: legacy getVelocidad() fatals (null research) -> null here; capacity reported null for defense troops (legacy round(null*x)=0).',
    'cases' => $cases), array(
    '_source' => 'library/Mob/Tropa/Abstract.php __construct (the defense *= 10 multiplier applies ONLY when game type is vendetta, so Space4k defense is NOT multiplied), getAtaque, getDefensa, getVelocidad, getCapacidad',
    '_formula' => 'attack = floor((1 + sqrt(sum of levels of attack_research)/10) * base_attack); defense = floor((1 + sqrt(sum levels of defense_research)/10) * defense_raw) (defense_base == defense_raw, no multiplier); speed = round(base_speed*(1+sqrt(level speed_research)/10)); capacity = round(base_capacity*(1+sqrt(level enhanced_cargo_capacity)/10)).'
        . ($dupResearch ? ' A research listed twice counts twice in the sum (' . implode(', ', $dupResearch) . ').' : ' A research listed twice would count twice in the sum (no Space4k troop lists one twice).'),
    '_note' => 'Defense troops have no speed/capacity/salary: legacy getVelocidad() fatals (null research) -> null here; capacity reported null for defense troops (legacy round(null*x)=0).',
    'cases' => $cases));

// ------------------------------------------------ 5. production + tick ----
$combos = array(
    // armeria, municion, cerveceria, taberna, contrabando
    array(0, 0, 0, 0, 0), array(1, 1, 1, 0, 0), array(0, 0, 0, 1, 0), array(5, 5, 5, 5, 0),
    array(10, 10, 10, 10, 0), array(10, 10, 10, 10, 10), array(1, 1, 1, 20, 0), array(15, 15, 20, 15, 10),
    array(20, 20, 25, 20, 20), array(30, 30, 30, 30, 30), array(5, 5, 3, 3, 3),
);
$cases = array();
foreach ($combos as $c) {
    foreach (array(0, 100, 1000000) as $stock) {
        Mob_Model_Edificio::$alcohol = $stock;
        // Real call: Mob_Habitacion_Manager::getProduccion($armeria, $municion, $taberna, $contrabando, $cerveceria, $idEdificio)
        $p = Mob_Habitacion_Manager::getProduccion($c[0], $c[1], $c[3], $c[4], $c[2], 1);
        $prod = array();
        foreach ($RES as $r => $s) $prod[$s] = num($p[$r]);
        $ticks = array();
        foreach (array(1, 60, 3600, 86400) as $dif) {
            $row = array('dt_seconds' => $dif);
            // VERBATIM: library/Mob/Controller/Plugin/Update.php:64-67  (int)ceil($produccion["x"]/3600*$dif)
            foreach ($RES as $r => $s) $row[$s] = (int)ceil($p[$r] / 3600 * $dif);
            $ticks[] = $row;
        }
        $cases[] = array('levels' => array($BLD[Mob_Server::getNameHabRecurso(1)] => $c[0], $BLD[Mob_Server::getNameHabRecurso(2)] => $c[1],
            $BLD[Mob_Server::getNameHabRecurso(5)] => $c[2], $BLD[Mob_Server::getNameHabRecurso(3)] => $c[3],
            $BLD[Mob_Server::getNameHabRecurso(4)] => $c[4]), $RES['alc'] . '_stock' => $stock,
            'production_per_hour' => $prod, 'tick_gain' => $ticks);
    }
}
$out['production'] = array(
    '_source' => 'library/Mob/Habitacion/Manager.php::getProduccion (real call, alcohol stock stubbed via Mob_Model_Edificio::getRecursos); tick = library/Mob/Controller/Plugin/Update.php:64-67 (int)ceil(prod/3600*dt)',
    '_note' => G('Legacy quirks preserved: dollar production can be fractional or negative; when bar is satisfied from stock but brewery output < bar consumption, alcohol production goes negative and smuggle is fed getProduccionByConsumo(<negative prodAlcohol>); smuggle starvation uses prodAlcohol, not stock. alcohol_stock 0 is treated as "no stock" (!empty check).',
        'Same legacy algorithm as Vendetta with Space4k rooms (Mob_Server::getNameHabRecurso): iron_mine->iron, lutinum_refinery->lutinum, drilling_rig->water, chemical_plant (bar slot) and enhanced_chemical_plant (smuggle slot) consume water to produce hydrogen. Quirks preserved: hydrogen production can be fractional or negative; when chemical_plant is satisfied from stock but drilling_rig output < its consumption, water production goes negative and enhanced_chemical_plant is fed getProduccionByConsumo(<negative prodAlcohol>); enhanced_chemical_plant starvation uses water production, not stock. water_stock 0 is treated as "no stock" (!empty check).'),
    'cases' => $cases);

// ------------------------------------------------ 6. storage --------------
$cases = array();
foreach (array(Mob_Server::getDeposito(1), Mob_Server::getDeposito(2), Mob_Server::getDeposito(3), Mob_Server::getDeposito(4)) as $hab) {
    foreach (array(0, 1, 5, 10, 20) as $lvl) {
        $h = Mob_Loader::getHabitacion($hab);
        $h->setNivel($lvl);
        $cases[] = array('building' => $BLD[$hab], 'level' => $lvl,
            'capacity' => num($h->getAlmacenamiento()), 'safe_amount' => num($h->getAlmacenamientoSeguro()));
    }
}
$out['storage'] = array(
    '_source' => G('library/Mob/Habitacion/Vendetta/{AlmacenArm,Deposito,Caja,AlmacenAlc}.php getAlmacenamiento(), getAlmacenamientoSeguro()',
        'library/Mob/Habitacion/Space4k/{AlmacenHierro,DepositoLutino,TanqueHidrogeno,TanqueAgua}.php getAlmacenamiento(), getAlmacenamientoSeguro()'),
    '_formula' => G('capacity = 10000 + 150000*level ; safe = capacity/10. weapon_storage->weapons, ammunition_storage->ammunition, safe_room->dollar, alcohol_storage->alcohol (Mob_Server::getDeposito)',
        'capacity = 10000 + 150000*level ; safe = capacity/10. iron_storage->iron, lutinum_storage->lutinum, hydrogen_tank->hydrogen, water_tank->water (Mob_Server::getDeposito)'),
    'cases' => $cases);

// ------------------------------------------------ 7. honor ----------------
$cases = array();
foreach (array(1, 4, 5, 7, 12, 23, 50, 99, 100, 101, 150) as $b) {
    for ($h = 0; $h <= 8; $h++) {
        $cases[] = array('total_buildings' => $b, 'honor_level' => $h,
            'attack_power_pct' => num(Mob_Jugador::calcPoderAtaque($b, $h)));
    }
}
$out['honor'] = array(
    '_source' => 'library/Mob/Jugador.php::calcPoderAtaque + application/configs/honor.php',
    '_note' => 'Legacy returns a string for exact table hits and a float otherwise; normalized to numbers here. For >100 buildings the honor level is NOT clamped to 8 before indexing.',
    'cases' => $cases);

// ------------------------------------------------ 8. distance + mission ---
$pairs = array(
    array('same row adjacent', array(1, 1, 1), array(1, 1, 2)),
    array('same column next row', array(1, 1, 1), array(1, 1, 18)),
    array('row wrap 17->18', array(1, 1, 17), array(1, 1, 18)),
    array('slot 17 to slot 34', array(1, 1, 17), array(1, 1, 34)),
    array('slot 16 to slot 17', array(1, 1, 16), array(1, 1, 17)),
    array('adjacent neighborhood (coord2)', array(1, 1, 1), array(1, 2, 1)),
    array('adjacent city (coord1)', array(1, 1, 1), array(2, 1, 1)),
    array('code comment example', array(25, 25, 17), array(25, 25, 251)),
    array('mid range', array(3, 7, 100), array(12, 4, 33)),
    array('far corner', array(1, 1, 1), array(50, 50, 255)),
);
$cases = array();
foreach ($pairs as $p) {
    $ed = new TestEdificio(array(), array(), array('coord1' => $p[1][0], 'coord2' => $p[1][1], 'coord3' => $p[1][2]));
    $d = $ed->getDistancia($p[2][0], $p[2][1], $p[2][2]);
    $dur = array(); $sal = array();
    foreach (array(2500, 4000, 400000) as $vmax) {
        // VERBATIM: application/forms/Misiones/Coordenadas.php:177  round(pow(($d* 3.3479)/$infoTropas["vmax"], 0.2)*3600)
        $dur[] = array('vmax' => $vmax, 'duration_seconds' => num(round(pow(($d * 3.3479) / $vmax, 0.2) * 3600)));
    }
    foreach (array(10, 1000) as $s) {
        // VERBATIM: application/forms/Misiones/Coordenadas.php:182  floor(pow($d,0.8 ) * $infoTropas["salario"] / 2512)
        $sal[] = array('total_salary' => $s, 'mission_salary' => num(floor(pow($d, 0.8) * $s / 2512)));
    }
    $cases[] = array('label' => $p[0], 'from' => implode(':', $p[1]), 'to' => implode(':', $p[2]),
        'distance' => num($d), 'duration' => $dur, 'salary' => $sal);
}
$out['distance_mission'] = array(
    '_source' => 'library/Mob/Edificio.php::getDistancia (real call); duration/salary: application/forms/Misiones/Coordenadas.php:177,182 (verbatim)',
    '_formula' => 'x(c,e) = (c-1)*17 + (e%17==0 ? 17 : frac(e/17)*17) - 1 ; y(b,e) = (b-1)*15 + ceil(e/17) - 1 ; distance = round(sqrt(dx^2+dy^2))*1000 ; duration = round(((d*3.3479)/vmax)^0.2 * 3600) ; salary = floor(d^0.8 * total_salary / 2512). Coordinates are coord1:coord2:coord3.',
    '_note' => 'vmax = min speed of the fleet (application/forms/Misiones/Tropas.php:70-74); total_salary = sum(unit salary * count).',
    'cases' => $cases);

// Random pairs: duration and salary are the most float-heavy formulas, so the on-chain integer
// versions need many more cases than the hand-picked ones above.
mt_srand(20261015);
$cases = array();
for ($i = 0; $i < 200; $i++) {
    $from = array(mt_rand(1, 50), mt_rand(1, 50), mt_rand(1, 255));
    $to = array(mt_rand(1, 50), mt_rand(1, 50), mt_rand(1, 255));
    $ed = new TestEdificio(array(), array(), array('coord1' => $from[0], 'coord2' => $from[1], 'coord3' => $from[2]));
    $d = $ed->getDistancia($to[0], $to[1], $to[2]);
    $vmax = (int) round(pow(10, mt_rand(2600, 5600) / 1000));   // ~400 .. ~400,000
    $s = (int) round(pow(10, mt_rand(0, 7000) / 1000));          // 1 .. 10,000,000
    $cases[] = array('from' => implode(':', $from), 'to' => implode(':', $to), 'distance' => num($d),
        // VERBATIM formulas: application/forms/Misiones/Coordenadas.php:177,182
        'vmax' => $vmax, 'duration_seconds' => num(round(pow(($d * 3.3479) / $vmax, 0.2) * 3600)),
        'total_salary' => $s, 'mission_salary' => num(floor(pow($d, 0.8) * $s / 2512)));
}
$out['distance_mission_random'] = array(
    '_source' => 'same formulas as distance_mission; 200 random coordinate pairs, vmax and total_salary (mt_srand 20261015)',
    'cases' => $cases);

// ------------------------------------------------ 9. combat ---------------
/** Build $tropasBatalla the way Combat/Manager.php:30-53 does. */
function buildBattle(array $att, array $def, $resA, $resD) {
    $edA = new TestEdificio(array(), allResearch($resA));
    $edD = new TestEdificio(array(), allResearch($resD));
    $tb = array();
    foreach ($att as $t => $n) {
        $tb[$t]['a'] = array('total' => $n, 'ataque' => $edA->getTropa($t)->getAtaque(), 'defensa' => $edA->getTropa($t)->getDefensa());
        $tb[$t]['d'] = array('total' => 0, 'ataque' => 0, 'defensa' => 0);
    }
    // defender troops in Mob_Data order (getTropasEstacionadas = attack troops then defense troops)
    foreach (Mob_Data::getTropas() as $t) {
        if (empty($def[$t])) continue;
        if (!isset($tb[$t]['a'])) $tb[$t]['a'] = array('total' => 0, 'ataque' => 0, 'defensa' => 0);
        $tb[$t]['d'] = array('total' => $def[$t], 'ataque' => $edD->getTropa($t)->getAtaque(), 'defensa' => $edD->getTropa($t)->getDefensa());
    }
    return array($tb, $edA);
}
function exportBattleInput(array $tb) {
    global $TRP; $o = array();
    foreach ($tb as $t => $d) {
        $o[$TRP[$t]] = array(
            'attacker' => array('count' => num($d['a']['total']), 'attack' => num($d['a']['ataque']), 'defense' => num($d['a']['defensa'])),
            'defender' => array('count' => num($d['d']['total']), 'attack' => num($d['d']['ataque']), 'defense' => num($d['d']['defensa'])));
    }
    return $o;
}
function exportRounds(array $data) {
    global $TRP; $rounds = array();
    foreach ($data as $n => $r) {
        $troops = array();
        foreach ($r['tropas'] as $t => $x) $troops[$TRP[$t]] = array('attacker_count' => num($x['a']),
            'attacker_deaths' => num($x['muertesA']), 'defender_count' => num($x['d']), 'defender_deaths' => num($x['muertesD']));
        $sa = array(); foreach ($r['ataquesA'] as $x) $sa[] = array('attacker' => $TRP[$x[0]], 'target' => $TRP[$x[1]], 'defender_deaths' => num($x[2]));
        $sd = array(); foreach ($r['ataquesD'] as $x) $sd[] = array('attacker' => $TRP[$x[0]], 'defender' => $TRP[$x[1]], 'attacker_deaths' => num($x[2]));
        $row = array('round' => $n, 'troops' => $troops ?: (object)array(), 'attacker_strikes' => $sa, 'defender_strikes' => $sd);
        if (isset($r['PAA'])) $row['power_sums'] = array('PAA' => num($r['PAA']), 'PDA' => num($r['PDA']), 'PAD' => num($r['PAD']), 'PDD' => num($r['PDD']));
        $rounds[] = $row;
    }
    return $rounds;
}
function remaining(array $r) { global $TRP; $o = array(); foreach ($r as $t => $n) $o[$TRP[$t]] = $n; return $o ?: (object)array(); }

$scen = array(
    array('small vs small', array('maton' => 100), array('ilegal' => 50), 0, 0, array()),
    array('mixed armies with matchup modifiers', array('maton' => 500, 'pistolero' => 200, 'asesino' => 50, 'tactico' => 30),
        array('maton' => 100, 'ninja' => 10, 'ilegal' => 300, 'centinela' => 100, 'guardia' => 20), 5, 5, array()),
    array('matchup: rowdy hard-counters demolition_expert', array('demoliciones' => 20),
        array('maton' => 2000, 'policia' => 10), 3, 3, array()),
    array('overwhelming defender (>10x) wipes attacker', array('maton' => 10), array('centinela' => 1000), 0, 5, array()),
    array('overwhelming attacker (>10x) wipes defender', array('asesino' => 1000), array('ilegal' => 10), 5, 0, array()),
    array('defender with zero troops', array('pistolero' => 100), array(), 2, 2, array()),
    array('defender with only defense troops', array('pistolero' => 300, 'cia' => 50),
        array('policia' => 100, 'guardaespaldas' => 50), 3, 8, array()),
    array('honor: attacker pctPoder < 100 (23 buildings, honor 0)', array('maton' => 500, 'pistolero' => 200, 'asesino' => 50, 'tactico' => 30),
        array('maton' => 100, 'ninja' => 10, 'ilegal' => 300, 'centinela' => 100, 'guardia' => 20), 5, 5,
        array('pctPoderA' => num(Mob_Jugador::calcPoderAtaque(23, 0)), 'pctPoderD' => 100)),
    array('honor: both sides reduced (A: 50 bldg honor 8, D: 23 bldg honor 1)', array('pistolero' => 300, 'cia' => 50),
        array('policia' => 100, 'guardaespaldas' => 50), 3, 8,
        array('pctPoderA' => num(Mob_Jugador::calcPoderAtaque(50, 8)), 'pctPoderD' => num(Mob_Jugador::calcPoderAtaque(23, 1)))),
);
foreach ($scen as &$s) { $s[1] = trKeys($s[1], 'trp'); $s[2] = trKeys($s[2], 'trp'); }
unset($s);
$cases = array();
foreach ($scen as $s) {
    list($tb) = buildBattle($s[1], $s[2], $s[3], $s[4]);
    $c = new Mob_Combat_Modificadores($tb, $s[5]);
    $data = $c->getData();
    $cases[] = array('label' => $s[0],
        'attacker_research_all' => $s[3], 'defender_research_all' => $s[4],
        'pct_power_attacker' => isset($s[5]['pctPoderA']) ? $s[5]['pctPoderA'] : 100,
        'pct_power_defender' => isset($s[5]['pctPoderD']) ? $s[5]['pctPoderD'] : 100,
        'troop_order' => array_map(function ($t) { return $GLOBALS['TRP'][$t]; }, array_keys($tb)),
        'input' => exportBattleInput($tb),
        'expected' => array('rounds_count' => count($data),
            'attacker_remaining' => remaining($c->getTropasRestantes('atacante')),
            'defender_remaining' => remaining($c->getTropasRestantes('defensor')),
            'rounds' => exportRounds($data)));
}
$out['combat'] = array(
    '_source' => 'library/Mob/Combat/Modificadores.php + Combat/Abstract.php (real class); input assembled like Combat/Manager.php:30-53',
    '_note' => 'troop_order is the PHP array insertion order (attacker troops first in Mob_Data order, then defender-only troops in Mob_Data order) and matters: the per-round loops iterate it and _getRival picks the LAST enemy with modifier > 1 in this order, else the largest stack. Stats in input are effective values from the real troop classes with every research at the given level. remaining counts are (int) casts of float totals; per-round counts may be fractional-free floats (emitted as ints).',
    'cases' => $cases);

// ------------------------------------------------ 10. loot ----------------
/**
 * loot_target (CORRECTED spec rule), integer & deterministic:
 *   rem[r] = unprotected[r]; loot[r] = 0; cap = capacity
 *   loop:
 *     active = {r : rem[r] > 0}; if cap <= 0 or active empty -> stop
 *     T = sum(rem[active]); if cap >= T -> loot += rem (take everything), stop
 *     q[r] = floor(cap*rem[r]/T), f[r] = (cap*rem[r]) mod T      (largest-remainder apportionment)
 *     leftover = cap - sum(q); give +1 to the `leftover` active resources with the largest f
 *       (ties: fixed order weapons, ammunition, dollar, alcohol)
 *     clamp each share to rem[r]; any clamped excess goes back into cap and the loop repeats
 */
function lootTarget($cap, array $unprot) {
    $loot = array_fill_keys(array_keys($unprot), 0);
    $rem = $unprot;
    $order = array_keys($unprot);
    while ($cap > 0) {
        $active = array_filter($order, function ($r) use ($rem) { return $rem[$r] > 0; });
        if (!$active) break;
        $T = 0; foreach ($active as $r) $T += $rem[$r];
        if ($cap >= $T) { foreach ($active as $r) { $loot[$r] += $rem[$r]; $rem[$r] = 0; } $cap -= $T; break; }
        $share = array(); $frac = array(); $given = 0;
        foreach ($active as $r) { $share[$r] = intdiv($cap * $rem[$r], $T); $frac[$r] = ($cap * $rem[$r]) % $T; $given += $share[$r]; }
        $left = $cap - $given;
        $idx = array_flip($order);
        $sorted = array_values($active);
        usort($sorted, function ($a, $b) use ($frac, $idx) { return $frac[$b] <=> $frac[$a] ?: $idx[$a] <=> $idx[$b]; });
        for ($i = 0; $i < $left; $i++) $share[$sorted[$i % count($sorted)]]++;
        $newCap = 0;
        foreach ($active as $r) {
            $take = min($share[$r], $rem[$r]);
            $newCap += $share[$r] - $take;
            $loot[$r] += $take; $rem[$r] -= $take;
        }
        if ($newCap == $cap) break;
        $cap = $newCap;
    }
    return $loot;
}

$lootCases = array(
    array('capacity < total unprotected', array('maton' => 10), array(), 0,
        array('arm' => 5000, 'mun' => 5000, 'dol' => 5000, 'alc' => 5000), array()),
    array('capacity > total unprotected', array('transportista' => 10), array(), 0,
        array('arm' => 3000, 'mun' => 2000, 'dol' => 1500, 'alc' => 1200), array()),
    array('one resource scarce', array('maton' => 50), array(), 0,
        array('arm' => 100000, 'mun' => 1100, 'dol' => 50000, 'alc' => 0), array()),
    array('zero unprotected (all under safe amount)', array('transportista' => 5), array(), 0,
        array('arm' => 15000, 'mun' => 900, 'dol' => 1000, 'alc' => 2000), array('almacenArm' => 1, 'almacenAlc' => 1)),
    array('rounding pushes legacy loot above capacity', array('espia' => 1), array(), 0,
        array('arm' => 1100, 'mun' => 1100, 'dol' => 1100, 'alc' => 0), array()),
    array('smuggling research scales capacity; storage protects', array('porteador' => 3, 'maton' => 7), array(), 4,
        array('arm' => 400000, 'mun' => 90000, 'dol' => 250000, 'alc' => 30000), array('almacenArm' => 2, 'deposito' => 1, 'caja' => 1)),
    array('defender survives -> no loot', array('maton' => 10), array('ilegal' => 1000), 0,
        array('arm' => 50000, 'mun' => 50000, 'dol' => 50000, 'alc' => 50000), array()),
);
foreach ($lootCases as &$lc) { $lc[1] = trKeys($lc[1], 'trp'); $lc[2] = trKeys($lc[2], 'trp'); $lc[5] = trKeys($lc[5], 'hab'); }
unset($lc);
$cases = array();
/** Real getRobo() is inherited untouched; only the DB-bound ctor/dtor are disabled. */
class LootProbe extends Mob_Combat_Manager { public function __construct() {} public function __destruct() {} }
foreach ($lootCases as $lc) {
    list($tb) = buildBattle($lc[1], $lc[2], 0, 0);
    $research = allResearch(0); $research[Mob_Server::getNameHabCapCarga()] = $lc[3];
    $edA = new TestEdificio(array(), $research);
    $combat = new Mob_Combat_Modificadores($tb);
    $edD = new TestEdificio($lc[5], array(), array('recursos_arm' => $lc[4]['arm'], 'recursos_mun' => $lc[4]['mun'],
        'recursos_dol' => $lc[4]['dol'], 'recursos_alc' => $lc[4]['alc']));
    $jugD = (new ReflectionClass('Mob_Jugador'))->newInstanceWithoutConstructor();
    $p = new ReflectionProperty('Mob_Jugador', '_edificio'); $p->setAccessible(true); $p->setValue($jugD, $edD);
    $mgr = new LootProbe();
    foreach (array('_combat' => $combat, '_edificioAtacante' => $edA, '_jugadorDefensor' => $jugD) as $k => $v) {
        $p = new ReflectionProperty('Mob_Combat_Manager', $k); $p->setAccessible(true); $p->setValue($mgr, $v);
    }
    // capacity exactly as getRobo computes it (Combat/Manager.php:161-163)
    $capacity = 0;
    foreach ($combat->getTropasRestantes('atacante') as $t => $n) $capacity += $n * $edA->getTropa($t)->getCapacidad();
    $unprot = $edD->getRecursosDesprotegidos();
    $robo = $mgr->getRobo(); // REAL legacy method
    $defSurvived = $combat->getTropasRestantes('defensor') != array();
    $target = $defSurvived ? array_fill_keys(array_keys($unprot), 0) : lootTarget((int)$capacity, array_map('intval', $unprot));
    $storage = array(); foreach (array(1, 2, 3, 4) as $i) { $h = Mob_Server::getDeposito($i); $storage[$GLOBALS['BLD'][$h]] = isset($lc[5][$h]) ? $lc[5][$h] : 0; }
    $roboOrd = array(); foreach (array_keys($unprot) as $r) $roboOrd[$r] = num($robo[$r]);
    $cases[] = array('label' => $lc[0],
        'attacker_survivors' => remaining($combat->getTropasRestantes('atacante')),
        'attacker_' . $RSH[Mob_Server::getNameHabCapCarga()] . '_level' => $lc[3],
        'defender_troops' => remaining($lc[2]),
        'defender_survivors' => remaining($combat->getTropasRestantes('defensor')),
        'defender_stock' => mapKeys($lc[4], $RES),
        'defender_storage_levels' => $storage,
        'capacity' => num($capacity),
        'unprotected' => mapKeys(array_map('num', $unprot), $RES),
        'loot_legacy' => mapKeys($roboOrd, $RES),
        'loot_legacy_total' => num(array_sum($roboOrd)),
        'loot_target' => mapKeys($target, $RES),
        'loot_target_total' => array_sum($target));
}
$out['loot'] = array(
    '_source' => 'loot_legacy: REAL Mob_Combat_Manager::getRobo (library/Mob/Combat/Manager.php:152-191) invoked via reflection on a real Mob_Edificio (getRecursosDesprotegidos, Edificio.php:427-434) and a real Mob_Combat_Modificadores result',
    '_legacy_formula' => 'if defender has survivors -> 0. else for each r: loot[r] = min(round(unprot[r]*100/total*capacity/100), unprot[r]). The overflow redistribution code in getRobo is dead: $robo is overwritten by round($porcentaje*$capacidad/100) right after.',
    '_target_algorithm' => 'see lootTarget() in scripts/generate_test_vectors.php: iterative largest-remainder apportionment of capacity proportional to remaining unprotected stock, clamped per resource, clamped excess re-distributed until capacity or stock is exhausted; ties broken by order ' . implode(', ', $RES) . '. Never exceeds capacity; equals total unprotected when capacity >= total.',
    'cases' => $cases);

// --------------------------------------------------------- YAML writer ----
function yScalar($v) {
    if ($v === null) return 'null';
    if (is_bool($v)) return $v ? 'true' : 'false';
    if (is_int($v)) return (string)$v;
    if (is_float($v)) {
        if (is_nan($v)) return '.nan';
        if (is_infinite($v)) return $v > 0 ? '.inf' : '-.inf';
        if ($v == floor($v) && abs($v) < 1e15) return sprintf('%.0f', $v) === '-0' ? '0' : sprintf('%.0f', $v);
        $s = var_export($v, true);
        if (stripos($s, 'e') !== false && strpos($s, '.') === false) $s = preg_replace('/e/i', '.0e', $s, 1);
        return $s;
    }
    return json_encode((string)$v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
function yKey($k) {
    $k = (string)$k;
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k) && !preg_match('/^(y|n|yes|no|on|off|true|false|null)$/i', $k)) return $k;
    return json_encode($k);
}
function isList($a) { return is_array($a) && ($a === array() || array_keys($a) === range(0, count($a) - 1)); }
function isScalarList($a) { foreach ($a as $v) if (is_array($v) || is_object($v)) return false; return true; }
function yEmit($v, $ind = 0) {
    $pad = str_repeat('  ', $ind); $s = '';
    if (is_object($v)) $v = (array)$v;
    if (isList($v)) {
        foreach ($v as $item) {
            if (is_object($item)) $item = (array)$item;
            if (is_array($item) && !isList($item) && $item) {
                $lines = explode("\n", rtrim(yEmit($item, $ind + 1), "\n"));
                $lines[0] = $pad . '- ' . ltrim($lines[0]);
                $s .= implode("\n", $lines) . "\n";
            } elseif (is_array($item)) {
                $s .= $pad . '- ' . yInline($item) . "\n";
            } else $s .= $pad . '- ' . yScalar($item) . "\n";
        }
        return $s;
    }
    foreach ($v as $k => $item) {
        if (is_object($item) && !(array)$item) { $s .= $pad . yKey($k) . ": {}\n"; continue; }
        if (is_object($item)) $item = (array)$item;
        if (is_array($item)) {
            if ($item === array()) $s .= $pad . yKey($k) . ": " . (isList($item) && !is_object($item) ? '[]' : '{}') . "\n";
            elseif (isList($item) && isScalarList($item)) $s .= $pad . yKey($k) . ': ' . yInline($item) . "\n";
            elseif (!isList($item) && isScalarList($item) && count($item) <= 6) $s .= $pad . yKey($k) . ': ' . yInline($item) . "\n";
            else $s .= $pad . yKey($k) . ":\n" . yEmit($item, $ind + 1);
        } else $s .= $pad . yKey($k) . ': ' . yScalar($item) . "\n";
    }
    return $s;
}
function yInline($a) {
    if (isList($a)) return '[' . implode(', ', array_map(function ($x) { return is_array($x) || is_object($x) ? yInline((array)$x) : yScalar($x); }, $a)) . ']';
    $p = array(); foreach ($a as $k => $x) $p[] = yKey($k) . ': ' . (is_array($x) || is_object($x) ? yInline((array)$x) : yScalar($x));
    return '{' . implode(', ', $p) . '}';
}

$header = $GAME == 'space4k' ? <<<TXT
# =============================================================================
# Space4k legacy TEST VECTORS
# Generated by scripts/generate_test_vectors.php space4k (PHP 7.4 CLI). DO NOT EDIT.
#
# Provenance: every "expected" value below is LEGACY BEHAVIOUR produced by the
# ORIGINAL PHP code in library/Mob/ (Space4k game type, GAME_TYPE=space4k,
# server "s1", combat system = Modificadores per application.ini
# games.space4k.s1.combatSystemType), executed with only the DB/front-controller
# layer stubbed. Formulas that live in forms/plugins are copied verbatim into
# the generator with a file:line citation. Bugs and quirks are preserved on
# purpose; where the spec adopts a corrected rule it is reported in a separate
# field (loot.cases[].loot_target).
#
# Space4k specifics:
#   - Troop defense is NOT multiplied by 10 (Mob_Tropa_Abstract::__construct
#     applies x10 only for the vendetta game type).
#   - Scenarios (combat armies, loot cases, production level combos, storage
#     rooms, transitions) are POSITIONAL translations of the Vendetta scenarios:
#     the entity at index i of Mob_Data::get{Habitaciones,Entrenamientos,
#     Tropas}Vendetta() is replaced by index i of the Space4k list. Labels are
#     kept from Vendetta, so absolute values differ from test_vectors.yaml and
#     some labels (e.g. matchup counters) may not hold for Space4k stats.
#
# Conventions:
#   - IDs are English spec IDs (scripts/space4k_id_map.py); resources:
#     arm->iron, mun->lutinum, dol->hydrogen, alc->water.
#   - Numbers: integral floats are emitted as integers; non-integral floats use
#     PHP's shortest round-trip representation (serialize_precision=-1).
#   - Legacy speed multiplier: building/research times are divided by 3
#     (round(x/3)); troop training time is NOT.
#   - Cost maps omit water (alc column; no entity costs it).
# =============================================================================

TXT
: <<<TXT
# =============================================================================
# Vendetta legacy TEST VECTORS
# Generated by scripts/generate_test_vectors.php (PHP 7.4 CLI). DO NOT EDIT.
#
# Provenance: every "expected" value below is LEGACY BEHAVIOUR produced by the
# ORIGINAL PHP code in library/Mob/ (Vendetta game type, server "s1 mods",
# combat system = Modificadores), executed with only the DB/front-controller
# layer stubbed. Formulas that live in forms/plugins are copied verbatim into
# the generator with a file:line citation. Bugs and quirks are preserved on
# purpose; where the spec adopts a corrected rule it is reported in a separate
# field (loot.cases[].loot_target).
#
# Conventions:
#   - IDs are English spec IDs (scripts/vendetta_id_map.py).
#   - Numbers: integral floats are emitted as integers; non-integral floats use
#     PHP's shortest round-trip representation (serialize_precision=-1).
#   - Legacy speed multiplier: building/research times are divided by 3
#     (round(x/3)); troop training time is NOT.
#   - Cost maps omit alcohol (no entity costs alcohol).
# =============================================================================

TXT;

$yaml = $header . yEmit($out);
$dest = $ROOT . '/docs/spec/data/' . ($GAME == 'space4k' ? 'test_vectors_space4k.yaml' : 'test_vectors.yaml');
file_put_contents($dest, $yaml);
$counts = array();
foreach ($out as $k => $v) $counts[] = "$k=" . count($v['cases']);
fwrite(STDERR, "wrote $dest (" . implode(', ', $counts) . ")\n");
