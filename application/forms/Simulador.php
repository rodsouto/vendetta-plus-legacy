<?php

class Mob_Form_Simulador extends Zend_Form {

  public function init() {
    
    $subFormDecorators = array("FormElements", "Fieldset");
    
    $subFormAtacante = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Tropas Atacante"));
    $subFormDefensor = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Tropas Defensor"));

    $subFormAtacante->addElement("text", "id_atacante", array("label" => "Id atacante"));
    $subFormDefensor->addElement("text", "id_defensor", array("label" => "Id defensor"));
    
    foreach (Mob_Data::getTropas() as $tropa) {
      $subFormAtacante->addElement("text", "tropa_".lcfirst($tropa), array("label" => Mob_Loader::getTropa($tropa)->getNombre()));
      $subFormDefensor->addElement("text", "tropa_".lcfirst($tropa), array("label" => Mob_Loader::getTropa($tropa)->getNombre()));
    }
    
    /*$subFormEntAtacante = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Entrenamientos Atacante"));
    $subFormEntDefensor = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "legend" => "Entrenamientos Defensor"));
    
    foreach (Mob_Data::getEntrenamientos() as $ent) {
      $subFormEntAtacante->addElement("text", "ent_".lcfirst($ent), array("label" => Mob_Loader::getEntrenamiento($ent)->getNombre()));
      $subFormEntDefensor->addElement("text", "ent_".lcfirst($ent), array("label" => Mob_Loader::getEntrenamiento($ent)->getNombre()));
    } */
    
    $this->addSubForm($subFormAtacante, "trpAt");
    //$this->addSubForm($subFormEntAtacante, "entAt");
    $this->trpAt->addDecorator("HtmlTag", array("style" => "float: left;width: 50%")); //"openOnly" => true, 
    //$this->entAt->addDecorator("HtmlTag", array("closeOnly" => true));
    
    $this->addSubForm($subFormDefensor, "trpDef");
    //$this->addSubForm($subFormEntDefensor, "entDef");
    $this->trpDef->addDecorator("HtmlTag", array("style" => "float: right;width: 50%")); //"openOnly" => true, 
    //$this->entDef->addDecorator("HtmlTag", array("closeOnly" => true));
    
    /*$this->setElementDecorators(array("Label", "ViewHelper"));
    $this->trpAt->setElementDecorators(array("Label", "ViewHelper"));
    $this->entAt->setElementDecorators(array("Label", "ViewHelper"));
    $this->trpDef->setElementDecorators(array("Label", "ViewHelper"));
    $this->entDef->setElementDecorators(array("Label", "ViewHelper"));*/
    
    $this->setDecorators(array("FormElements", "Form"));
    
    $this->addElement("submit", "simular", array("label" => "simular", "ignore" => true));
    
  }

}