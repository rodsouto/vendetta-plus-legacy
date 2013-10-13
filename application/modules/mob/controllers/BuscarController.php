<?php

class Mob_BuscarController extends Mob_Controller_Action {
    
    public function indexAction() {
        $this->view->form = $form = new Mob_Form_Buscar;
        
        if (($t = $this->getRequest()->getQuery("t")) !== null) {
            $this->view->form->tipo->setValue($t);
        }
        
        $this->view->buscar = false;
        
        if ($this->getRequest()->getPost("buscar") !== null && $form->isValid($_POST)) {
        
            $this->view->buscar = true;
        
        }
    }

}