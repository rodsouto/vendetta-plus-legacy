<?php

if (!function_exists("lcfirst")) {
    function lcfirst($string) {
        $string[0] = strtolower($string[0]);
        return $string;
    }
}

if (getenv("GAME_TYPE") === false) putenv("GAME_TYPE=vendetta");

// Define path to application directory
defined('APPLICATION_PATH')
    || define('APPLICATION_PATH',
              realpath(getenv("GAME_SERVER_NAME") == "test" ? dirname(__FILE__) . '/'.getenv("GAME_TYPE").'_test/application': dirname(__FILE__) . '/application'));

// Define application environment
defined('APPLICATION_ENV') || define('APPLICATION_ENV', getenv("APPLICATION_ENV") ? getenv("APPLICATION_ENV") : "production");

$rootPath = dirname(__FILE__);
 
if (getenv("GAME_SERVER_NAME") == "test") {
  set_include_path($rootPath . '/'.getenv("GAME_TYPE").'_test/application/models' . PATH_SEPARATOR . $rootPath . '/'.getenv("GAME_TYPE").'_test/library');
} else {
  set_include_path($rootPath . '/application/models' . PATH_SEPARATOR . $rootPath . '/library');
}

require_once 'Mob/Server.php';

$publicPath = Mob_Server::isGameServer() ? Mob_Server::getGameType()."_".Mob_Server::getSubDomain() : "public_html";
if (getenv("GAME_SERVER_NAME") == "test") $publicPath = "vendetta_test";
                            
defined('PUBLIC_PATH')
    || define('PUBLIC_PATH',
              realpath(dirname(__FILE__) . '/'.$publicPath));

/** Zend_Application */
require_once 'Zend/Application.php';

require_once 'Zend/Config/Ini.php';

$config = new Zend_Config_Ini(APPLICATION_PATH . '/configs/application.ini');
$config = $config->toArray();

$gameConfig = $config["game"];
$config = $config[APPLICATION_ENV];
if (!Mob_Server::isCron()) $config = array_merge_recursive($config, $gameConfig);

$servers = Mob_Server::getServers();
unset($servers["test"]);
$dbName = getenv("GAME_SERVER_NAME") != false ? getenv("GAME_SERVER_NAME") : array_rand($servers);

$config["resources"]["db"]["params"]["dbname"] = getenv("GAME_TYPE")."_plus_".$dbName;

if (isset($_GET["ver_db"])) {
  var_dump($config["resources"]["db"]["params"]["dbname"]);  
}

if (APPLICATION_ENV == "production") {
  $config["resources"]["db"]["params"]["username"] = getenv("GAME_TYPE");
}

// Create application, bootstrap, and run
$application = new Zend_Application(
    APPLICATION_ENV,
    $config
);

$application->bootstrap();

$application->run();