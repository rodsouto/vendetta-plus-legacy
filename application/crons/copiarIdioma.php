#!/usr/bin/php
<?php

include "base.php";

$db = Zend_Db_Table_Abstract::getDefaultAdapter();

             error_reporting(E_ALL);

if (!isset($argv[1]) || strlen($argv[1]) != 2) die("DEBES INDICAR EL CODIGO ISO DEL NUEVO IDIOMA");

$textos = Mob_Loader::getModel("Textos");

$page = 1;
$count = 200;
$query = $textos->select()->where("idioma = 'es'")->order("id_texto ASC")->limitPage($page, $count); 

while (($data = $db->fetchAll($query)) != array()) {

  foreach ($data as $d) {
    unset($d["id_texto"]);
    $d["idioma"] = $argv[1];
    $textos->insert($d);   
  }

  unset($data);
  $page = $page+1;
  $query->limitPage($page, $count);
}

echo "\n\nTEXTOS CREADOS CORRECTAMENTE\n\n";