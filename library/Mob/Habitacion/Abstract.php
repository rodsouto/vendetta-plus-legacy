<?php

abstract class Mob_Habitacion_Abstract {

    protected $_arm = null;
    protected $_mun = null;
    protected $_dol = null;
    protected $_duracion = null;
    protected $_produccion = null;
    protected $_puntos = null;
    protected $_idEdificio = null;
    protected $_nivel;
    protected $_requisitos = array();
    protected $_modelNuevo;
    protected $_model;
    
    public function getModel() {
        if ($this->_model == null) {
            $this->_model = Mob_Loader::getModel("Habitacion");
        }
        
        return $this->_model;
    }   
    public function getModelNuevo() {
        if ($this->_modelNuevo == null) {
            $this->_modelNuevo = Mob_Loader::getModel("Habitacion_Nueva");
        }
        
        return $this->_modelNuevo;
    }
    
    public function setEdificio(Mob_Edificio $edificio) {
        $this->_edificio = $edificio;
        return $this;
    }

    public function getRequisitos($hab = null) {
        return $hab !== null ? $this->_requisitos[ucwords($hab)] : $this->_requisitos;
    }
    
    public function getEdificio() {
        return $this->_edificio;
    }
    
    public function getNombre() {
        return Zend_Registry::get("Zend_Translate")->_("hab_".$this->getNombreBdd());
    } 
    
    public function getNivel() {
        if ($this->_nivel === null) $this->_setNivel();
        return $this->_nivel;    
    } 

    protected function _setNivel() {
        $nivel = $this->getModel()->getNivel($this->getEdificio()->getId(), $this->getNombreBdd());
        $this->_nivel = $nivel;
        return $this;
    }
    
    public function setNivel($nivel) {
        $this->_nivel = $nivel;
        return $this;
    }
    
    public function getTiempoMejora($format = null, $nivel = null, $nivelOficina = null) {
        if ($nivelOficina == null) $nivelOficina = max(1, $this->getEdificio()->getOficina()->getNivel());
        if ($nivel == null) $nivel = $this->getNivel()+1;
        $segundos = (pow($nivel, 2)*$this->_duracion)/$nivelOficina;

        // mejora de velocidad: 3 veces menos
        $segundos = round($segundos / 3);
        if ($format == "segundos") return $segundos;  
        return $format == "iso" ? date("Y-m-d H:i:s", time()+$segundos) : Mob_Timer::timeFormat($segundos);
    } 
    
    public function getCosto($type) {
        $attr = "_" . $type;
        return $this->$attr * ($this->getNivel()+1) * ($this->getNivel()+1);
    } 
    
    public function getImagen() {
        return $this->getNombreBdd().".jpg";
    }
    
    public function getDescripcion() {
        return Zend_Registry::get("Zend_Translate")->_("hab_".$this->getNombreBdd()."_desc");
    }
    
    public function estaConstruyendo() {
        return $this->getModelNuevo()->estaConstruyendo($this->getEdificio()->getId(), $this->getNombreBdd());
    }
        
    public function getNombreBdd() {
        $nombre = get_class($this);
        return lcfirst(end(explode("_", $nombre)));
    }
    
    public function getPuntos() {
        return $this->_puntos;
    }

}