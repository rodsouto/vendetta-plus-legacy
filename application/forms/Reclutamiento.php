<?php

class Mob_Form_Reclutamiento extends Zend_Form {

    public function init() {
        $this->setAction("/mob/".Zend_Controller_Front::getInstance()->getRequest()->getControllerName());
        $this->setAttrib("class", "frmReclutamiento");
        $this->addElement("text", "total", array("required" => true, "class" => "totalTropas", "value" => 0,
        "validators" => array(
            array("GreaterThan", false, array(0))
        )));
        $this->addElement("submit", "crear", array("required" => true, "label" => "Ir!"));
        $this->addElement("button", "max", array("label" => "Max"));
     
        $this->addElement("hidden", "tropa");
        
        $this->setDecorators(array("FormElements", "Form"));
        $this->setElementDecorators(array("ViewHelper"));
    }
    
    public function setTropa($tropa) {
        $this->total->setAttrib("id", "total_".$tropa);
        $this->tropa->setValue($tropa);
        return $this;
    }
    
    public function setMaxTropas($max) {
      $this->max->setAttrib("onclick", "$('#total_".$this->tropa->getValue()."').val($max);");
      return $this;
    }

}