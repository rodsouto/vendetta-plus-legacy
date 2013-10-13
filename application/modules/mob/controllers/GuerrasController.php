<?php

class Mob_GuerrasController extends Mob_Controller_Action {
    
    public function indexAction() {
    
    }
    
    public function verAction() {
      $this->view->idg = (int)$this->getRequest()->getQuery("idg");
    }    

}