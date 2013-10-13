<?php

class Mob_EntrenamientoController extends Mob_Controller_Action {
    
    public function indexAction() {
        if (!empty($this->idUsuario)) {
          if ($this->_jugador->tieneModoPadrino()) {
            if ($this->getRequest()->getQuery("next", null) != null && $this->_jugador->puedePonerEntEnCola()) {
                
                $entrenando = $this->_jugador->estaEntrenando();
                if ($entrenando) {
                  // ponemos en cola
                  $this->_jugador->getEdificioActual()->construirEntrenamiento($this->getRequest()->getQuery("next"), true);
                } elseif ($this->_jugador->getEdificioActual()->puedeConstruirEntrenamiento($this->getRequest()->getQuery("next"))) {
                  // construccion directa
                  $this->_jugador->getEdificioActual()->construirEntrenamiento($this->getRequest()->getQuery("next"), false);
                }
            }
          } else {
            if ($this->getRequest()->getQuery("next", null) != null && 
                    !$this->_jugador->estaEntrenando() &&
                        $this->_jugador->getEdificioActual()->puedeConstruirEntrenamiento($this->getRequest()->getQuery("next"))) {
                
                $this->_jugador->getEdificioActual()->construirEntrenamiento($this->getRequest()->getQuery("next"));
            }
          }
          
          if (isset($_GET["cancelar"])) {
              $this->_jugador->cancelarEntrenamiento($_GET["cancelar"]);
              //$this->_redirect("/mob/entrenamiento");
          }
        }

    }     
    
    public function verAction() {}

}