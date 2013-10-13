#!/usr/bin/php

<?php

include "base.php";

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$page = 1;
$total = 5000;
$query = $db->select()->from("mob_habitaciones")->order("id_habitacion ASC")->limitPage($page, $total);
//$query->where("id_edificio = 3711");
//$query->where("id_habitacion = 60473");

while (($data = $db->fetchAll($query)) != array()) {                                              
  foreach ($data as $d) {
    //echo $d["id_habitacion"]."\n";
    $query2 = $db->select()->from("mob_habitaciones1310")->where("id_habitacion = ".(int)$d["id_habitacion"])->limit(1);

    $dataAnterior = $db->fetchAll($query2);
    
    if ($dataAnterior == array()) {
      //echo "No existe id_habitacion ".$d["id_habitacion"]." del id_edificio ".$d["id_edificio"]."\n";
      continue;
    }
    
    foreach ($dataAnterior[0] as $k2 => $d2) {
      if ($d[$k2] < $d2) {
        //echo "id_habitacion ".$d["id_habitacion"]." tenia $k2 en ".$d[$k2]." y ahora en ".$d2."\n";
        echo "UPDATE mob_habitaciones SET $k2 = $d2 WHERE id_habitacion = ".$d["id_habitacion"]." AND $k2 < $d2 LIMIT 1;\n";
      } else {
        //echo "No hay datos para actualizar (tiene $k2 = {$d[$k2]} y tenia $d2[$k2] )\n";
      }
    }
    
  }
  unset($data);
  $page++;
  $query->limitPage($page, $total);
}

echo "FIN";
