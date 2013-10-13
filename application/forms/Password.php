<?php

class Mob_Form_Password extends Zend_Form {

  protected $_idUsuario;

  public function init() {
    $this->setAction("/mob/opciones/password");
    $passwordValidator = array("Alnum", array('StringLength', false, array(6, 20)));
    $this->addElement("password", "password", array("label" => "Password actual", "required" => true));
    $this->addElement("password", "password_nuevo1", array("label" => "Password nuevo", "required" => true, "validators" => $passwordValidator));
    $this->addElement("password", "password_nuevo2", array("label" => "Repite tu password", "required" => true));
    
    $this->addElement("submit", "cambiar", array("label" => "Cambiar"));
  }
  
  public function setIdUsuario($idUsuario) {
    $this->_idUsuario = $idUsuario;
    return $this;
  }
  
  public function isValid($data) {
    $valid = parent::isValid($data);
    if (!$valid) return false;
    if ($this->_idUsuario == null) return false;
    
    $values = $this->getValues();
    
    if (Mob_Loader::getModel("Usuarios")->getPassword($this->_idUsuario) != $values["password"]) {
      $this->password->addError("El password es incorrecto");
      return false;
    }
      
    if ($values["password_nuevo1"] != $values["password_nuevo2"]) {
      $this->password_nuevo1->addError("Los passwords no coinciden");
      return false;
    }
    
    return true;
  }

}