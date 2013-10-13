<?php

class Mob_Form_Mercado_Propuesta extends Zend_Form {

    protected $_idVendedor;

    public function setIdVendedor($idVendedor) {
        $this->_idVendedor = (int)$idVendedor;
        return $this;
    }

    public function init() {
    
        $tableElementsDecorators = array(
          "ViewHelper",
          array(array("td" => "HtmlTag"), array("tag" => "th")),
          array("Label", array("tag" => "th")),
          array(array("tr" => "HtmlTag"), array("tag" => "tr"))
        ); 
    
        $this->addElement("text", "comprador", array("label" => "Nombre comprador", "required" => true));
        
        $tasas = array("3-5-1" => "3-5-1", "2-4-1" => "2-4-1");
        $this->addElement("select", "tasa", array("label" => "Tasa", "multiOptions" => $tasas));
        
        $recursos = array("arm" => "Armas", "mun" => "Municion", "dol" => "Dolares");
        $this->addElement("select", "recurso", array("label" => "Recurso", "multiOptions" => $recursos));
        
        $this->addElement("text", "cantidad", array("label" => "Cantidad", "size" => 10, "filters" => array("Int")));

        $this->addElement("text", "compra_arm", array("label" => "Armas", "size" => 10, "filters" => array("Int")));
        $this->addElement("text", "compra_mun", array("label" => "Municiones", "size" => 10, "filters" => array("Int")));
        $this->addElement("text", "compra_dol", array("label" => "Dolares", "size" => 10, "filters" => array("Int")));
                        
        $this->addElement("submit", "vender", array("label" => "Aceptar"));
        
        $this->setElementDecorators($tableElementsDecorators);
        
        // acomodo los recursos en una sola fila
        
       // $this->compra_arm->getDecorator("tr")->setOption("openOnly", true);
       // $this->compra_mun->removeDecorator("tr");
       // $this->compra_dol->getDecorator("tr")->setOption("closeOnly", true);
        
        // =====================================
        
        
        $this->tasa->addPrefixPath('Mob_Decorator', 'Mob/Decorator/', 'decorator');
        
        $this->tasa->addDecorator("HtmlContent", array(
                                                "placement" => "prepend",
            "html" => "<tr><td colspan='2' class='c'>".$this->getView()->t("Venta")."</td></tr>"));
            
        $this->compra_arm->addPrefixPath('Mob_Decorator', 'Mob/Decorator/', 'decorator');
        
        $this->compra_arm->addDecorator("HtmlContent", array(
                                                "placement" => "prepend",
            "html" => "<tr><td colspan='2' class='c'>".$this->getView()->t("Compra")."</td></tr>"));
        
        $this->vender->setDecorators(array(
            "ViewHelper",
            array(array("th" => "HtmlTag"), array("tag" => "th", "colspan" => 2)),
            array(array("tr" => "HtmlTag"), array("tag" => "tr"))
        ));
                        
        $this->setDecorators(array("FormElements", array("HtmlTag", array("tag" => "table")), "Form", 
        array("Errors", array("placement" => "prepend"))
        ));
    }
    
    public function isValid($data) {
    
        $isValid = parent::isValid($data);
        
        if (!$isValid) {
            foreach ($this->getErrors() as $k => $e) {
                if (!empty($e)) {
                    switch ($k) {
                        case "comprador":
                            $this->addErrorMessage("Debes indicar el comprador.");
                        return false;
                    }
                }
            }
            return false;
        }
        
        $values = $this->getValues();
        
        $idComprador = Mob_Loader::getModel("Usuarios")->getIdByNombre($values["comprador"]);
        
        if ($idComprador == 0) {
            $this->markAsError();
            $this->addErrorMessage("Comprador inexistente.");
            return false;
        }
        
        if ($idComprador == $this->_idVendedor) {
            $this->markAsError();
            $this->addErrorMessage("No puedes comerciar contigo mismo.");
            return false;
        }
        
        if (!$values["compra_arm"] && !$values["compra_mun"] && !$values["compra_dol"]) {
            $this->markAsError();
            $this->addErrorMessage("Debes especificar que recursos quieres a cambio.");
            return false;
        }
        
        if (!$this->_isValidRate($values["recurso"], $values["cantidad"], 
            $values["compra_arm"], $values["compra_mun"], $values["compra_dol"], $values["tasa"])) {
            $this->markAsError();
            $this->addErrorMessage("Las cantidades comerciadas no cumplen la tasa de comercio establecida.");
            return false;
        }
        
        return true;
    }
    
    protected function _isValidRate($tipoRecurso, $cantRecurso, $arm, $mun, $dol, $rate="3-5-1") {
        $configRate = array_combine(array("arm", "mun", "dol"), explode("-", $rate));
        
        foreach (array("arm", "mun", "dol") as $rec) {            
            $cantRecurso -= (${$rec}*$configRate[$tipoRecurso]/$configRate[$rec]);
        }

        return $cantRecurso == 0;
    }
    
    public function save() {
        $values = $this->getValues();
        $values["id_vendedor"] = $this->_idVendedor;
        $values["id_comprador"] = Mob_Loader::getModel("Usuarios")->getIdByNombre($values["comprador"]);
        unset($values["comprador"], $values["tasa"]);
        
        $idMercado = Mob_Loader::getModel("Mercado")->insert($values);
        
        $nombreVendedor = Mob_Loader::getModel("Usuarios")->getFullName($this->_idVendedor);
        
        Mob_Loader::getModel("Mensajes")->enviar(0, array(
            "id_destinatarios" => $values["id_comprador"],
            "mensaje" => "<a href='/mob/mercado#pendientes'>".sprintf("%s quiere comerciar contigo.", $nombreVendedor)."</a>"
        ));
        
        return $idMercado;
    }

}