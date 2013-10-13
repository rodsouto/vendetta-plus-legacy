<?php

class Mob_HabitacionesController extends Mob_Controller_Action {
    
    public function indexAction() {
        if (!empty($this->idUsuario)) {
          if ($this->_jugador->tieneModoPadrino()) {
            if ($this->getRequest()->getQuery("next", null) != null && $this->_jugador->getEdificioActual()->puedePonerHabEnCola()) {
                
                $construyendo = $this->_jugador->getEdificioActual()->estaConstruyendo();
                if ($construyendo) {
                  // ponemos en cola
                  $this->_jugador->getEdificioActual()->construir($this->getRequest()->getQuery("next"), true);
                } elseif ($this->_jugador->getEdificioActual()->puedeConstruir($this->getRequest()->getQuery("next"))) {
                  // construccion directa
                  $this->_jugador->getEdificioActual()->construir($this->getRequest()->getQuery("next"), false);
                }
                Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo_'.$this->idUsuario.'_'.$this->idEdificio);
                Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo_'.$this->idUsuario.'_0');
                
                // para actualizar los recursos
                $this->_redirect("/mob/habitaciones");
            }
          } else {
            if ($this->getRequest()->getQuery("next", null) != null && 
                    !$this->_jugador->getEdificioActual()->estaConstruyendo() &&
                        $this->_jugador->getEdificioActual()->puedeConstruir($this->getRequest()->getQuery("next"))) {
                
                $this->_jugador->getEdificioActual()->construir($this->getRequest()->getQuery("next"));
                Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo_'.$this->idUsuario.'_'.$this->idEdificio);
                Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo_'.$this->idUsuario.'_0');
                $this->_redirect("/mob/habitaciones");
            }
          }
          
          if (isset($_GET["cancelar"])) {
              $this->_jugador->getEdificioActual()->cancelarHabitacion($_GET["cancelar"]);
              Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo_'.$this->idUsuario.'_'.$this->idEdificio);
              Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo_'.$this->idUsuario.'_0');
              $this->_redirect("/mob/habitaciones");
          }
        }

    }
    
    public function verAction() {
    
    }

}