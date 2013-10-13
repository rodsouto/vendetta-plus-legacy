<?php

class Mob_Controller_Plugin_Initialize extends Zend_Controller_Plugin_Abstract {
  
    public function routeShutdown(Zend_Controller_Request_Abstract $request) {

        if (!Zend_Auth::getInstance()->hasIdentity()) return;
        
        $idJugador = Zend_Auth::getInstance()->getIdentity()->id_usuario;
        
        $jugadorActual = new Mob_Jugador($idJugador);
                
        $namespaceEdificio = new Zend_Session_Namespace("edificio");

        if (empty($namespaceEdificio->edificio)) {
          $namespaceEdificio->edificio =  Mob_Loader::getModel("Edificio")->getPrincipal($idJugador);
        } else {
            if (!$jugadorActual->poseeEdificio($namespaceEdificio->edificio)) {
                unset($namespaceEdificio->edificio);
            }
        }
        
        if ($request->getParam("building") !== null) {
            $idEdificioCambiado = (int)$request->getParam("building");
            if ($jugadorActual->poseeEdificio($idEdificioCambiado)) {
                $namespaceEdificio->edificio = $idEdificioCambiado;
            }
        }
        
        if (!empty($namespaceEdificio->edificio)) {
            $jugadorActual->setEdificio($namespaceEdificio->edificio);
        }
            
        Zend_Registry::set("jugadorActual", $jugadorActual);        
        
    }
}
