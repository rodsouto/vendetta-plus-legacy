<?php

class Mob_Controller_Plugin_ModuleLayout extends Zend_Controller_Plugin_Abstract {
  
    public function preDispatch(Zend_Controller_Request_Abstract $request) {
        // && Zend_Auth::getInstance()->hasIdentity()
        if ($request->getParam('module') == "mob" && $request->getActionName() != "setup") {
            $layout = Zend_Layout::getMvcInstance();
            $layout->setLayout("game");
        }
        
    }
}
