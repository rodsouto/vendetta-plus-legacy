<?php

class Mob_Form_Misiones_Coordenadas extends Zend_Form_SubForm {

    protected $_formTropas;
    protected $_duracion;
    protected $_salario;
    protected $_carga;
    protected $_idUsuarioDestino;
    
    public function getIdUsuarioDestino() {
        return $this->_idUsuarioDestino;
    }
    
    public function getDuracion() {
        return $this->_duracion;
    }
    
    public function setDuracion($duracion) {
        $this->_duracion = $duracion;
        return $this;
    }
    
    public function getSalario() {
        //return 1;
        return $this->_salario;
    }
    
    public function setSalario($salario) {
        $this->_salario = $salario;
        return $this;
    }
    
    public function setCarga($carga) {
        $this->_carga = $carga;
        return $this;
    }

    public function getCarga() {
        return $this->_carga - $this->getSalario();
    }    
    
    public function setFormTropas(Mob_Form_Misiones_Tropas $form) {
        $this->_formTropas = $form;
        return $this; 
    }
    
    public function getMision() {
      $multi = $this->mision->getMultiOptions();
      return $multi[$this->mision->getValue()];  
    }
    
    public function getTipoMision() {
        $mision = $this->mision->getValue();
        // si la mision forma parte de un trato de comercio, el tipo es 3
        return substr($mision, 0, 2) == "m_" ? 3 : $mision;
    }

    public function init() {

        $edificio = Zend_Registry::get("jugadorActual")->getEdificioActual();

        $validatorsCoord1 = array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(51)));
        $validatorsCoord2 = array("Int", array("GreaterThan", false, array(0)), array("LessThan", false, array(256)));
 
        $tableElementsDecorators = array(
                "ViewHelper",
                array(array("td" => "HtmlTag"), array("tag" => "th")),
                array("Label", array("tag" => "th")),
                array(array("tr" => "HtmlTag"), array("tag" => "tr"))
              ); 
 
        $this->addElement("text", "coordx", array("size" => 3, "required" => true, 
                        "value" => $edificio->getData("coord1"), "label" => "Edificio", "validators" => $validatorsCoord1,
                        "filters" => array("Int")));
        $this->addElement("text", "coordy", array("size" => 3, "required" => true, 
                        "value" => $edificio->getData("coord2"), "validators" => $validatorsCoord1,
                        "filters" => array("Int")));
        $this->addElement("text", "coordz", array("size" => 3, "required" => true, 
                        "value" => $edificio->getData("coord3"), "validators" => $validatorsCoord2,
                        "filters" => array("Int")));
                                              
        if (strtotime("2010-10-29 07:00:00") < time()) {
            $misiones = array(
              1 => "mision_1", 
              2 => "mision_2", 
              3 => "mision_3", 
              4 => "mision_4"
            );
        } else {
            $misiones = array( 
              2 => "mision_2", 
              3 => "mision_3"
            );        
        }
        
        $idUsuario = $edificio->getJugador()->getIdUsuario();
        
        $numberFormat = Mob_Loader::getClass("View_Helper_NumberFormat");
        
        foreach (Mob_Loader::getModel("Mercado")->getEnCurso($idUsuario) as $v) {
            if ($v["id_vendedor"] == $idUsuario && $v["cantidad"] - $v["cantidad_dev"] > 0) {
                $misiones["m_".$v["id_mercado"]] = "Comercio con ".Mob_Loader::getModel("Usuarios")->getFullName($v["id_comprador"])." - ".$this->getTranslator()->_("recursos_".$v["recurso"]).": ".$numberFormat->numberFormat($v["cantidad"]-$v["cantidad_dev"]);
            } else {
                $txtMercado = array();
                foreach (array("arm", "mun", "dol") as $rec) {
                    if ($v["compra_".$rec] && $v["compra_".$rec] - $v["compra_".$rec."_dev"] > 0) $txtMercado[] = $this->getTranslator()->_("recursos_".$rec).": ".$numberFormat->numberFormat($v["compra_".$rec]-$v["compra_".$rec."_dev"]);
                }
                $misiones["m_".$v["id_mercado"]] = "Comercio con ".Mob_Loader::getModel("Usuarios")->getFullName($v["id_vendedor"])." - ".implode(", ", $txtMercado);
            }
        }
        
        $this->addElement("select", "mision", array("label" => "Mision", "multiOptions" => $misiones));
        $this->setDecorators(array(
                array(array("Titulo" => "HtmlContent")),
                array(array("Error" => "HtmlContent")),
                "FormElements",
                array(array("Info" => "HtmlContent"))
                ))
                ->setElementDecorators($tableElementsDecorators);

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

        $this->addPrefixPath('Mob_Decorator', 'Mob/Decorator/', 'decorator');        
        $this->getDecorator("Titulo")->setOption("html", "<tr><td colspan='2' class='c'>".$this->getView()->t("Edificio de destino")."</td></tr>");
    
    }
    
    public function isValid($data) {
        $isValid = parent::isValid($data);

        if (!$isValid) {
            $htmlError = "<tr><td class='f' colspan=2>".$this->getView()->t("Error: Introduce una coordenada valida")."</td></tr>";
            $this->getDecorator("Error")->setOption("html", $htmlError);
        }

        $idUsuarioDestino = $this->_idUsuarioDestino = Mob_Loader::getModel("Edificio")->getUsuarioByCoord(
                                    $this->coordx->getValue(),
                                    $this->coordy->getValue(),
                                    $this->coordz->getValue(),
                                    true
        );

        if ($this->mision->getValue() == 1 && $idUsuarioDestino == Zend_Registry::get("jugadorActual")->getIdUsuario()) {
            $htmlError = "<tr><td class='f' colspan=2>".$this->getView()->t("Error: No puedes atacarte a ti mismo")."</td></tr>";
            $this->getDecorator("Error")->setOption("html", $htmlError);
            return false;
        }
        
        if (Mob_Loader::getModel("Edificio")->getIdByCoord($this->coordx->getValue(), $this->coordy->getValue(), $this->coordz->getValue()) == 
             Zend_Registry::get("jugadorActual")->getEdificioActual()->getId()) {
            $htmlError = "<tr><td class='f' colspan=2>".$this->getView()->t("Error: El edificio origen y el edificio destino no pueden ser el mismo")."</td></tr>";
            $this->getDecorator("Error")->setOption("html", $htmlError);
            return false;
        }

        $edificio = Zend_Registry::get("jugadorActual")->getEdificioActual();

        $infoTropas = $this->_formTropas->getInfoTropas();

        $d = $edificio->getDistancia(
                                    $this->coordx->getValue(),
                                    $this->coordy->getValue(),
                                    $this->coordz->getValue()
                                    );

        $this->setDuracion(round(pow(($d* 3.3479)/$infoTropas["vmax"], 0.2)*3600));

        $userEdificio = Mob_Loader::getModel("Edificio")->getUsuarioByCoord($this->coordx->getValue(), $this->coordy->getValue(), $this->coordz->getValue());
        if (empty($userEdificio)) $userEdificio = $this->getView()->t("A nadie");
        
        $this->setSalario(floor(pow($d,0.8 ) * $infoTropas["salario"] / 2512));
        $this->setCarga($infoTropas["carga"]);
        $misionActualizacion = array(
                                "Este edificio pertenece a" => $userEdificio, 
                                "Distancia entre edificios" => $this->getView()->numberFormat($d),
                                "Salario (Dólar)" =>  $this->getView()->numberFormat($this->getSalario()),
                                "Capacidad de carga (-Salario)" => $this->getView()->numberFormat($this->getCarga()), 
                                "Duración de la misión" => Mob_Timer::timeFormat($this->getDuracion())
                                
                            );

          $misionActualizacionTxt = "";
          foreach ($misionActualizacion as $k => $v) {                            
              $misionActualizacionTxt .= "<tr><th>".$this->getView()->t($k)."</th><th>$v</th></tr>";
          }
          
          $this->getDecorator("Info")->setOption("html",
              "<tr><td colspan='2' class='c'>".$this->getView()->t("Misión desde")." ".
              $edificio->getData("coord1")
              .":".$edificio->getData("coord2")
              .":".$edificio->getData("coord3")." >>>> ".
              $this->coordx->getValue().":".
              $this->coordy->getValue().":".
              $this->coordz->getValue()."</td></tr>".$misionActualizacionTxt);    
              
          return $isValid;    

    }

}