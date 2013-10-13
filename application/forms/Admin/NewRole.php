<?php

class Mob_Form_Admin_NewRole extends Zend_Form {

  
  public function init() {
    $this->addElement("text", "id_usuario", array("label" => "Id usuario", "required" => true,
    "validators" => array(
          array("Db_RecordExists", false, array('table' => 'mob_usuarios', 'field' => 'id_usuario')),
          "Digits"
        )));
    
    $this->addElement("select", "role", array("label" => "Cargo", "required" => true, "multiOptions" => Mob_Loader::getModel("Roles")->getRoles()));
        
    $this->addElement("submit", "new", array("label" => "Agregar"));
  }
  
  public function save() {
    try {
      Mob_Loader::getModel("Roles")->insert(array("id_usuario" => $this->id_usuario->getValue(), "id_rol" => $this->role->getValue()));
    } catch (Exception $e) {
      
    }
  }
  
}