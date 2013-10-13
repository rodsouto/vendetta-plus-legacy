<?php

class Mob_Habitacion_Space4k_TanqueHidrogeno extends Mob_Habitacion_Abstract {
    protected $_arm = 600;
    protected $_mun = 1000;
    protected $_dol = 500;
    protected $_duracion = 1000;
    protected $_produccion = 0;
    protected $_puntos = 42;
    protected $_requisitos = array("plQuimicaMejorada" => 1);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
}