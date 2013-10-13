<?php

class Mob_Form_EdificioBase extends Zend_Form {

    public function init() {
        $this->setAction("/mob/index/setup");
        $multiOptions = array(1 => "Elegir un edificio al azar", 
        2 => "Elegir una ubicacion fija", 
        //3 => "Exportar cuenta de Vendetta"
        //4 => "Crear una cuenta con niveles promedio en algun barrio disponible",
        );
        
        $this->addElement("radio", "fuente", array("required" => true, "label" => "Que deseas hacer?", "multiOptions" => $multiOptions));
        $this->addElement("submit", "paso1", array("label" => "Siguiente"));
    }

}