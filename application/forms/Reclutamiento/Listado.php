<?php

class Mob_Form_Reclutamiento_Listado extends Zend_Form {

    protected $_tipo;
    public function build($tipo) {
        $this->setAction("/mob/".Zend_Controller_Front::getInstance()->getRequest()->getControllerName());
        $this->_tipo = $tipo;
        $this->addElement("multiselect", "listadoTropas");
        $this->addElement("submit", "borrar", array("label" => "Cancelar tropas seleccionadas"));
        $this->_setMultiOptions();
    }
    
    protected function _setMultiOptions() {
        $multiOptions = array();
        $edificio = Zend_Registry::get("jugadorActual")->getEdificioActual();
        
        $method = $this->_tipo == "seguridad" ? "getColaEntrenamientosSeguridad" : "getColaEntrenamientos";
        
        $duracionListaEspera = 0;
        
        foreach ($edificio->$method() as $k => $ent) {
            $tiempoRestante = $k == 0 ? strtotime($ent["fecha_fin"]) - time() : $ent["duracion"];
            $duracionListaEspera += $tiempoRestante;
            $multiOptions[$ent["id_tropa_nueva"]] = sprintf("%s %s - Duracion %s", 
                                    $ent["cantidad"], 
                                    $edificio->getTropa($ent["tropa"])->getNombre(), 
                                    Mob_Timer::timeFormat($tiempoRestante));
        }
        
        if ($duracionListaEspera > 0) {
            $this->setDescription($this->getTranslator()->_("Duración de la lista de espera").": ".Mob_Timer::timeFormat($duracionListaEspera));
            $this->addDecorator("Description");
        } else $this->setDescription('');
        
        $this->listadoTropas->setMultiOptions($multiOptions);     
    }
    
    public function isValid($data) {
        $isValid = parent::isValid($data);
        if (!$isValid) return false;
        
        $isValid = reset($this->listadoTropas->getValue()) != reset(array_keys($this->listadoTropas->getMultiOptions()));
        
        if (!$isValid) {
            $this->markAsError();
        }
        
        return $isValid;
        
    }
    
    public function borrar() {
        Mob_Loader::getModel("Tropa_Nueva")->cancelar($this->listadoTropas->getValue());
        $this->_setMultiOptions();
    }

}
