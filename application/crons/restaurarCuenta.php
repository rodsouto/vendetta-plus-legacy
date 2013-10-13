#!/usr/bin/php
<?php

include "base.php";

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$idUsuario = 1873;

function armarInsert($tabla, $data) {
  $sql = "INSERT INTO $tabla (%s) VALUES (%s);\n";
  $campos = $values = array();
  foreach ($data as $k => $v) {
    $campos[] = $k;
    $values[] = "'".addslashes($v)."'";
  }
  return sprintf($sql, implode(", ", $campos), implode(", ", $values));
}

// usuarios
$query = $db->select()->from("mob_usuarios")->where("id_usuario = ?", $idUsuario)->limit(1); 
$data = $db->fetchAll($query);
echo armarInsert("mob_usuarios", $data[0]);

$control = array();
$control[] = "SELECT COUNT(*) FROM mob_usuarios WHERE id_usuario = $idUsuario;";

// entrenamientos
$query = $db->select()->from("mob_entrenamientos")->where("id_usuario = ?", $idUsuario)->limit(1);
$data = $db->fetchAll($query);
echo armarInsert("mob_entrenamientos", $data[0]);
$control[] = "SELECT COUNT(*) FROM mob_entrenamientos WHERE id_entrenamiento = ".$data[0]["id_entrenamiento"].";";
// edificios
$query = $db->select()->from("mob_edificios")->where("id_usuario = ?", $idUsuario);
$ids = array("edificios" => array(), "coordenadas" => array(), "tropas" => array(), "habitaciones" => array());
foreach ($db->fetchAll($query) as $d) {
  echo armarInsert("mob_edificios", $d);
  $ids["edificios"][] = $d["id_edificio"];
  $ids["coordenadas"][] = "(coord1 = ".$d["coord1"]." AND coord2 = ".$d["coord2"]." AND coord3 = ".$d["coord3"].")";
  // habitaciones
  $queryHab = $db->select()->from("mob_habitaciones")->where("id_edificio = ?", $d["id_edificio"])->limit(1);
  $dataHab = $db->fetchAll($queryHab);
  echo armarInsert("mob_habitaciones", $dataHab[0]);
  $ids["habitaciones"][] = $dataHab[0]["id_habitacion"];
  // tropas
  $queryTro = $db->select()->from("mob_tropas")->where("id_edificio = ?", $d["id_edificio"])->limit(1);
  $dataTro = $db->fetchAll($queryTro);
  //echo armarInsert("mob_tropas", $dataTro[0]);
  $ids["tropas"][] = $dataTro[0]["id_tropa"];
}

$control[] = "SELECT COUNT(*) FROM mob_edificios WHERE id_edificio IN (".implode(", ", $ids["edificios"]).");";
$control[] = "SELECT COUNT(*) FROM mob_tropas WHERE id_tropa IN (".implode(", ", $ids["tropas"]).");";
$control[] = "SELECT COUNT(*) FROM mob_habitaciones WHERE id_habitacion IN (".implode(", ", $ids["habitaciones"]).");";
$control[] = "SELECT COUNT(*) FROM mob_edificios WHERE (".implode(" OR ", $ids["coordenadas"]).");";

//echo implode($control, "\n");   

