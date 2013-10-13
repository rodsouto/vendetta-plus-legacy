<?php

class Mob_EdificiosController extends Mob_Controller_Action {
    
    public function indexAction() {
        if (($idBorrar = $this->getRequest()->getQuery("delete")) !== null && isset($_GET["bye"])) {
            $coords = Mob_Loader::getModel("Edificio")->getCoord($idBorrar);
                       
            $this->_jugador->borrarEdificio($idBorrar);
            
            Mob_Cache_Factory::getInstance("query")->remove('getEdificios'.$this->idUsuario);
            Mob_Cache_Factory::getInstance("query")->remove('getTodosEdificios'.$this->idUsuario);
            Mob_Cache_Factory::getInstance("query")->remove('getTotalEdificios'.$this->idUsuario);
            Mob_Cache_Factory::getInstance("html")->remove("mapa_".$coords[0]."_".$coords[1]);
            
            $this->getRequest()->setParam("updatePuntos", $this->idUsuario);
            
            if (Mob_Loader::getModel("Edificio")->getPrincipal($this->_jugador->getIdUsuario()) == 0) {
              $this->_redirect("mob/index/setup");
            }        
        } 
    }

}