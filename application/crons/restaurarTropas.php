#!/usr/bin/php

<?php

include "base.php";

$from = "mob_tropas_preAtaque";
$to = "mob_tropas";

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$page = 1;
$count = 1000;
$query = $db->select()->from($from)->limitPage($page, $count)->order("id_tropa ASC");

/*$query = "SELECT $from .* FROM $from 
LEFT JOIN mob_edificios e ON $from .id_edificio = e.id_edificio WHERE e.id_usuario = 171";*/


while (($data = $db->fetchAll($query)) != array()) {

  foreach ($data as $d) {
    $id = $d["id_tropa"];
    echo "$id\n";
    unset($d["id_tropa"]);
    $db->update($to, $d, "id_tropa = $id");
  }
  
  if (!is_object($query)) break;
  $page = $page +1;
  
  $query->limitPage($page, $count);
}

echo "FIN"; 