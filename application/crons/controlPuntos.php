#!/usr/bin/php
<?php
include "base.php";

class CronJob_ControlPuntos {

  protected $_entrenamientos;
  protected $_tropas;
  protected $_habitaciones;

  public function __construct() {

        $this->_entrenamientos = array();
        foreach (Mob_Data::getEntrenamientos() as $e) {
            $e = Mob_Loader::getEntrenamiento($e);
            $this->_entrenamientos[$e->getNombreBdd()] = $e->getPuntos();
        }
        
        $this->_habitaciones = array();
        foreach (Mob_Data::getHabitaciones() as $h) {
            $h = Mob_Loader::getHabitacion($h);
            $this->_habitaciones[$h->getNombreBdd()] = $h->getPuntos();
        }
        
        $this->_tropas = array();
        foreach (Mob_Data::getTropas() as $t) {
            $t = Mob_Loader::getTropa($t);
            $this->_tropas[$t->getNombreBdd()] = $t->getPuntos();
        }

  }

  public function getPuntos($cantidad = 100) {
        
        $page = (int)file_get_contents(getcwd()."/paginaControlPuntos.txt");
        
        $query = Mob_Loader::getModel("Usuarios")->select()
                  //->limitPage($page, $cantidad)
                  ->limitPage($page, 500)
                  ->order("id_usuario ASC");
        $jugadores = Mob_Loader::getModel("Usuarios")->fetchAll($query);
        echo "SUPERRR 4\n";
        $msgGlobal = "";
        foreach ($jugadores as $jug) {
            $msg = "";
            $titulo = "\n\n_______________________________\nJugador {$jug->id_usuario}:".$jug->usuario."\n";
        
            $totalPuntosEntrenamientos = $totalPuntosHabitaciones = $totalPuntosTropas = 0;        
            foreach (Mob_Loader::getModel("Entrenamiento")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $dataEnt) {
              foreach ($this->_entrenamientos as $ent => $pts) {
                  $totalPuntosEntrenamientos += $dataEnt[$ent] * $pts;
              }  
            }
            
            $jug->puntos_entrenamientos = round($jug->puntos_entrenamientos);
            $totalPuntosEntrenamientos = round($totalPuntosEntrenamientos);
            if (abs($totalPuntosEntrenamientos-$jug->puntos_entrenamientos) > 50) $msg .= "Puntos entrenamientos ".$jug->puntos_entrenamientos." vs. $totalPuntosEntrenamientos (dif ".($totalPuntosEntrenamientos-$jug->puntos_entrenamientos).")\n";
            
            foreach (Mob_Loader::getModel("Edificio")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $edi) {
                foreach (Mob_Loader::getModel("Habitacion")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataHab) {
                  $totalPuntosEdificio = 0;
                  foreach ($this->_habitaciones as $hab => $pts) {
                      $totalPuntosEdificio += $dataHab[$hab] * $pts;
                  }
                  
                  $edi->puntos = round($edi->puntos);
                  $totalPuntosEdificio = round($totalPuntosEdificio);
                  if (abs($edi->puntos - $totalPuntosEdificio) > 10) $msg .= "Puntos edificio {$edi->coord1}:{$edi->coord2}:{$edi->coord3}: {$edi->puntos} vs. $totalPuntosEdificio (dif ".($totalPuntosEdificio-$edi->puntos).")\n";
                }
                //$edi->puntos = $totalPuntosEdificio;
                $totalPuntosHabitaciones += $totalPuntosEdificio;

                foreach (Mob_Loader::getModel("Tropa")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataTropa) {
                  foreach ($this->_tropas as $tropa => $pts) {
                      $totalPuntosTropas += $dataTropa[$tropa] * $pts;
                  }
                }
            }
            
            foreach (Mob_Loader::getModel("Misiones")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $mision) {
              foreach (Zend_Json::decode($mision["tropas"]) as $tropa => $cantidad) {
                $totalPuntosTropas += $this->_tropas[lcfirst($tropa)] * $cantidad;  
              }
            }
            
            $jug->puntos_edificios = round($jug->puntos_edificios);
            $totalPuntosHabitaciones = round($totalPuntosHabitaciones);
            if (abs($totalPuntosHabitaciones-$jug->puntos_edificios) > 50) $msg .= "Puntos edificios ".$jug->puntos_edificios." vs. $totalPuntosHabitaciones (dif ".($totalPuntosHabitaciones-$jug->puntos_edificios).")\n";
            
            $jug->puntos_tropas = round($jug->puntos_tropas);
            $totalPuntosTropas = round($totalPuntosTropas);
            if (abs($totalPuntosTropas-$jug->puntos_tropas) > 50000) $msg .= "Puntos tropas ".$jug->puntos_tropas." vs. $totalPuntosTropas (dif ".($totalPuntosTropas-$jug->puntos_tropas).")\n";
            
            if (!empty($msg)) echo $titulo.$msg;
            //if ($msg != "") $msgGlobal .= ($titulo.$msg);             
        }

        echo "FIN";
        file_put_contents(getcwd()."/paginaControlPuntos.txt", $page+1);
    }

}


$c = new CronJob_ControlPuntos;
$c->getPuntos();