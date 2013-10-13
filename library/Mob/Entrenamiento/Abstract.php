<?php

abstract class Mob_Entrenamiento_Abstract {

    protected $_requisitos;
    protected $_arm;
    protected $_mun;
    protected $_dol;
    protected $_duracion;
    protected $_puntos;
    protected $_edificio;
    protected $_nivel;
    protected $_modelNuevo;
    protected $_model;
    
    public function getModel() {
        if ($this->_model == null) {
            $this->_model = Mob_Loader::getModel("Entrenamiento");
        }
        
        return $this->_model;
    }

    public function getModelNuevo() {
        if ($this->_modelNuevo == null) {
            $this->_modelNuevo = Mob_Loader::getModel("Entrenamiento_Nuevo");
        }
        
        return $this->_modelNuevo;
    }

    public function getRequisitos() {
        return $this->_requisitos;
    }
    
    public function getAttrib($attrib) {
        $attrib = sprintf("_%s", $attrib);
        return $this->$attrib;
    }
    
    public function setEdificio($edificio) {
        $this->_edificio = $edificio;
        return $this;
    }
    
    public function getEdificio() {
        return $this->_edificio;
    }

    protected function _setNivel() {
        $nivel = $this->getModel()->getNivel($this->getEdificio()->getJugador()->getIdUsuario(), $this->getNombreBdd());
        $this->_nivel = $nivel;
        return $this;
    }

    public function setNivel($nivel) {
        $this->_nivel = $nivel;
        return $this;
    }
    
    public function getNivel() {
        if ($this->_nivel === null) $this->_setNivel();
        return $this->_nivel;
    }
    
    public function getTiempoMejora($format = null, $nivel = null, $nivelEscuela = null) {
        if ($nivelEscuela == null) $nivelEscuela = $this->getEdificio()->getEscuela()->getNivel();
        if ($nivel == null) $nivel = $this->getNivel()+1;
        $segundos = round(pow($nivel, 2)*$this->_duracion/$nivelEscuela);
        
        // mejora de velocidad: 3 veces menos
        $segundos = round($segundos / 3);
        if ($format == "segundos") return $segundos;
        return $format == "iso" ? date("Y-m-d H:i:s", time()+$segundos) : Mob_Timer::timeFormat($segundos);
    }     
    
    public function getNombre() {
    	return Zend_Registry::get("Zend_Translate")->_("ent_".$this->getNombreBdd());
    }
    
    public function getImagen() {
        return $this->getNombreBdd().".jpg";
    }
    
    public function getDescripcion() {
        return Zend_Registry::get("Zend_Translate")->_("ent_".$this->getNombreBdd()."_desc");
    }
    
    public function getCosto($type) {
        $attr = "_" . $type;
        return $this->$attr * ($this->getNivel()+1) * ($this->getNivel()+1);
    }                                                                   
    
    public function getNombreBdd() {
        $nombre = get_class($this);
        return lcfirst(end(explode("_", $nombre)));
    }
    
    public function getPuntos() {
        return $this->_puntos;
    }    
}