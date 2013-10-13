#!/usr/bin/php
<?php

include "base.php";





$entrenamientos = array();
foreach (Mob_Data::getEntrenamientos() as $e) {
    $e = Mob_Loader::getEntrenamiento($e);
    $entrenamientos[$e->getNombreBdd()] = $e->getPuntos();
}

$habitaciones = array();
foreach (Mob_Data::getHabitaciones() as $h) {
    $h = Mob_Loader::getHabitacion($h);
    $habitaciones[$h->getNombreBdd()] = $h->getPuntos();
}



$tropas = array();
foreach (Mob_Data::getTropas() as $t) {
    $t = Mob_Loader::getTropa($t);
    $tropas[$t->getNombreBdd()] = $t->getPuntos();
}

$model = Mob_Loader::getModel("Usuarios");

$page = 1;
$count = 300;
$query = $model->select()->order("id_usuario ASC")->limitPage($page, $count);

$jugadores = $model->fetchAll($query);

while ($jugadores->current() != null) {
  
  foreach ($jugadores as $jug) {
      echo $jug["id_usuario"]."\n";
      $totalPuntosEntrenamientos = $totalPuntosHabitaciones = $totalPuntosTropas = 0;        
      foreach (Mob_Loader::getModel("Entrenamiento")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $dataEnt) {
        foreach ($entrenamientos as $ent => $pts) {
            $totalPuntosEntrenamientos += $dataEnt[$ent] * $pts;
        }  
      }
  
      $jug->puntos_entrenamientos = $totalPuntosEntrenamientos;
  
      foreach (Mob_Loader::getModel("Edificio")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $edi) {
          foreach (Mob_Loader::getModel("Habitacion")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataHab) {
            $totalPuntosEdificio = 0;
            foreach ($habitaciones as $hab => $pts) {
                $totalPuntosEdificio += $dataHab[$hab] * $pts;
            }
          }
  
          $edi->puntos = $totalPuntosEdificio;
          $totalPuntosHabitaciones += $totalPuntosEdificio;
          $edi->save();
  
          foreach (Mob_Loader::getModel("Tropa")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataTropa) {
            foreach ($tropas as $tropa => $pts) {
                $totalPuntosTropas += $dataTropa[$tropa] * $pts;
            }
          }
      }
      
      foreach (Mob_Loader::getModel("Misiones")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $mision) {
        foreach (Zend_Json::decode($mision->tropas) as $tropa => $cantidad) {
          $totalPuntosTropas += $cantidad * $tropas[lcfirst($tropa)];  
        }
      }    
  
      $jug->puntos_edificios = $totalPuntosHabitaciones;
      $jug->puntos_tropas = $totalPuntosTropas;            
      $jug->save(); 
  }
  unset($jugadores);
  $page = $page +1;
  $query->limitPage($page, $count);
  $jugadores = $model->fetchAll($query);
}