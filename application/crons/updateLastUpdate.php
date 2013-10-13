#!/usr/bin/php
<?php

include "base.php";

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$page = 1;
$count = 200;

$query = $db->select()->from("mob_usuarios", array("id_usuario", "last_update"))->limitPage($page, $count)->order("id_usuario ASC");

while (($data = $db->fetchAll($query)) != array()) {
  
  foreach ($data as $d) {
    echo "actualizo usuario ".$d["id_usuario"]."\n";
    $db->update("mob_edificios", array("last_update" => $d["last_update"]), "id_usuario = ".$d["id_usuario"]);
  }
  $page = $page + 1;
  $query->limitPage($page, $count);
  unset($data);
}