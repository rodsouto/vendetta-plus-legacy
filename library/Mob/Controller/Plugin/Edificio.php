<?php

class Mob_Controller_Plugin_Edificio extends Zend_Controller_Plugin_Abstract {
  
    public function preDispatch(Zend_Controller_Request_Abstract $request) {
        
        if (!Zend_Auth::getInstance()->hasIdentity() 
              || $request->getActionName() == "setup" 
                  || $request->getControllerName() == "logout"
                    || $request->getActionName() == "sumartropas"
                      || $request->getActionName() == "wait") return;
        
        $idJugador = Zend_Auth::getInstance()->getIdentity()->id_usuario;

        if (Mob_Loader::getModel("Edificio")->getPrincipal($idJugador) == 0) {
              Zend_Controller_Action_HelperBroker::getStaticHelper("redirector")->setGotoUrl("/mob/index/setup");
              /*$request->setModuleName("mob")
                      ->setControllerName("index")
                      ->setActionName("setup")
                      ->setDispatched(false);*/
           
        }
        
        if (Mob_Loader::getModel("Vacaciones")->estaDeVacaciones($idJugador) && $request->getActionName() != "vacaciones") {
            Zend_Controller_Action_HelperBroker::getStaticHelper("redirector")->setGotoUrl("/mob/opciones/vacaciones");
        }
        
    }

}
