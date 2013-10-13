<?php

class Mob_Server {
  
  public static function getDomain() {
    $host = str_replace("www.", "", $_SERVER["HTTP_HOST"]);
    return self::isSubDomain() ? end(explode(".", $host, 2)) : $host;
  }
  
  public static function isSubDomain() {
    return getenv("GAME_SERVER_NAME") != false;
  }
  
  public static function getSubDomain() {
    return self::isSubDomain() ? getenv("GAME_SERVER_NAME") : null;
  }
  
  public static function getStaticUrl() {
    return self::getSubDomain() == "test" ? "http://static.test.".self::getDomain()."/" : "http://static.".self::getDomain()."/";
  }

  public static function getServers() {
    $servers = array(
        "vendetta" => array("old" => "Old", "s1" => "s1 mods", "test" => "Test"),
        "space4k" => array("s1" => "s1")
    );
    
    if (self::getSubDomain() == "test") {
        unset($servers[self::getGameType()]["test"]);
    }
    
    return $servers[self::getGameType()];
  }
  
  public static function isGameServer() {
    return array_key_exists(self::getSubDomain(), self::getServers());
  }
  
  public static function getGameType() {
    return getenv("GAME_TYPE");  
  }
  
  public static function getDeposito($number) {
    $depositos = array(
                "vendetta" => array(1 => "almacenArm", 2 => "deposito", 3 => "caja", 4 => "almacenAlc"),
                "space4k" => array(1 => "almacenHierro", 2 => "depositoLutino", 3 => "tanqueHidrogeno", 4 => "tanqueAgua")
                );
    return $depositos[self::getGameType()][$number];  
  }
  
  public static function getHabRecurso($number) {
    return Mob_Loader::getHabitacion(self::getNameHabRecurso($number));
  }
  
  public static function getNameHabRecurso($number) {
    $recursos = array(
                "vendetta" => array(1 => "armeria", 2 => "municion", 3 => "taberna", 4 => "contrabando", 5 => "cerveceria"),
                "space4k" => array(1 => "minaHierro", 2 => "refineriaLutino", 3 => "plQuimica", 4 => "plQuimicaMejorada", 5 => "plataformaPerforacion")
                );
    return $recursos[self::getGameType()][$number];
  }  
  
  public static function getImgRecurso($number) {
    $recursos = array(
                "vendetta" => array(1 => "arm.png", 2 => "mun.png", 3 => "dol.png", 4 => "alc.png"),
                "space4k" => array(1 => "hierro.png", 2 => "lutino.png", 3 => "hidro.png", 4 => "agua.png")
                );
    return self::getStaticUrl()."img/".$recursos[self::getGameType()][$number];  
  }
  
  public static function getNameHabTiempo() {
    $habsTiempo = array(
                "vendetta" => "oficina",
                "space4k" => "centroOperaciones"
                );
    return $habsTiempo[self::getGameType()];    
  }
  
  public static function getNameHabAtaque() {
    $habsAtaque = array(
                "vendetta" => "campo",
                "space4k" => "hangar"
                );
    return $habsAtaque[self::getGameType()];    
  }
  
  public static function getNameTrpOcupacion() {
    $trpOcupacion = array(
                "vendetta" => "ocupacion",
                "space4k" => "colonizador"
                );
    return $trpOcupacion[self::getGameType()];    
  }
  
public static function getNameTrpEspia() {
    $trpOcupacion = array(
                "vendetta" => "espia",
                "space4k" => "sondaEspionaje"
                );
    return $trpOcupacion[self::getGameType()];    
  }    
  
  public static function getNameHabDefensa() {
    $habsDefensa = array(
                "vendetta" => "seguridad",
                "space4k" => "estacionDefensa"
                );
    return $habsDefensa[self::getGameType()];    
  }
  
  public static function getNameHabTiempoEnt() {
    $habsTiempo = array(
                "vendetta" => "escuela",
                "space4k" => "centroInvestigacion"
                );
    return $habsTiempo[self::getGameType()];  
  }
  
  public static function getGameName() {
    return ucwords(self::getGameType())." Plus";
  }
  
  public static function getIdiomas() {
    $config = Zend_Controller_Front::getInstance()->getParam('bootstrap')->getOptions();
    return $config["games"][self::getGameType()]["idiomas"]; 
  }
  
  public static function getFacebookPage() {
    $config = Zend_Controller_Front::getInstance()->getParam('bootstrap')->getOptions();
    return $config["games"][self::getGameType()]["facebook_page"];  
  }
  
  public static function getTwitterUrl() {
    $config = Zend_Controller_Front::getInstance()->getParam('bootstrap')->getOptions();
    $config = $config["games"][self::getGameType()];
    return isset($config["twitter"]) ? $config["twitter"] : null;  
  }
  
  public static function getNameHabCapCarga() {
    $habsCarga = array(
                "vendetta" => "contrabando",
                "space4k" => "capCargaMejorada"
                );
    return $habsCarga[self::getGameType()];  
  }
  
  public static function getNameEntPoderAtaque() {
    $entPoderAtaque = array(
                "vendetta" => "honor",
                "space4k" => "diplomacia"
                );
    return $entPoderAtaque[self::getGameType()];  
  }
  
  public static function getCombatSystemType() {
    $config = Zend_Controller_Front::getInstance()->getParam('bootstrap')->getOptions();
    return $config["games"][self::getGameType()][self::getSubDomain()]["combatSystemType"];    
  }
  
  public static function esDeModificadores() {
    return self::getCombatSystemType() == "Modificadores";    
  }  
  
  public static function getCombatSystemClass() {
    $config = Zend_Controller_Front::getInstance()->getParam('bootstrap')->getOptions();
    return "Mob_Combat_".$config["games"][self::getGameType()][self::getSubDomain()]["combatSystemType"];    
  }
  
  public static function isCron() {
    return (isset($_GET["cron"]) || (isset($_SERVER['argv'][1]) && $_SERVER['argv'][1] != "cron"));
  }      
}