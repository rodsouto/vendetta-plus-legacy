<?php

class Mob_BatallasController extends Mob_Controller_Action {
    
    public function indexAction() {
      $this->view->form = new Mob_Form_Ranking_Batallas;
      
      isset($_GET["ver"]) && $this->view->form->isValid($_GET);
    }
    
    public function verAction() {

    }

}