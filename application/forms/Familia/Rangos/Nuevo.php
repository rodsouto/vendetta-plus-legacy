<?php

class Mob_Form_Familia_Rangos_Nuevo extends Zend_Form {

    public function init() {
        $this->setAction("/mob/familias/administrar");
        $this->addElement("text", "nombre", array("label" => "Nombre", "required" => true));
        $this->addElement("submit", "guardarRangosNuevo", array("label" => "Guardar"));
    }
    
    public function save($idFamilia) {
        return Mob_Loader::getModel("Familias_Rangos")->crearRango($idFamilia, $this->nombre->getValue());
    }

}