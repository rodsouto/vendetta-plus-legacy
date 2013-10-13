<?php

class Mob_Form_Configuracion extends Zend_Form {

  public function init() {
    $this->setAction("/mob/opciones/configuracion");
    $t = Zend_Registry::get("Zend_Translate");
    $this->addElement("select", "lang", array("label" => $t->_("Idioma")." (<a href='http://board.vendetta-plus.com/showthread.php?tid=596' target='_blank'>".$t->_("Colabora con una traduccion")."</a>)", 
                                                "multiOptions" => Mob_Data::getIdiomas(), 
                                                "value" => Zend_Registry::get("language")));
    $this->lang->getDecorator("label")->setOption("escape", false);
    $this->setDecorators(array("FormElements", "Form"));
    
    $this->addElement("submit", "configuracion", array("label" => "Guardar", "ignore" => true));
    
  }

  public function save($idUsuario) {
    $values = $this->getValues();
    
    Mob_Loader::getModel("Usuarios")->update(array("idioma" => $values["lang"]), "id_usuario = $idUsuario");
  }
}