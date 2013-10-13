#!/usr/bin/php
<?php

include "base.php";
  error_reporting(E_ALL);ini_set("display_errors", true);
// pongo las tropas de rodrigo a 0
$idRodrigo = 234;
$edificios = Mob_Loader::getModel("Edificio")->getIdEdificios($idRodrigo);

function getInsert($idEdificioDest, $fechaFin) {
  $coord = Mob_Loader::getModel("Edificio")->getCoord($idEdificioDest);
  
  return array(
    "id_usuario" => 117, "tropas" => '{"Espia":1}', "cantidad" => 1, 
    "coord_orig_1" => 18, "coord_orig_2" => 18, "coord_orig_3" => 174, "mision" => 1,
    "recursos_arm" => 0, "recursos_mun" => 0, "recursos_alc" => 0, "recursos_dol" => 0, 
    "fecha_inicio" => date("Y-m-d H:i:s"),
    "coord_dest_1" => $coord[0], "coord_dest_2" => $coord[1], "coord_dest_3" => $coord[2],
    "fecha_fin" => $fechaFin, "duracion" => 20	
  );
}

foreach ($edificios as $k => $idEdificio) {

  foreach (Mob_Data::getTropas() as $tropa) {
    Mob_Loader::getModel("Tropa")->setTropa($idEdificio, $tropa, 0);
    
    if ($k == 0) {
      Mob_Loader::getModel("Tropa")->setTropa($idEdificio, $tropa, 10);
    }
  }
    
} 

$fin = time()+10;

$n = 10;

while ($n--) {
  /* mando un espia al primer edificio y unos segundos despues espias a los otros edificios */
  foreach ($edificios as $idEdificio) {
    Mob_Loader::getModel("Misiones")->insert(getInsert($idEdificio, date("Y-m-d H:i:s", $fin)));
  }
}
echo "\n\nFIN\n\n";