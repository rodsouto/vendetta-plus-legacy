<?php

class Mob_Form_Coordenadas extends Zend_Form {

    public function init() {

        $validatorsCoord1 = array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(51)));
        $validatorsCoord2 = array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(256)));
 
        $tableElementsDecorators = array(
                "ViewHelper",
                array(array("td" => "HtmlTag"), array("tag" => "th")),
                array(array("tr" => "HtmlTag"), array("tag" => "tr"))
              ); 
 
        $this->addElement("text", "coordx", array("size" => 3, "required" => true, 
                        "label" => "Coordenadas", "validators" => $validatorsCoord1,
                        "filters" => array("Int")));
        $this->addElement("text", "coordy", array("size" => 3, "required" => true, 
                        "validators" => $validatorsCoord1,
                        "filters" => array("Int")));
        $this->addElement("text", "coordz", array("size" => 3, "required" => true, 
                        "validators" => $validatorsCoord2,
                        "filters" => array("Int")));
        
        $this->setDecorators(array(
                "FormElements",
                array("HtmlTag", array("tag" => "table")), 
                "Form",
                array("Errors", array("placement" => "prepend"))))
                ->setElementDecorators($tableElementsDecorators);

        $this->addElement("submit", "pasoCoordenadas", array("label" => "Listo!"));

        $this->coordx->setDecorators(array(
            "ViewHelper",
            array(array("th" => "HtmlTag"), array("openOnly" => true, "tag" => "th")),
            array("Label", array("tag" => "th")),
            array(array("tr" => "HtmlTag"), array("openOnly" => true, "tag" => "tr")),
        ));
        $this->coordy->setDecorators(array("ViewHelper"));
        $this->coordz->setDecorators(array("ViewHelper",
                    array(array("th" => "HtmlTag"), array("closeOnly" => true, "tag" => "th", "placement" => "append")),
                    array(array("tr" => "HtmlTag"), array("openOnly" => true, "tag" => "tr", "placement" => "append"))
        ));
    
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
        
        $isValid = Mob_Loader::getModel("Edificio")->getIdByCoord(
                    $this->coordx->getValue(), $this->coordy->getValue(),
                    $this->coordz->getValue()) == 0;
                        
        if (!$isValid) {
            $this->markAsError()->setErrorMessages(array("Coordenada no disponible"));
            return false;
        }
        
        return true;
    }

}