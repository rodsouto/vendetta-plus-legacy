<?php

class Mob_VisionglobalController extends Mob_Controller_Action {
    
    public function indexAction() {
        $this->_helper->layout->setLayout("visionglobal");
        $idEdificios = Mob_Loader::getModel("Edificio")->getIdEdificios($this->idUsuario);
        Mob_Loader::getClass("Controller_Plugin_Update")->updateRecursos($idEdificios);
    }
    
    public function tropasAction(){
        $this->_helper->layout->setLayout("visionglobal");
    }
    
    public function misionesAction(){

        if (($idVolver = $this->getRequest()->getQuery("volver")) !== null 
                && Mob_Loader::getModel("Misiones")->puedeVolver($this->idUsuario, $idVolver)) {
                Mob_Loader::getModel("Misiones")->volver($idVolver);
                Mob_Cache_Factory::getInstance("query")->remove('getMisiones'.$this->idUsuario);
        }    
    }

}