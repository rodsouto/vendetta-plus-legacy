<?php

class Mob_Habitacion_Vendetta_Deposito extends Mob_Habitacion_Abstract {
    protected $_arm = 500;
    protected $_mun = 600;
    protected $_dol = 0;
    protected $_duracion = 12000;
    protected $_produccion = 0;
    protected $_puntos = 18;
    protected $_requisitos = array("Municion" => 5);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
}