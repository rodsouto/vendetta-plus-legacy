<?php

class Mob_ReclutamientoController extends Mob_Controller_Action {
    
    public function indexAction() {

        if (!empty($this->idUsuario)) {
          $this->view->formListado = new Mob_Form_Reclutamiento_Listado;
          $this->view->formListado->build("tropas");
          $this->view->errorBorrar = false;
          
          if ($this->getRequest()->isPost()) {
              if ($this->getRequest()->getPost("borrar") !== null) {
                  if ($this->view->formListado->isValid($_POST)) {
                      $this->view->formListado->borrar();
                      $this->_redirect("/mob/reclutamiento");
                  } else {
                      $this->view->errorBorrar = true;
                  }
              } elseif (($total = $this->getRequest()->getPost("total")) != null && 
                  ($tropa = $this->getRequest()->getPost("tropa")) != null
                  && $this->edificioActual->puedeEntrenar($tropa, $total)) {
                      $form = new Mob_Form_Reclutamiento;
                      if ($form->isValid($_POST)) {
                        $this->edificioActual->entrenar($tropa, $total);    
                        $this->_redirect("/mob/reclutamiento");
                      }        
              }
          
          }
        }
        
    }
    
    public function verAction() {
    
    }

}