<?php

class Mob_MensajesController extends Mob_Controller_Action {
    
    public function indexAction() {

    }
    
    public function nuevoAction() {
        $this->view->formEscribir = $form = new Mob_Form_Mensajes_Nuevo;
        
        if (($idDestinatario = $this->getRequest()->getQuery("id_dest")) !== null) {
            $form->setDestinatario(Mob_Loader::getModel("Usuarios")->getUsuario($idDestinatario));
        }
        
        if ($this->getRequest()->getPost("enviar") !== null && $form->isValid($_POST)) {
            Mob_Loader::getModel("Mensajes")->enviar($this->idUsuario, $form->getValues());
            $this->_redirect("/mob/mensajes/nuevo?ok");
        }
    }
    /*
    public function ignorarAction() {
        $this->formSuspendidos = $formSuspendidos = new Mob_Form_Mensajes_Suspendidos;
        $formSuspendidos->setSuspendidos(P4t_Loader::getModel("MensajesSuspendidos")->getSuspendidos($this->idUsuario));
        
        $this->formAgregarSuspendidos = $formAgregarSuspendidos = new Mob_Form_Mensajes_AgregarSuspendidos;
        
        if ($this->getRequest()->isPost()) {
        
            if ($this->_getParam("enviarSuspendidos") !== null && $formSuspendidos->isValid($_POST)) {
                $formSuspendidos->save();
            } elseif ($formAgregarSuspendidos->isValid($_POST)) {
                $formAgregarSuspendidos->save();
            }
        
        }
        
    }*/
    
    public function administrarAction() {
        
        $this->view->formNuevaCarpeta = $formNuevaCarpeta = new Mob_Form_Mensajes_NuevaCarpeta;
        
        if ($this->getRequest()->getQuery("editar") !== null) {
            $formNuevaCarpeta->setEditar($this->getRequest()->getQuery("editar"));
        }
        
        if ($this->getRequest()->getQuery("borrar") !== null) {
            Mob_Loader::getModel("Mensajes_Carpetas")->borrar($this->idUsuario, $this->getRequest()->getQuery("borrar"));
        }
        
        if ($this->getRequest()->isPost() && $formNuevaCarpeta->isValid($_POST)) {
            $formNuevaCarpeta->save($this->idUsuario);
            $formNuevaCarpeta->reset();
        }
        
    }
    
    /*public function opcionesAction() {
        $this->view->formOpciones = $form = new Mob_Form_Mensajes_Opciones;
        
        if ($this->getRequest()->isPost() && $form->isValid($_POST)) {
            $form->save();
        }
    }*/
    
    public function listadoAction() {
        $idCarpeta = $this->view->idCarpeta = $this->_getParam("c", 0);
        $page = (int)$this->_getParam("page", 1);

        Mob_Loader::getModel("Mensajes")->marcarLeido($this->idUsuario, $idCarpeta);
        
        $this->view->formListado = $form = new Mob_Form_Mensajes_Listado;
        $form->build($this->idUsuario, $idCarpeta, $page, 20);
        
        $this->view->paginator = Zend_Paginator::factory(Mob_Loader::getModel("Mensajes")->getLastQuery());
        $this->view->paginator->setCurrentPageNumber($page)
                    ->setItemCountPerPage(20);
        
        if ($this->getRequest()->getPost("enviar") !== null && $form->isValid($_POST)) {
            $form->save();
            $this->_redirect("/mob/mensajes/listado?page=$page&c=$idCarpeta");
        }
        
    }

}