<?php

class Mob_MercadoController extends Mob_Controller_Action {
    
    public function indexAction() {
    
        $this->view->formPropuesta = new Mob_Form_Mercado_Propuesta;
        $this->view->formPropuesta->setIdVendedor($this->idUsuario);
        
        $this->view->formOk = false;
        if ($this->getRequest()->isPost() && $this->view->formPropuesta->isValid($_POST)) {
            $this->view->formPropuesta->save();
            $this->view->formPropuesta->reset();
            $this->view->formOk = true;
        }
        
        if ($idAceptar = $this->getRequest()->getParam("aceptar")) {
            if (Mob_Loader::getModel("Mercado")->aceptar($this->idUsuario, $idAceptar)) {
              $idSocio = Mob_Loader::getModel("Mercado")->getIdSocio($idAceptar, $this->idUsuario);
              $miNombre = Mob_Loader::getModel("Usuarios")->getFullName($this->idUsuario);
              Mob_Loader::getModel("Mensajes")->enviar(0, array(
                  "id_destinatarios" => $idSocio,
                  "mensaje" => sprintf("%s acepto tu propuesta de comercio.", "<a href='/mob/jugador?id={$this->idUsuario}'>".$miNombre."</a>")
              ));
            }
        }
        
        if ($idCancelar = $this->getRequest()->getParam("cancelar")) {
            $idSocio = Mob_Loader::getModel("Mercado")->getIdSocio($idCancelar, $this->idUsuario);
            if (Mob_Loader::getModel("Mercado")->cancelar($this->idUsuario, $idCancelar)) {
              $miNombre = Mob_Loader::getModel("Usuarios")->getFullName($this->idUsuario);
              Mob_Loader::getModel("Mensajes")->enviar(0, array(
                  "id_destinatarios" => $idSocio,
                  "mensaje" => sprintf("%s cancelo una propuesta de comercio.", "<a href='/mob/jugador?id={$this->idUsuario}'>".$miNombre."</a>")
              ));            
            }
        }
    
    }
    
}