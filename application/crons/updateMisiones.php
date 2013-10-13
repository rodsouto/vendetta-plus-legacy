#!/usr/bin/php
<?php

include "base.php";
                  
ini_set("memory_limit","600M");
 error_reporting(E_ALL);ini_set("display_errors", true);
$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$count = 500;

$plugin = new Mob_Controller_Plugin_Update; 

$page = 1;
$query = $db->select()->from("mob_misiones", array("id_usuario"))->order("id_usuario")->group("id_usuario")->where("fecha_fin < ?", date("Y-m-d H:i:s", strtotime("-5 minutes")))->limitPage($page, $count);
echo $query;echo "\n\n";
while(($data = $db->fetchAll($query)) != array()) {
  foreach ($data as $user) {
    echo $user["id_usuario"]."\n";
    $plugin->actualizarMisiones($user["id_usuario"]);
  }  
  $page = $page+1;
  $query->limitPage($page, $count);
}

$page = 1;
$query = $db->select()->from("mob_habitaciones_nuevas", array("id_usuario"))->order("id_usuario")->group("id_usuario")->where("fecha_fin < ?", date("Y-m-d H:i:s", strtotime("-5 minutes")))->limitPage($page, $count);
echo $query;echo "\n\n";
while(($data = $db->fetchAll($query)) != array()) {
  foreach ($data as $user) {
    echo $user["id_usuario"]."\n";
    $plugin->actualizarHabitaciones($user["id_usuario"]);
  }  
  $page = $page+1;
  $query->limitPage($page, $count);
}

$page = 1;
$query = $db->select()->from("mob_tropas_nuevas", array("id_usuario"))->order("id_usuario")->group("id_usuario")->where("fecha_fin < ?", date("Y-m-d H:i:s", strtotime("-5 minutes")))->limitPage($page, $count);
echo $query;echo "\n\n";
while(($data = $db->fetchAll($query)) != array()) {
  foreach ($data as $user) {
    echo $user["id_usuario"]."\n";
    $plugin->actualizarTropas($user["id_usuario"]);
  }  
  $page = $page+1;
  $query->limitPage($page, $count);
}

echo "\n\nfin\n\n";