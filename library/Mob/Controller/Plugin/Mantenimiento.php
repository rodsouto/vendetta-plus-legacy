<?php

class Mob_Controller_Plugin_Mantenimiento extends Zend_Controller_Plugin_Abstract {
  
    public function dispatchLoopStartup(Zend_Controller_Request_Abstract $request) {
        
      if(Zend_Controller_Front::getInstance()->getParam("mantenimiento", 0) && $request->getActionName() != "wait"
          && Zend_Controller_Front::getInstance()->getParam("miIp") != $_SERVER["REMOTE_ADDR"]) {
            Zend_Controller_Action_HelperBroker::getStaticHelper("redirector")->setGotoUrl("/index/index/wait");
      }
        
    }
}
