<?php

class Mob_Form_Mapa extends Zend_Form {

    public function init() {
        $this->setAction("/mob/mapa");
        $this->addElement("text", "ciudad", array("label" => "Ciudad", "validators" => 
            array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(51)))
        ));
        
        $this->addElement("text", "barrio", array("label" => "Barrio", "validators" => 
            array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(256)))
        ));
        
        $this->addElement("submit", "actualizar", array("label" => "Actualizar"));
    
    }

}