<?php

class Mob_Form_Username extends Zend_Form {

  protected $_idUsuario;

  public function init() {
    $this->setAction("/mob/opciones/name");
    $this->addElement("text", "username", array("label" => "Nuevo nombre de usuario", "required" => true, 
        "validators" => array(
          array("Db_NoRecordExists", true, array('table' => 'mob_usuarios', 'field' => 'login')),
          array("StringLength", false, array(4, 20))
        ),
        "errorMessages" => array("Ya existe un jugador registrado con ese nombre.")
      ));
    $this->addElement("password", "password", array("label" => "Introduce tu password", "required" => true));
    
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
                                     
    if (!$this->username->hasErrors()) {
      $validate = new Zend_Validate_Db_NoRecordExists(array('table' => 'mob_usuarios', 'field' => 'usuario'));
      
      if (!$validate->isValid($values["username"])) {
        $this->username->markAsError();
        return false;
      }
    }    
        
    if (Mob_Loader::getModel("Usuarios")->getPassword($this->_idUsuario) != $values["password"]) {
      $this->password->addError("El password es incorrecto");
      return false;
    }
    
    return true;
  }

}