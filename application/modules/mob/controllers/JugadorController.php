<?php

class Mob_JugadorController extends Mob_Controller_Action {
    
    public function indexAction() {
        $this->view->formGuestbook = $this->idUsuario ? new Mob_Form_Guestbook : "";
        
        $this->view->idJugador = (int)$_GET["id"];
        
        if ($this->idUsuario && $this->view->idJugador && $this->getRequest()->isPost() && $this->view->formGuestbook->isValid($_POST)) {
            $this->view->formGuestbook->save($this->idUsuario, $this->view->idJugador);
            $this->view->formGuestbook->reset();
        }
    }

}