<?php

class Mob_Form_Guerra_Rendicion extends Zend_Form {

  // $type ==> 0 = rendicion; 1 = empate
  
  protected $_type;
  
  public function build($idEnemigo, $type) {
    $this->_type = (int)$type;
    $this->setAction("/mob/familias/rendicion?type=$type&idf=".(int)Zend_Controller_Front::getInstance()->getRequest()->getParam("idf"));
    $this->addElement("textarea", "declaracion", array("label" => $type == 0 ? "Declaracion de rendicion" : "Propuesta de empate", "required" => true));
    $this->addElement("submit", "declarar", array("label" => "Enviar"));
    $this->addElement("hidden", "id_enemigo", array("value" => (int)$idEnemigo, "required" => true));
  }
  
  public function save($idFamilia) {
    return Mob_Loader::getModel("Guerras_Rendicion")->insert(array(
      "id_familia_1" => $idFamilia,
      "id_familia_2" => $this->id_enemigo->getValue(),
      "fecha" => date("Y-m-d H:i:s"),
      "texto" => $this->declaracion->getValue(),
      "type" => $this->_type  
    ));
  }

}