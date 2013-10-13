#!/usr/bin/php

<?php

include "base.php";

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$stmtTropSinEdi = $db->query("SELECT * FROM mob_tropas t LEFT JOIN mob_edificios e ON e.id_edificio = t.id_edificio WHERE e.id_edificio IS NULL LIMIT 0 , 30");
$rows = $stmtTropSinEdi->fetchAll();
echo "TROPAS SIN EDIFICIOS\n";
foreach ($rows as $v) {
  echo "id_edificio = ".$v["id_edificio"]." id_tropa = ".$v["id_tropa"]."\n";
}
                                                                                                                                                
$stmtEdiSinTrop = $db->query("SELECT * FROM mob_edificios e LEFT JOIN mob_tropas t ON t.id_edificio = e.id_edificio WHERE t.id_edificio IS NULL LIMIT 0 , 30");
$rows = $stmtEdiSinTrop->fetchAll();
echo "EDIFICIOS SIN TROPAS\n";
foreach ($rows as $v) {
  echo "id_edificio = ".$v["id_edificio"]." id_tropa = ".$v["id_tropa"]."\n";
}