<?php

class Mob_Form_Email extends Zend_Form {

  protected $_idUsuario;

  public function init() {
    $this->setAction("/mob/opciones/mail");
    $this->addElement("text", "email", array("label" => "Email actual", "required" => true, "validators" => array("EmailAddress")));
    $this->addElement("text", "email_nuevo1", array("label" => "Email nuevo", "required" => true, "validators" => array("EmailAddress")));
    $this->addElement("text", "email_nuevo2", array("label" => "Repite el email", "required" => true, "validators" => array("EmailAddress")));
    
    $this->addElement("submit", "cambiar", array("label" => "Cambiar"));
  }
  
  public function setIdUsuario($idUsuario) {
    $this->_idUsuario = $idUsuario;
    return $this;
  }
  
  public function isValid($data) {
    $valid = parent::isValid($data);
    if ($this->_idUsuario == null) return false;
    
    $values = $this->getValues();
    
    if (Mob_Loader::getModel("Usuarios")->getEmail($this->_idUsuario) != $values["email"]) {
      $this->email->addError("El email es incorrecto.");
      return false;
    }
      
    if ($values["email_nuevo1"] != $values["email_nuevo2"]) {
      $this->email_nuevo1->addError("Los emails no coinciden.");
      return false;
    }
    
    if (Mob_Loader::getModel("Usuarios")->emailExists($values["email_nuevo1"])) {
      $this->email_nuevo1->addError("Ya hay un usuario registrado con esa direccion de email.");
      return false;
    }
    
    return true;
  }

}