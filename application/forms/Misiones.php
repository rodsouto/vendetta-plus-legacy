<?php

class Mob_Form_Misiones extends Zend_Form {

    protected $_tropas;
    protected $_edificio;
    
    public function build(array $tropas) {       
        $this->setAction("/mob/misiones");
        $this->_tropas = $tropas;
        $this->_edificio = Zend_Registry::get("jugadorActual")->getEdificioActual();        
                
        $subFormTropas = new Mob_Form_Misiones_Tropas;
        $subFormTropas->build($tropas);
        $this->addSubform($subFormTropas, "subFormTropas");
        
        $subFormCoordenadas = new Mob_Form_Misiones_Coordenadas;
        $subFormCoordenadas->setFormTropas($subFormTropas);
        $this->addSubform($subFormCoordenadas, "subFormCoordenadas");
        
        $this->addSubform(new Mob_Form_Misiones_Recursos, "subFormRecursos");
                
        $this->addElement("submit", "actualizar", array("label" => "Actualizar"));
        $this->addElement("submit", "enviar", array("label" => "Enviar"));
        
        $this->actualizar->setDecorators(array(
            "ViewHelper",
            array(array("th" => "HtmlTag"), array("tag" => "th", "openOnly" => true, "colspan" => 2)),
            array(array("tr" => "HtmlTag"), array("tag" => "tr", "openOnly" => true))
        ));
        
        $this->enviar->setDecorators(array(
            "ViewHelper",
            array(array("th" => "HtmlTag"), array("tag" => "th", "closeOnly" => true)),
            array(array("tr" => "HtmlTag"), array("tag" => "tr", "closeOnly" => true))
        ));
        
        $this->setDecorators(array("FormElements", array("HtmlTag", array("tag" => "table")), "Form"));
    }

    public function esActualizacion() {
        return $this->actualizar->getValue() !== NULL;
    }
    
    public function isValid($data) {
        $isValid = parent::isValid($data);
        
        if (!$isValid) return false;
        
        $idUsuarioDestino = $this->subFormCoordenadas->getIdUsuarioDestino();
        
        if (Mob_Loader::getModel("Vacaciones")->estaDeVacaciones($idUsuarioDestino)) {
            $this->subFormTropas->getDecorator("Error")->setOption("html", "<tr><td class='f' colspan=2>".$this->getView()->t("Error: Los chicos estan de vacaciones, vuelve a intentarlo mas tarde!")."</td></tr>");
            return false;  
        }
        
        $valueRec = $this->subFormRecursos->getValues();
        $valueRec = $valueRec["subFormRecursos"];
        $totalRecs = 0;        
        foreach (array("arm", "mun", "alc", "dol") as $rec) {
        
            if ($rec == "dol") {
                $valueRec["recursos_dol"] += $this->subFormCoordenadas->getSalario();
            }
        
            if ($valueRec["recursos_".$rec] > $this->_edificio->getTotalRecurso($rec)) {
                $this->subFormTropas->getDecorator("Error")->setOption("html", "<tr><td class='f' colspan=2>".$this->getView()->t("Error: ¡No dispones de suficientes recursos!")."</td></tr>");
                return false;
            }
            
            $totalRecs += $valueRec["recursos_".$rec]; 
        }
        
        if ($totalRecs > $this->subFormCoordenadas->getCarga()) {
            $this->subFormTropas->getDecorator("Error")->setOption("html", "<tr><td class='f' colspan=2>".$this->getView()->t("Error: ¡No dispones de suficiente capacidad de almacenamiento!")."</td></tr>");
            return false;
        } 
        
        return true;
    }
    
    public function save($idUsuario) {
    
        $mision = $this->subFormCoordenadas->getTipoMision();
        
        $cantidad = array_sum($this->subFormTropas->getTropasMision());
        
        $coord1 = $this->subFormCoordenadas->coordx->getValue();
        $coord2 = $this->subFormCoordenadas->coordy->getValue();
        $coord3 = $this->subFormCoordenadas->coordz->getValue();
        
        // al cambiar algo aca seguramente tambien haya que cambiarlo en el plugin update 
        Mob_Loader::getModel("Misiones")->insert(array(
          "tropas" => Zend_Json::encode($this->subFormTropas->getTropasMision()),
          "cantidad" => $cantidad,
          "coord_dest_1" => $coord1,
          "coord_dest_2" => $coord2,
          "coord_dest_3" => $coord3,
          "coord_orig_1" => $this->_edificio->getData("coord1"),
          "coord_orig_2" => $this->_edificio->getData("coord2"),
          "coord_orig_3" => $this->_edificio->getData("coord3"),
          "mision" => $mision,
          "recursos_arm" => $recursos_arm = $mision == 3 ? $this->subFormRecursos->recursos_arm->getValue() : 0,
          "recursos_mun" => $recursos_mun = $mision == 3 ? $this->subFormRecursos->recursos_mun->getValue() : 0,
          "recursos_alc" => $recursos_alc = $mision == 3 ? $this->subFormRecursos->recursos_alc->getValue() : 0,
          "recursos_dol" => $recursos_dol = $mision == 3 ? $this->subFormRecursos->recursos_dol->getValue() : 0,
          "fecha_inicio" => date("Y-m-d H:i:s"),
          "fecha_fin" => date("Y-m-d H:i:s", time()+$this->subFormCoordenadas->getDuracion()),
          "duracion" => $this->subFormCoordenadas->getDuracion(),
          "id_usuario" => $idUsuario
        ));
        
        $this->_edificio->restarTropas($this->subFormTropas->getTropasMision());
        
        $idUsuarioDefensor = Mob_Loader::getModel("Edificio")->getUsuarioByCoord($this->subFormCoordenadas->coordx->getValue(), 
        $this->subFormCoordenadas->coordy->getValue(), $this->subFormCoordenadas->coordz->getValue(), true);
        
        Mob_Cache_Factory::getInstance("query")->remove('getMisiones'.$idUsuario);
        Mob_Cache_Factory::getInstance("html")->remove('tropasVisionGeneral'.$this->_edificio->getId());
        if ($idUsuarioDefensor != $idUsuario && !empty($idUsuarioDefensor)) {
          Mob_Cache_Factory::getInstance("query")->remove('getMisiones'.$idUsuarioDefensor);
          
          Mob_Loader::getModel("Mensajes")->aviso($idUsuarioDefensor, "tropas_en_camino", 
                                      "$cantidad tropas de <a href='/mob/jugador?id=$idUsuario'>".
                                      $this->getView()->escape(Mob_Loader::getModel("Usuarios")->getUsuario($idUsuario)).
                                      "</a> se dirigen a tu edificio $coord1:$coord2:$coord3 mision ".$this->subFormCoordenadas->getMision());
        }
        $this->_edificio->restarRecursos($recursos_arm, $recursos_mun, $recursos_dol+$this->subFormCoordenadas->getSalario(), $recursos_alc);
    
    }
    
    public function setCoords($x, $y, $z) {
        $this->subFormCoordenadas->coordx->setValue($x);
        $this->subFormCoordenadas->coordy->setValue($y);
        $this->subFormCoordenadas->coordz->setValue($z);
        return $this;
    }

}