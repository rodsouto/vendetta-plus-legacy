<?php

class Mob_Form_Ranking extends Zend_Form {

    public function init() {
        $this->setMethod("get")->setAction("/mob/clasificacion");
        $multiOptions = array(0 => "Jugadores", 1 => "Familias", 
        //2 => "Barrios"
        ); // , 3 => "Edificios"
        $this->addElement("select", "type", array("multiOptions" => $multiOptions));
                
        $this->addElement("submit", "mostrar", array("label" => "Mostrar", "ignore" => true));
        
        $this->setElementDecorators(array("ViewHelper"));
    
    }
    
    public function getTipo() {
        $multiOptions = array(0 => "Jugadores", 1 => "Familias", 2 => "Barrios");
        return $multiOptions[$this->type->getValue() != null ? $this->type->getValue() : 0];
    }

}