<?php

class Mob_Form_Mensajes_NuevaCarpeta extends Zend_Form {

  protected $_idCarpeta = null;

  public function init() {
    $this->setAction("/mob/mensajes/administrar");
    $this->addElement("text", "nombre", array("label" => "Nombre carpeta", "required" => true, "validators" => array(
      array("StringLength", false, array(1, 30)),
      array("Alnum", false, array(true))    
    )));
    $this->addElement("submit", "guardar", array("label" => "Guardar", "ignore" => true));
  }
  
  public function save($idUsuario) {
    $values = $this->getValues();
    
    if (!empty($this->_idCarpeta)) {
      return Mob_Loader::getModel("Mensajes_Carpetas")->update($values, "id_carpeta = ".(int)$this->_idCarpeta." AND id_usuario = ".(int)$idUsuario);
    }
    
    $values["id_usuario"] = (int)$idUsuario;
    return Mob_Loader::getModel("Mensajes_Carpetas")->insert($values);
  }
  
  public function setEditar($idCarpeta) {
    $this->_idCarpeta = (int)$idCarpeta;
    
    $this->nombre->setValue(Mob_Loader::getModel("Mensajes_Carpetas")->getNombre($this->_idCarpeta));
    $this->addElement("hidden", "editar", array("value" => $idCarpeta, "ignore" => true));  
  }

}