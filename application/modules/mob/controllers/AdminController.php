<?php

class Mob_AdminController extends Mob_Controller_Action {
    
    public function preDispatch() {
        if ($this->getRequest()->getQuery("key", "") != "7vkfz4") {
            $this->_redirect("/");
        }
        
        $this->_helper->viewRenderer->setNoRender();
    }
    
    
    
    public function indexAction() {
    }
    
    public function actualizarpuntosAction() {
    
        $jugadores = Mob_Loader::getModel("Usuarios")->fetchAll();
    
        // actualizo puntos entrenamientos
        // cargo los entrenamientos
        $entrenamientos = array();
        foreach ($this->_jugador->getEdificioActual()->getListadoEntrenamientos() as $e) {
            $entrenamientos[$e->getNombreBdd()] = $e->getPuntos();
        }
        
        $habitaciones = array();
        foreach ($this->_jugador->getEdificioActual()->getListadoHabitaciones() as $h) {
            $habitaciones[$h->getNombreBdd()] = $h->getPuntos();
        }
        
        $tropas = array();
        foreach ($this->_jugador->getEdificioActual()->getListadoTropas() as $t) {
            $tropas[$t->getNombreBdd()] = $t->getPuntos();
        }
        foreach ($this->_jugador->getEdificioActual()->getListadoTropasSeguridad() as $t) {
            $tropas[$t->getNombreBdd()] = $t->getPuntos();
        }
        
        foreach ($jugadores as $jug) {
            $totalPuntosEntrenamientos = 0;
            foreach ($entrenamientos as $ent => $pts) {
                $totalPuntosEntrenamientos += $jug[$ent] * $pts;
            }
            $jug->puntos_entrenamientos = $totalPuntosEntrenamientos;
            
            //actualizo tropas y edificios
            $totalPuntosHabitaciones = $totalPuntosTropas = 0;
            foreach($this->_jugador->getEdificioActual()->fetchAll("usuario = ".(int)$jug["id_usuario"]) as $edi) {
                $totalPuntosEdificio = 0;
                foreach ($habitaciones as $hab => $pts) {
                    $totalPuntosEdificio += $edi[$hab] * $pts;
                }
                foreach ($tropas as $tropa => $pts) {
                    $totalPuntosTropas += $edi[$tropa] * $pts;
                }
                $edi->puntos = round($totalPuntosEdificio);
                $edi->save();
                $totalPuntosHabitaciones += $totalPuntosEdificio;
            }

            $jug->puntos_edificios = round($totalPuntosHabitaciones);
            $jug->puntos_tropas = round($totalPuntosTropas);            
            $jug->save();

        }
    }

}