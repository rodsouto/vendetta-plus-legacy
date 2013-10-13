<?php

class Mob_ClasificacionController extends Mob_Controller_Action {
    
    public function indexAction() {
        $this->view->formRanking = new Mob_Form_Ranking;
        
        $_GET["type"] = $this->getRequest()->getParam("type");
        $this->getRequest()->getParam("type") && $this->view->formRanking->isValid($this->getRequest()->getParams());
        
        $this->view->rankingType = $this->getRequest()->getParam("type", 0);
    }

}