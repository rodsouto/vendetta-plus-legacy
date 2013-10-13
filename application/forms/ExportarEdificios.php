<?php

class Mob_Form_ExportarEdificios extends Zend_Form {

    public function build(array $coordenadas) {

        $validatorsCoord1 = array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(51)));
        $validatorsCoord2 = array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(256)));
 
        $tableElementsDecorators = array(
                "ViewHelper",
                array(array("td" => "HtmlTag"), array("tag" => "th")),
                array(array("tr" => "HtmlTag"), array("tag" => "tr"))
              ); 
 
        foreach ($coordenadas as $n => $coord) {
          $value = explode(":", trim($coord));
          $subForm = new Zend_Form_SubForm(array("decorators" => array("FormElements")));
          $subForm->addElement("text", "coordx", array("size" => 3, "required" => true, 
                          "label" => "Nuevas coordenadas edificio $coord", "validators" => $validatorsCoord1,
                          "value" => $value[0],
                          "filters" => array("Int")));
          $subForm->addElement("text", "coordy", array("size" => 3, "required" => true, 
                          "validators" => $validatorsCoord1,
                          "value" => $value[1],
                          "filters" => array("Int")));
          $subForm->addElement("text", "coordz", array("size" => 3, "required" => true, 
                          "validators" => $validatorsCoord2,
                          "value" => $value[2],
                          "filters" => array("Int")));
  
          $subForm->coordx->setDecorators(array(
              "ViewHelper",
              array(array("th" => "HtmlTag"), array("openOnly" => true, "tag" => "th")),
              array("Label", array("tag" => "th")),
              array(array("tr" => "HtmlTag"), array("openOnly" => true, "tag" => "tr")),
          ));
          $subForm->coordy->setDecorators(array("ViewHelper"));
          $subForm->coordz->setDecorators(array("ViewHelper",
                      array(array("th" => "HtmlTag"), array("closeOnly" => true, "tag" => "th", "placement" => "append")),
                      array(array("tr" => "HtmlTag"), array("openOnly" => true, "tag" => "tr", "placement" => "append"))
          ));
          $this->addSubForm($subForm, "subForm".$n);
        }
    
        $this->setDecorators(array(
                "FormElements",
                array("HtmlTag", array("tag" => "table")), 
                "Form",
                array("Errors", array("placement" => "prepend"))))
                ->setElementDecorators($tableElementsDecorators);

        $this->addElement("submit", "pasoExportarEdificios", array("label" => "Listo!"));
    
    }
    
    public function isValid($data) {
        $isValid = parent::isValid($data);
        
        if (!$isValid) {
            foreach ($this->getElements() as $el) {
                $el->clearErrorMessages();
            }
            $this->setErrorMessages(array("No has ingresado una coordenada valida"));
            return false;
        }
        
        $isValid = true;
       
        $misCoords = array();

        foreach ($this->getValues() as $subForm => $coords) {
            if (isset($misCoords[$coords["coordx"].":".$coords["coordy"].":".$coords["coordz"]])) {
              $this->$subForm->coordx->getDecorator("tr")->setOption("style", "border: 1px solid red");
              $this->$misCoords[$coords["coordx"].":".$coords["coordy"].":".$coords["coordz"]]->coordx->getDecorator("tr")->setOption("style", "border: 1px solid red");
              $isValid = false;
            }
            $misCoords[$coords["coordx"].":".$coords["coordy"].":".$coords["coordz"]] = $subForm;
        
            $isValidPartial = Mob_Loader::getModel("Edificio")->getIdByCoord(
                        $coords["coordx"], $coords["coordy"], $coords["coordz"]) == 0;
            
            $isValid = $isValid && $isValidPartial;
            
            if (!$isValidPartial) {
                $this->$subForm->coordx->getDecorator("tr")->setOption("style", "border: 1px solid red");
            }
        }
                        
        if (!$isValid) {
            $this->markAsError()->setErrorMessages(array("Coordenada no disponible"));
            return false;
        }
        
        return true;
    }

}