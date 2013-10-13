<?php

class Mob_Form_Banear extends Zend_Form {

  public function init() {
    $this->addElement("text", "id_usuario", array("label" => "Id usuario a banear", "required" => true, "filters" => array("Int")));
    $this->addElement("text", "fecha_fin", array("label" => "Fecha fin baneo (yyyy-mm-dd)", "required" => true, "validators" => array("Date")));
    $this->addElement("textarea", "motivo", array("label" => "Motivo", "required" => true));
    $this->addElement("submit", "siguiente", array("label" => "Siguiente"));
  }

}