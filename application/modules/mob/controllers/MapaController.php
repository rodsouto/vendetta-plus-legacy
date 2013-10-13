<?php

class Mob_MapaController extends Mob_Controller_Action {
    
    public function indexAction() {
        $this->view->form = $form = new Mob_Form_Mapa;
        
        if (!($this->getRequest()->getPost("actualizar") && $form->isValid($_POST))) {
            if (!empty($this->idUsuario)) {
              $form->ciudad->setValue($this->edificioActual->getCiudad());
              $form->barrio->setValue($this->edificioActual->getBarrio());
            } else {
              $form->ciudad->setValue(25);
              $form->barrio->setValue(25);
            }
        }
    }

}