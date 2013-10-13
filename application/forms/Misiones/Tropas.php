<?php

class Mob_Form_Misiones_Tropas extends Zend_Form_SubForm {

    protected $_tropas;
    protected $_infoTropas;
    protected $_tropasMision;
    
    public function getInfoTropas() {
        return $this->_infoTropas;
    }
    
    public function getTropasMision() {
        return $this->_tropasMision;
    }
    
    public function build($tropas) {

        $this->_tropas = $tropas;

        $validatorsNumber = array("Digits", array("GreaterThan", false, array(-1))); 
        
        $tableElementsDecorators = array(
                "ViewHelper",
                array(array("td" => "HtmlTag"), array("tag" => "th")),
                array("Label", array("tag" => "th")),
                array(array("tr" => "HtmlTag"), array("tag" => "tr"))
              ); 
        
        foreach($tropas as $k => $tropa) {
            $this->addElement("text", "tropa_".$k, 
                                                array("label" => $tropa->getNombre()." (".$this->getView()->numberFormat($tropa->getCantidad()).")", 
                                                "value" => 0,
                                                "validators" => $validatorsNumber,
                                                "filters" => array("Int"),
                                                "size" => 10
                                                )
                                    );
        }
        
        $htmlHeader = "<tr><td colspan='2' class='c'>".$this->getView()->t("Planificar nuevo ataque")."</td></tr>";
        $htmlThTable = "<tr><th>".$this->getView()->t("Tropas")."</th><th>".$this->getView()->t("Cantidad")."</th></tr>";
        
        $this->setDecorators(array(
                    array(array("Titulo" => "HtmlContent"), array("html" => $htmlHeader)),
                    array(array("Error" => "HtmlContent")),
                    array(array("Th" => "HtmlContent"), array("html" => $htmlThTable)), 
                    "FormElements",
                    array(array("Info" => "HtmlContent")),
                    ))
                ->setElementDecorators($tableElementsDecorators);

        $this->addPrefixPath('Mob_Decorator', 'Mob/Decorator/', 'decorator');

    }

    public function isValid($data) {
        
        parent::isValid($data);
        
        $edificio = Zend_Registry::get("jugadorActual")->getEdificioActual();
        $hayTropas = false;
        $infoTropas = array("total" => 0, "salario" => 0, "vmax" => 0, 
                            "carga" => 0, "ataque" => 0, "defensa" => 0);
        foreach ($this->getElements() as $tropa) {
            if ($tropa->getValue() == 0) continue;
            $nombreTropa = end(explode("_", $tropa->getName()));
            $modelTropa = $edificio->getTropa($nombreTropa);
            
            if ($infoTropas["vmax"] == 0) $infoTropas["vmax"] = $modelTropa->getVelocidad();
            
            $infoTropas["total"] += $tropa->getValue();
            $infoTropas["salario"] += $modelTropa->getSalario() * $tropa->getValue();
            $infoTropas["vmax"] = min($infoTropas["vmax"], $modelTropa->getVelocidad());
            $infoTropas["carga"] += $modelTropa->getCapacidad() * $tropa->getValue();
            $infoTropas["ataque"] += $modelTropa->getAtaque() * $tropa->getValue();
            $infoTropas["defensa"] += $modelTropa->getDefensa() * $tropa->getValue();
            
            // miro si la cantidad de tropas esta bien
            if ($tropa->getValue() > $this->_tropas[$nombreTropa]->getCantidad()) {
                $hayTropas = false;
                break;
            }
            
            if ($tropa->getValue() > 0) {
                $this->_tropasMision[$nombreTropa] = $tropa->getValue();
                $hayTropas = true;
            }
        }
        
        $this->_infoTropas = $infoTropas;
        
        if (!$hayTropas) {
            $htmlError = "<tr><td class='f' colspan=2>".$this->getView()->t("Error: Por favor, elige tus unidades primero!")."</td></tr>";
            $this->getDecorator("Error")->setOption("html", $htmlError);
            return false;
        }
        
        $tropasActualizacionTxt = "<tr><td colspan='2' class='c'>".$this->getView()->t("Unidades seleccionadas")."</td></tr>";
        $textosInfoTropas = array("total" => $this->getView()->t("Total de Unidades"), 
                                    "salario" => $this->getView()->t("Salario"), 
                                    "vmax" => $this->getView()->t("Vmax. (unidad más lenta)"),
                                    "carga" => $this->getView()->t("Capacidad de carga"), 
                                    "ataque" => $this->getView()->t("Puntuación de ataque"), 
                                    "defensa" => $this->getView()->t("Valor de defensa"));
                                    
        foreach ($infoTropas as $k => $v) {
            $tropasActualizacionTxt .= "<tr><th>".$textosInfoTropas[$k]."</th><th>".$this->getView()->numberFormat($v)."</th></tr>";    
        }

        $this->getDecorator("Info")->setOption("html", $tropasActualizacionTxt);
        
        return true;

    }

}