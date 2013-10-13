<?php

class Mob_MisionesController extends Mob_Controller_Action {
    
    public function indexAction() {
        $this->view->formMisiones = new Mob_Form_Misiones;
        $this->view->formMisiones->build($this->edificioActual->getTropas(false));
        
        $namespace = new Zend_Session_Namespace("misiones");
        
        if (isset($namespace->data) && (time() - $namespace->time) < 60) {
          $this->view->formMisiones->populate($namespace->data);
          $this->view->coordDest = $namespace->data["subFormCoordenadas"]["coordx"].":".
                                    $namespace->data["subFormCoordenadas"]["coordy"].":".
                                    $namespace->data["subFormCoordenadas"]["coordz"];
        }
        
        $formEnviado = $this->getRequest()->getPost("actualizar") !== null || $this->getRequest()->getPost("enviar") !== null;
        if ($formEnviado && 
                $this->view->formMisiones->isValid($this->getRequest()->getPost())
                    && !$this->view->formMisiones->esActualizacion() ) {
                
                $this->view->formMisiones->save($this->idUsuario);
                
                $namespace->data = $this->view->formMisiones->getValues();
                $namespace->time = time();
                
                //$this->_redirect("/mob/visionglobal/misiones");
                $this->_redirect("/mob/misiones?ok");
        
        }
        
        if (isset($_GET["c1"]) && isset($_GET["c2"]) && isset($_GET["c2"])) {
            $this->view->formMisiones->setCoords($_GET["c1"], $_GET["c2"], $_GET["c3"]);
        }
    }

}