<?php

class Mob_Form_SimuladorFull extends Zend_Form {

  public function init() {
    $this->setAction("/mob/index/simulador")->setMethod("get");
    $subFormDecorators = array("FormElements", "Fieldset");
    
    $subFormAtacante = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Tropas Atacante"));
    $subFormDefensor = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Tropas Defensor"));

    $subFormAtacante->addElement("text", "cant_edificios_at", array("filter" => array("Int"), "label" => "Cantidad edificios"));
    $subFormDefensor->addElement("text", "cant_edificios_def", array("filter" => array("Int"), "label" => "Cantidad edificios"));
    
    foreach (Mob_Data::getTropas() as $tropa) {
      $subFormAtacante->addElement("text", "tropa_".lcfirst($tropa), array("filter" => array("Int"), "label" => Mob_Loader::getTropa($tropa)->getNombre()));
      $subFormDefensor->addElement("text", "tropa_".lcfirst($tropa), array("filter" => array("Int"), "label" => Mob_Loader::getTropa($tropa)->getNombre()));
    }
    
    $subFormEntAtacante = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Entrenamientos Atacante"));
    $subFormEntDefensor = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Entrenamientos Defensor"));
    
    foreach (Mob_Data::getEntrenamientos() as $ent) {
      $subFormEntAtacante->addElement("text", "ent_".lcfirst($ent), array("filter" => array("Int"), "label" => Mob_Loader::getEntrenamiento($ent)->getNombre()));
      $subFormEntDefensor->addElement("text", "ent_".lcfirst($ent), array("filter" => array("Int"), "label" => Mob_Loader::getEntrenamiento($ent)->getNombre()));
    }
    
    $this->addSubForm($subFormAtacante, "trpAt");
    $this->addSubForm($subFormEntAtacante, "entAt");
    $this->trpAt->addDecorator("HtmlTag", array("openOnly" => true,"style" => "float: left;width: 50%")); // 
    $this->entAt->addDecorator("HtmlTag", array("closeOnly" => true));
    
    $this->addSubForm($subFormDefensor, "trpDef");
    $this->addSubForm($subFormEntDefensor, "entDef");
    $this->trpDef->addDecorator("HtmlTag", array("openOnly" => true, "style" => "float: right;width: 50%")); // 
    $this->entDef->addDecorator("HtmlTag", array("closeOnly" => true));
    
    /*$this->setElementDecorators(array("Label", "ViewHelper"));
    $this->trpAt->setElementDecorators(array("Label", "ViewHelper"));
    $this->entAt->setElementDecorators(array("Label", "ViewHelper"));
    $this->trpDef->setElementDecorators(array("Label", "ViewHelper"));
    $this->entDef->setElementDecorators(array("Label", "ViewHelper"));*/
    
    $this->setDecorators(array("FormElements", "Form"));
    
    $this->addElement("submit", "simular", array("label" => "simular", "ignore" => true));
    
  }

}
