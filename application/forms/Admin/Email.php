<?php

class Mob_Form_Admin_Email extends Zend_Form {

  protected $_idUsuario;

  public function init() {
    $this->setAction("");
    $this->addElement("text", "email", array("label" => "Nuevo email", "required" => true, "validators" => array("EmailAddress")));    
    $this->addElement("submit", "cambiar", array("label" => "Cambiar"));
  }
  
  public function setIdUsuario($idUsuario) {
    $this->email->setValue(Mob_Loader::getModel("Usuarios")->getEmail($idUsuario));
    $this->_idUsuario = $idUsuario;
    return $this;
  }
  
  public function isValid($data) {
    $valid = parent::isValid($data);
    if ($this->_idUsuario == null && !$valid) return false;
    
    $values = $this->getValues();
    
    if (Mob_Loader::getModel("Usuarios")->emailExists($values["email"])) {
      $this->email->addError("Ya hay un usuario registrado con esa direccion de email.");
      return false;
    }
    
    return true;
  }

}