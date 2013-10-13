<?php

class Mob_Habitacion_Vendetta_AlmacenAlc extends Mob_Habitacion_Abstract {
    protected $_arm = 200;
    protected $_mun = 200;
    protected $_dol = 0;
    protected $_duracion = 8000;
    protected $_produccion = 0;
    protected $_puntos = 7;
    protected $_requisitos = array("Cerveceria" => 5);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
    
}