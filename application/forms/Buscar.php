<?php

class Mob_Form_Buscar extends Zend_Form {

    public function init() {
        $this->setAction("/mob/buscar");
        $multiOptions = array("j" => "Jugador", "f" => "Familia");
        $this->addElement("radio", "tipo", array("multiOptions" => $multiOptions, "label" => "Buscar"));
        $this->addElement("text", "texto", array("label" => "Texto", "validators" => array(
        array("StringLength", false, array(4))
        )));
        $this->addElement("submit", "buscar", array("label" => "Buscar"));
        
    }

}