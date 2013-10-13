<?php

include "base.php";
echo "\n";

error_reporting(E_ALL);
ini_set("display_errors", true);

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$page = 1;
$count = 1000;

$nf = new Mob_View_Helper_NumberFormat;

$deposito = new Mob_Habitacion_Deposito;
$almacenArm = new Mob_Habitacion_AlmacenArm;
$caja = new Mob_Habitacion_Caja;

$usuariosSospechosos = array();

echo "Entrenamientos________________________________________\n";

$query = $db->select()->from("mob_entrenamientos");
if (isset($argv[1])) $query->where("id_usuario = ".$argv[1]);

foreach ($db->fetchAll($query) as $d) {
  
    $queryMaximaEscuela = $db->select()->from("mob_habitaciones")->where("id_usuario = ".$d["id_usuario"])->order("caja DESC")->limit(1);
  
    $habitaciones = $db->fetchAll($queryMaximaEscuela);
    
    if (!isset($habitaciones[0])) {
      //echo $d["id_usuario"]." no tiene edificios\n";
      continue;
    }
    //echo "edificio ".$habitaciones[0]["id_edificio"]." escuela ".$habitaciones[0]["escuela"]."\n";
    $habitaciones = $habitaciones[0];

    $deposito->setNivel($habitaciones["deposito"]);
    $almacenArm->setNivel($habitaciones["almacenArm"]);
    $caja->setNivel($habitaciones["caja"]);
     
    $mun = $deposito->getAlmacenamiento();
    $arm = $almacenArm->getAlmacenamiento();
    $dol = $caja->getAlmacenamiento();

    $usuario = Mob_Loader::getModel("Usuarios")->getUsuario($d["id_usuario"]);
  
  foreach (Mob_Data::getEntrenamientos() as $e) {  
    $e = lcfirst($e);
    $ent = Mob_Loader::getEntrenamiento($e)->setNivel($d[$e]-1);
    if ($ent->getCosto("arm") > $arm || $ent->getCosto("mun") > $mun || $ent->getCosto("dol") > $dol) {
      $usuariosSospechosos[$d["id_usuario"]] = 1;
      
      echo "$usuario: $e en ".$d[$e]." cuesta ";
      if ($ent->getCosto("arm") > $arm) echo $nf->numberFormat($ent->getCosto("arm")). " de armas y puede almacenar ".$nf->numberFormat($arm)." (+".number_format(($ent->getCosto("arm")-$arm)/150000, 2).") ";
      if ($ent->getCosto("mun") > $mun) echo $nf->numberFormat($ent->getCosto("mun")). " de municion y puede almacenar ".$nf->numberFormat($mun)." (+".number_format(($ent->getCosto("mun")-$mun)/150000, 2).") ";
      if ($ent->getCosto("dol") > $dol) echo $nf->numberFormat($ent->getCosto("dol")). " de dolares y puede almacenar ".$nf->numberFormat($dol)." (+".number_format(($ent->getCosto("dol")-$dol)/150000, 2).") ";
      echo "\n";
    }
  }
    
}

echo "Total sospechosos: ".sizeof($usuariosSospechosos)."\n";

echo "\nFIN";