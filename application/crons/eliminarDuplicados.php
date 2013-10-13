#!/usr/bin/php
<?php
include "base.php";

      $db = Zend_Db_Table_Abstract::getDefaultAdapter();
      $query = "SELECT COUNT(*) as total, coord1, coord2, coord3 FROM mob_edificios GROUP BY coord1, coord2, coord3 ORDER BY total DESC LIMIT 50";
      
      $data = $db->query($query)->fetchAll();
      
      foreach ($data as $d) {
        if ($d["total"] == 1) break;
        $query = "SELECT * FROM mob_edificios WHERE coord1 = {$d['coord1']} AND coord2 = {$d['coord2']} AND coord3 = {$d['coord3']} ORDER BY id_edificio ASC";
        try {
        $duplicados = $db->query($query)->fetchAll();
        } catch (Exception $e) {
          die($query);
        }
        echo "Total edificios ".implode(":", array($d['coord1'], $d['coord2'], $d['coord3'])).": ".count($duplicados)."\n";
        unset($duplicados[0]);
        $coord3 = 1;
        
        foreach ($duplicados as $e) {
          $from = $d['coord3'];
          $coord3 = $from+1;
          echo "id_edificio ".$e["id_edificio"]." coord3 ".$d['coord3']." FROM $from\n";
          while (($idUsuario = Mob_Loader::getModel("Edificio")->getIdByCoord($d['coord1'], $d['coord2'], $coord3)) != 0) {
            echo "++\n";
            if ($coord3 == 255) $coord3 == 1;
            If ($coord3 == $from) {
              echo "____ $coord3 $from\n";
              $coord3 = 0;
              break;
            }
            $coord3++;
          }
          
          if ($coord3 == 0) echo "No hay lugar el barrio ".$d['coord1'].":".$d['coord2']."\n";
          
          echo "ID_USUARIO_EXISTENTE = $idUsuario\n";
          if ($coord3 < 255) {
            echo "Muevo el ".$d['coord3']." al $coord3\n"; 
            Mob_Loader::getModel("Edificio")->update(array("coord3" => $coord3), "id_edificio = ".$e["id_edificio"]);
            $coord3++;
          }         
        }
        
        echo "\n\n\n";
        
      }