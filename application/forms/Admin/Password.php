<?php

class Mob_Form_Admin_Password extends Zend_Form {

  protected $_idUsuario;

  public function init() {
    $this->setAction("");
    $passwordValidator = array("Alnum", array('StringLength', false, array(6, 20)));
    $this->addElement("text", "password", array("label" => "Nuevo Password", "required" => true, "validators" => $passwordValidator));    
    $this->addElement("submit", "cambiar", array("label" => "Cambiar"));
  }
  
  public function setIdUsuario($idUsuario) {
    $this->_idUsuario = $idUsuario;
    return $this;
  }

}