<?php

class Mob_Form_Misiones_Recursos extends Zend_Form_SubForm {

    public function init() {
        $validatorsNumber = array("Int", array("GreaterThan", false, array(-1)));

        $tableElementsDecorators = array(
                "ViewHelper",
                array(array("td" => "HtmlTag"), array("tag" => "th")),
                array("Label", array("tag" => "th")),
                array(array("tr" => "HtmlTag"), array("tag" => "tr"))
              ); 
        
        foreach (array("arm", "mun", "alc", "dol") as $recurso) {
            $this->addElement("text", "recursos_".$recurso, array(
                                    "label" => $this->getView()->t("recursos_".$recurso), 
                                    "validators" => $validatorsNumber,
                                    "size" => 10
                                    ));
        }
        
        $this->setDecorators(array(
            array(array("Titulo" => "HtmlContent")),
            array(array("Error" => "HtmlContent")), 
            "FormElements"
            ))->setElementDecorators($tableElementsDecorators);

        $this->addPrefixPath('Mob_Decorator', 'Mob/Decorator/', 'decorator');        
        $this->getDecorator("Titulo")->setOption("html", "<tr><td colspan='2' class='c'>".$this->getView()->t("Recursos (Solo para transporte)")."</td></tr>");
   
    }
    
    public function isValid($data) {
        $isValid = parent::isValid($data);
        
        if (!$isValid) {
            $this->getDecorator("Error")->setOption("html", "<tr><td class='f' colspan=2>".$this->getView()->t("Error: inserta una cantidad de recursos valida")."</td></tr>");
        }        
        
        return $isValid;
    }

}