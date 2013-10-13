<?php

class Mob_Form_TestBar extends Zend_Form {

  public function init() {
    
    $edificio = Zend_Registry::get("jugadorActual")->getEdificioActual();
    
    $this->setName("testBar");
    
    $subFormDecorators = array("FormElements", array("HtmlTag", array("class" => "testSubForm")), array("Description", array("tag" => "h3", "placement" => "prepend", "escape" => false)));
    
    $elementDecorators = array(
          "Label",
          "ViewHelper", 
          array(array("d1" => "HtmlTag"), array("class" => "elWrapper")),
        );
        
    $subFormTropas = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "description" => "<a href='#' class='linkTest'>Tropas</a>"));
    foreach (Mob_Data::getTropas() as $tropa) {
      $subFormTropas->addElement("text", lcfirst($tropa), array("filter" => array("Int"), 
                      "label" => Mob_Loader::getTropa($tropa)->getNombre(), "value" => Mob_Loader::getModel("Tropa")->getCantidad($tropa, $edificio->getId())));
    }
    $this->addSubForm($subFormTropas, "tropas");
    
    $subFormEntrenamientos = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "description" => "<a href='#' class='linkTest'>Entrenamientos</a>"));    
    foreach (Mob_Data::getEntrenamientos() as $ent) {
      $subFormEntrenamientos->addElement("text", lcfirst($ent), array("filter" => array("Int"), 
                      "label" => Mob_Loader::getEntrenamiento($ent)->getNombre(), "value" => $edificio->getEntrenamiento($ent)->getNivel()));
    }    
    $this->addSubForm($subFormEntrenamientos, "entrenamientos");
    
    $subFormHabitaciones = new Zend_Form_SubForm(array("decorators" => $subFormDecorators, "description" => "<a href='#' class='linkTest'>Habitaciones</a>"));    
    foreach (Mob_Data::getHabitaciones() as $hab) {
      $subFormHabitaciones->addElement("text", lcfirst($hab), array("filter" => array("Int"), 
                      "label" => Mob_Loader::getHabitacion($hab)->getNombre(), "value" => $edificio->getHabitacion($hab)->getNivel()));
    }        
    $this->addSubForm($subFormHabitaciones, "habitaciones");
    
    $subFormTropas->setElementDecorators($elementDecorators);
    $subFormEntrenamientos->setElementDecorators($elementDecorators);
    $subFormHabitaciones->setElementDecorators($elementDecorators);
    
    $this->setDecorators(array("FormElements", "Form"));
    
    $this->addElement("submit", "guardarTest", array("label" => "Guardar"));
    
  }

}