<?php

class Mob_Habitacion_Vendetta_Caja extends Mob_Habitacion_Abstract {
    protected $_arm = 2000;
    protected $_mun = 2000;
    protected $_dol = 1000;
    protected $_duracion = 16000;
    protected $_produccion = 0;
    protected $_puntos = 91;
    protected $_requisitos = array("Taberna" => 5);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
}