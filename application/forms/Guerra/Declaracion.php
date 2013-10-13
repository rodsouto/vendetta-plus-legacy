<?php

class Mob_Form_Guerra_Declaracion extends Zend_Form {

  public function build($idEnemigo) {
    $this->setAction("/mob/familias/guerra?idf=".(int)Zend_Controller_Front::getInstance()->getRequest()->getParam("idf"));
    $this->addElement("textarea", "declaracion", array("label" => "Declaracion de guerra", "required" => true));
    $this->addElement("submit", "declarar", array("label" => "Declarar"));
    $this->addElement("hidden", "id_enemigo", array("value" => (int)$idEnemigo, "required" => true));
  }
  
  public function save($idFamilia) {
    return Mob_Loader::getModel("Guerras")->insert(array(
      "id_familia_1" => $idFamilia,
      "id_familia_2" => $this->id_enemigo->getValue(),
      "fecha_inicio" => date("Y-m-d H:i:s"),
      "fecha_fin" => "0000-00-00 00:00:00",
      "declaracion" => $this->declaracion->getValue(),
      "nombre_1" => Mob_Loader::getModel("Familias")->getNombre($idFamilia)." [".Mob_Loader::getModel("Familias")->getEtiqueta($idFamilia)."]",
      "nombre_2" => Mob_Loader::getModel("Familias")->getNombre($this->id_enemigo->getValue())." [".Mob_Loader::getModel("Familias")->getEtiqueta($this->id_enemigo->getValue())."]"  
    ));
  }

}