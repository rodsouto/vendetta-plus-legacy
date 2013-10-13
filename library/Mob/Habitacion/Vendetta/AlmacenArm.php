<?php

class Mob_Habitacion_Vendetta_AlmacenArm extends Mob_Habitacion_Abstract {
    protected $_arm = 100;
    protected $_mun = 500;
    protected $_dol = 0;
    protected $_duracion = 9000;
    protected $_produccion = 0;
    protected $_puntos = 12;
    protected $_requisitos = array("Armeria" => 5);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
    
}