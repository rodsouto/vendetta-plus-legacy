<?php

abstract class Mob_Tropa_Abstract {
    
    protected $_edificio;
    protected $_cantidad;
    protected $_requisitos;
    protected $_modelNuevo;
    protected $_model;
    //1 = tropa de ataque, 2 = tropa de defensa
    protected $_tipo;
    protected $_modificadores;
    
    public function __construct() {
      if (Mob_Server::esDeModificadores() && Mob_Server::getGameType() == "vendetta") {
        $this->_defensa *= 10;
      }
    }
    
    public function getModelNuevo() {
        if ($this->_modelNuevo == null) {
            $this->_modelNuevo = Mob_Loader::getModel("Tropa_Nueva");
        }
        
        return $this->_modelNuevo;
    }
    
    public function getModel() {
        if ($this->_model == null) {
            $this->_model = Mob_Loader::getModel("Tropa");
        }
        
        return $this->_model;
    }
    
    public function getTipo() {
        return $this->_tipo;
    }

    public function getBonificacionesAtaque() {
        return $this->_bonificacionesA;
    }
    
    public function getBonificacionesDefensa() {
        return $this->_bonificacionesD;
    }
    
    public function getCapacidadBase() {
        return $this->_capacidad;
    }
    
    public function getCapacidad() {
        return round($this->_capacidad * (1+sqrt($this->_edificio->getEntrenamiento(Mob_Server::getNameHabCapCarga())->getNivel())/10));
    }
    
    public function getVelocidad() {
        return round($this->_velocidad * (1+sqrt($this->_edificio->getEntrenamiento($this->_bonificacionVelocidad)->getNivel())/10));;
    }

    public function getAtaque() {
        if (Mob_Server::esDeModificadores()) {
          $sumatoriaNiveles = 0;
          foreach ($this->_bonificacionesA as $ent) {
              $sumatoriaNiveles += $this->_edificio->getEntrenamiento($ent)->getNivel();
          }
          
          return floor((1+sqrt($sumatoriaNiveles)/10) * $this->_ataque);        
        }
        
        $ataque = 1;
        foreach ($this->_bonificacionesA as $ent) {
            $ataque *= (1+sqrt($this->_edificio->getEntrenamiento($ent)->getNivel())/10);
        }
        
        return round($ataque * $this->_ataque);
    }
    
    public function getDefensa() {
        if (Mob_Server::esDeModificadores()) {
          $sumatoriaNiveles = 0;
          foreach ($this->_bonificacionesD as $ent) {
              $sumatoriaNiveles += $this->_edificio->getEntrenamiento($ent)->getNivel();
          }
          
          return floor((1+sqrt($sumatoriaNiveles)/10) * $this->_defensa);        
        }
        
        $defensa = 1;
        foreach ($this->_bonificacionesD as $ent) {
            $defensa *= (1+sqrt($this->_edificio->getEntrenamiento($ent)->getNivel())/10);
        }
        
        return round($defensa * $this->_defensa);
    }
    
    public function getRequisitos($ent = null) {
        return $ent !== null ? $this->_requisitos[ucwords($ent)] : $this->_requisitos;
    }

    public function getSalario() {
        return $this->_salario;
    }
    
    public function getVelocidadBase() {
        return $this->_velocidad;
    }
        
    public function getAtaqueBase() {
        return $this->_ataque;
    }
    
    public function getDefensaBase() {
        return $this->_defensa;
    }
    
    public function getNombre() {
        return Zend_Registry::get("Zend_Translate")->_("trp_".$this->getNombreBdd());
    }

    public function getImagen() {
        return $this->getNombreBdd().".jpg";
    }    
    
    public function getDescripcion() {
        return Zend_Registry::get("Zend_Translate")->_("trp_".$this->getNombreBdd()."_desc");
    }
    
    public function getCosto($type) {
        return $this->{"_".$type};
    }
    
    public function getTiempoEntrenamiento($format = true, $nivelCampo = null) {
        if ($nivelCampo === null) $nivelCampo = $this->getEdificio()->getHabitacion($this->getHabEntrenamiento())->getNivel();
        $segundos = $this->_duracion / $nivelCampo;
        return $format ? Mob_Timer::timeFormat($segundos) : $segundos;
    }
    
    public function getNombreBdd() {
        $nombre = get_class($this);
        return lcfirst(end(explode("_", $nombre)));
    }

    public function setEdificio(Mob_Edificio $edificio) {
        $this->_edificio = $edificio;
        return $this;
    }
    
    public function getEdificio() {
        return $this->_edificio;
    }
        
    public function entrenar($cantidad) {
        return $this->getModelNuevo()->entrenar($this->getEdificio(), $this, $cantidad);
    } 
    
    
    public function setCantidad($cantidad) {
        $this->_cantidad = $cantidad;
        return $this;
    }

    protected function _setCantidad() {
        return $this->_cantidad = $this->getModel()->getCantidad(
                                                            $this->getNombreBdd(), 
                                                            $this->getEdificio()->getId());
    }

    public function getCantidad() {
        if ($this->_cantidad === null) $this->_setCantidad();
        return $this->_cantidad;
    }
    
    public function getPuntos() {
      return $this->_puntos;
    }
    
    public function getModificador($tropa) {
    
      return isset($this->_modificadores[lcfirst($tropa)]) ? $this->_modificadores[lcfirst($tropa)] : 1; 
    }
    
    public function getModificadores() {
      return $this->_modificadores;
    }
}