<?php

include "base.php";
echo "\n";

error_reporting(E_ALL);
ini_set("display_errors", true);

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$page = 1;
$count = 1000;

$nf = new Mob_View_Helper_NumberFormat;

$query = $db->select()->from("mob_habitaciones")->limitPage($page, $count);
if (isset($argv[1])) $query->where("id_usuario = ".$argv[1]);

$deposito = new Mob_Habitacion_Deposito;
$almacenArm = new Mob_Habitacion_AlmacenArm;
$caja = new Mob_Habitacion_Caja;

$habitaciones = array();
foreach (Mob_Data::getHabitaciones() as $h) {
  $habitaciones[] = lcfirst($h);
}

$usuariosSospechosos = array();

$maximoAlmacenamiento = array();

$updates = array();

echo "HABITACIONES________________________________________\n";
    error_reporting(E_ALL);

$porcentajeDescuento = isset($argv[2]) ? $argv[2]/100 : 20/100;

$descuentoGeneral = isset($argv[3]);    
    
while (($data = $db->fetchAll($query)) != array()) {

   foreach ($data as $d) {
    $deposito->setNivel($d["deposito"]);
    $almacenArm->setNivel($d["almacenArm"]);
    $caja->setNivel($d["caja"]);
     
    $mun = $deposito->getAlmacenamiento();
    $arm = $almacenArm->getAlmacenamiento();
    $dol = $caja->getAlmacenamiento();
    
    if (isset($maximoAlmacenamiento[$d["id_usuario"]]["dol"]) && $dol > $maximoAlmacenamiento[$d["id_usuario"]]["dol"]) $maximoAlmacenamiento[$d["id_usuario"]] = array("arm" => $arm, "mun" => $mun, "dol" => $dol); 
     
    foreach ($habitaciones as $h) {

      $hab = Mob_Loader::getHabitacion($h)->setNivel($d[$h]-1);
      
      if (!isset($maximoAlmacenamiento[$d["id_usuario"]])) {
        $maximoAlmacenamiento[$d["id_usuario"]] = array("arm" => $arm, "mun" => $mun, "dol" => $dol);
      }      
      
      $usuario = Mob_Loader::getModel("Usuarios")->getUsuario($d["id_usuario"]);
      
      if ($descuentoGeneral) {
        $updates[] = "UPDATE mob_habitaciones SET ".$hab->getNombreBdd()." = ".ceil($hab->getNivel()-$hab->getNivel()*$porcentajeDescuento)." WHERE id_habitacion = ".$d["id_habitacion"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";
        continue;      
      }
      
      if ($hab->getCosto("arm") > $arm || $hab->getCosto("mun") > $mun || $hab->getCosto("dol") > $dol) {
        $usuariosSospechosos[$d["id_usuario"]] = 1;
        echo "$usuario ".$d["id_edificio"].": $h en ".$d[$h]." cuesta ";
        if ($hab->getCosto("arm") > $arm) {
          echo $nf->numberFormat($hab->getCosto("arm")). " de armas y puede almacenar ".$nf->numberFormat($arm)." (+".number_format(($hab->getCosto("arm")-$arm)/150000, 2).") ";
          while($hab->getCosto("arm") > $almacenArm->getAlmacenamiento()) {
            $hab->setNivel($hab->getNivel()-1);  
          }
          $updates[] = "UPDATE mob_habitaciones SET ".$hab->getNombreBdd()." = ".ceil($hab->getNivel()-$hab->getNivel()*$porcentajeDescuento)." WHERE id_habitacion = ".$d["id_habitacion"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";
          echo " necesitaria ".$hab->getNombre()." al nivel ".$hab->getNivel();
        }
        if ($hab->getCosto("mun") > $mun) {
          echo $nf->numberFormat($hab->getCosto("mun")). " de municion y puede almacenar ".$nf->numberFormat($mun)." (+".number_format(($hab->getCosto("mun")-$mun)/150000, 2).") ";
          while($hab->getCosto("mun") > $deposito->getAlmacenamiento()) {
            $hab->setNivel($hab->getNivel()-1);  
          }
          $updates[] = "UPDATE mob_habitaciones SET ".$hab->getNombreBdd()." = ".ceil($hab->getNivel()-$hab->getNivel()*$porcentajeDescuento)." WHERE id_habitacion = ".$d["id_habitacion"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";
          echo " necesitaria ".$hab->getNombre()." al nivel ".$hab->getNivel();
        }
        if ($hab->getCosto("dol") > $dol) {
          echo $nf->numberFormat($hab->getCosto("dol")). " de dolares y puede almacenar ".$nf->numberFormat($dol)." (+".number_format(($hab->getCosto("dol")-$dol)/150000, 2).") ";
          while($hab->getCosto("dol") > $caja->getAlmacenamiento()) {
            $hab->setNivel($hab->getNivel()-1);  
          }
          $updates[] = "UPDATE mob_habitaciones SET ".$hab->getNombreBdd()." = ".ceil($hab->getNivel()-$hab->getNivel()*$porcentajeDescuento)." WHERE id_habitacion = ".$d["id_habitacion"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";          
          echo " necesitaria ".$hab->getNombre()." al nivel ".$hab->getNivel();        
        }        
        echo "\n";
      }
    }
  }
  //break;
  unset($data);
  $page = $page+1;
  $query->limitPage($page, $count);
}

echo "Entrenamientos________________________________________\n";

$query = $db->select()->from("mob_entrenamientos");
if (isset($argv[1])) $query->where("id_usuario = ".$argv[1]);
foreach ($db->fetchAll($query) as $d) {

    if (!isset($maximoAlmacenamiento[$d["id_usuario"]])) {
      echo "No existen habitaciones de ".$d["id_usuario"]."+++++++++++++++++++++\n";
      continue;
    }

    $usuario = Mob_Loader::getModel("Usuarios")->getUsuario($d["id_usuario"]);
    $arm = $maximoAlmacenamiento[$d["id_usuario"]]["arm"];
    $mun = $maximoAlmacenamiento[$d["id_usuario"]]["mun"];
    $dol = $maximoAlmacenamiento[$d["id_usuario"]]["dol"];  
  
  foreach (Mob_Data::getEntrenamientos() as $e) {
    $e = lcfirst($e);
    $ent = Mob_Loader::getEntrenamiento($e)->setNivel($d[$e]-1);

    if ($descuentoGeneral) {
      $updates[] = "UPDATE mob_entrenamientos SET ".$ent->getNombreBdd()." = ".ceil($ent->getNivel()-$ent->getNivel()*$porcentajeDescuento)." WHERE id_entrenamiento = ".$d["id_entrenamiento"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";
      continue;      
    }    
    
    if ($ent->getCosto("arm") > $arm || $ent->getCosto("mun") > $mun || $ent->getCosto("dol") > $dol) {
      $usuariosSospechosos[$d["id_usuario"]] = 1;
      
      echo "$usuario: $e en ".$d[$e]." cuesta ";
      if ($ent->getCosto("arm") > $arm) {
        echo $nf->numberFormat($ent->getCosto("arm")). " de armas y puede almacenar ".$nf->numberFormat($arm)." (+".number_format(($ent->getCosto("arm")-$arm)/150000, 2).") ";
        while($ent->getCosto("arm") > $maximoAlmacenamiento[$d["id_usuario"]]["arm"]) {
            $ent->setNivel($ent->getNivel()-1);  
        }
        $updates[] = "UPDATE mob_entrenamientos SET ".$ent->getNombreBdd()." = ".ceil($ent->getNivel()-$ent->getNivel()*$porcentajeDescuento)." WHERE id_entrenamiento = ".$d["id_entrenamiento"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";          
        echo " necesitaria ".$ent->getNombre()." al nivel ".$ent->getNivel(); 
      }
      if ($ent->getCosto("mun") > $mun) {
        echo $nf->numberFormat($ent->getCosto("mun")). " de municion y puede almacenar ".$nf->numberFormat($mun)." (+".number_format(($ent->getCosto("mun")-$mun)/150000, 2).") ";
        while($ent->getCosto("mun") > $maximoAlmacenamiento[$d["id_usuario"]]["mun"]) {
            $ent->setNivel($ent->getNivel()-1);  
        }
        $updates[] = "UPDATE mob_entrenamientos SET ".$ent->getNombreBdd()." = ".ceil($ent->getNivel()-$ent->getNivel()*$porcentajeDescuento)." WHERE id_entrenamiento = ".$d["id_entrenamiento"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";          
        echo " necesitaria ".$ent->getNombre()." al nivel ".$ent->getNivel();
      }
      if ($ent->getCosto("dol") > $dol) {
        echo $nf->numberFormat($ent->getCosto("dol")). " de dolares y puede almacenar ".$nf->numberFormat($dol)." (+".number_format(($ent->getCosto("dol")-$dol)/150000, 2).") ";
        while($ent->getCosto("dol") > $maximoAlmacenamiento[$d["id_usuario"]]["dol"]) {
            $ent->setNivel($ent->getNivel()-1);  
        }
        $updates[] = "UPDATE mob_entrenamientos SET ".$ent->getNombreBdd()." = ".ceil($ent->getNivel()-$ent->getNivel()*$porcentajeDescuento)." WHERE id_entrenamiento = ".$d["id_entrenamiento"]." AND id_usuario = ".$d["id_usuario"]." LIMIT 1;";          
        echo " necesitaria ".$ent->getNombre()." al nivel ".$ent->getNivel();
      }
      echo "\n";
    }
  }
    
}

echo "Total sospechosos: ".sizeof($usuariosSospechosos)."\n";

echo implode("\n", $updates);

echo "\nFIN";