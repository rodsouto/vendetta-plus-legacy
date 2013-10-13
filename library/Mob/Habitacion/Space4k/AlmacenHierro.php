<?php

class Mob_Habitacion_Space4k_AlmacenHierro extends Mob_Habitacion_Abstract {
    protected $_arm = 400;
    protected $_mun = 0;
    protected $_dol = 0;
    protected $_duracion = 1500;
    protected $_produccion = 0;
    protected $_puntos = 5;
    protected $_requisitos = array("minaHierro" => 5);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
}