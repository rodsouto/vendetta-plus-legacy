<?php
/**
 * Combat oracle: runs the REAL legacy Mob_Combat_Modificadores on battles read as JSON from stdin.
 *
 * Usage: php scripts/combat_oracle.php [vendetta|space4k] < battles.json > results.json
 *
 * Input:  [{"order": [legacy troop ids], "troops": {legacy_id: {"a": {"total","ataque","defensa"},
 *           "d": {...}}}, "pctA": int, "pctD": int}, ...]
 * Output: [{"data": getData(), "rest_a": getTropasRestantes("atacante"),
 *           "rest_d": getTropasRestantes("defensor")}, ...]
 *
 * Used by scripts/generate_target_vectors.py to fuzz-check scripts/combat_reference.py (legacy mode).
 * Stats are passed in already computed; only matchup modifiers are read from the troop classes.
 */

error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING & ~E_STRICT);
ini_set('display_errors', 'stderr');
ini_set('serialize_precision', '-1');

$ROOT = dirname(__DIR__);
define('APPLICATION_PATH', $ROOT . '/application');
set_include_path($ROOT . '/library' . PATH_SEPARATOR . get_include_path());
$GAME = isset($argv[1]) ? strtolower($argv[1]) : 'vendetta';
$GDIR = ucfirst($GAME);
putenv("GAME_TYPE=$GAME");
putenv('GAME_SERVER_NAME=s1');

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

require_once 'Zend/Registry.php';
$mob = $ROOT . '/library/Mob';
require_once "$mob/Server.php";
require_once "$mob/Loader.php";
require_once "$mob/Data.php";
require_once "$mob/Tropa/Abstract.php";
require_once "$mob/Tropa/Ataque.php";
require_once "$mob/Tropa/Defensa.php";
foreach (glob("$mob/Tropa/$GDIR/*/*.php") as $f) require_once $f;
require_once "$mob/Combat/Abstract.php";
require_once "$mob/Combat/Modificadores.php";

if (!Mob_Server::esDeModificadores() || Mob_Server::getGameType() != $GAME) {
    fwrite(STDERR, "Stub setup failed: server is not $GAME/Modificadores\n");
    exit(1);
}

$battles = json_decode(stream_get_contents(STDIN), true);
$out = array();
foreach ($battles as $b) {
    $tb = array();
    foreach ($b['order'] as $t) $tb[$t] = $b['troops'][$t];   // insertion order = iteration order
    $combat = new Mob_Combat_Modificadores($tb, array('pctPoderA' => $b['pctA'], 'pctPoderD' => $b['pctD']));
    $out[] = array(
        'data' => $combat->getData(),
        'rest_a' => (object)$combat->getTropasRestantes('atacante'),
        'rest_d' => (object)$combat->getTropasRestantes('defensor'),
    );
}
echo json_encode($out);
