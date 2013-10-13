<?php

class Mob_Form_Familia_Mensaje extends Zend_Form {

    public function init() {
        $this->setAction("/mob/familias");
        $this->addElement("textarea", "mensaje", array( 
                        "required" => true,
        ));
        
        $this->addElement("submit", "escribir", array("label" => "Escribir", "ignore" => true));
    }
    
    public function save($idUsuario, $idFamilia) {
        Mob_Loader::getModel("Familias_Mensajes")->enviar($idUsuario, $idFamilia, $this->mensaje->getValue());
    }

}