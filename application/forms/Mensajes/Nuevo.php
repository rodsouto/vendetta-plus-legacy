<?php

class Mob_Form_Mensajes_Nuevo extends Zend_Form {

    public function init() {
        $this->setAction("/mob/mensajes/nuevo");
        $this->addElement("text", "destinatarios", array("label" => "Destinatarios", "required" => true,
        "validators" => array("Destinatarios")));
        $this->destinatarios->addPrefixPath('Mob_Validator', 'Mob/Validator/', 'validate');
                            
        $this->addElement("text", "asunto", array("label" => "Asunto")); // , "required" => true
        
        $this->addElement("textarea", "mensaje", array("label" => "Mensaje", "required" => true));
        
        $this->addElement("submit", "enviar", array("label" => "Enviar", "ignore" => true));
        
    }
    
    public function setDestinatario($destinatario) {
        $this->destinatarios->setValue($destinatario);
    }

}