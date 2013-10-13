<?php

class Mob_Habitacion_Space4k_TanqueAgua extends Mob_Habitacion_Abstract {
    protected $_arm = 150;
    protected $_mun = 0;
    protected $_dol = 0;
    protected $_duracion = 1000;
    protected $_produccion = 0;
    protected $_puntos = 2.5;
    protected $_requisitos = array("plataformaPerforacion" => 2);
    
    public function getAlmacenamiento() {
        return 10000+150000*$this->getNivel();
    }
    
    public function getAlmacenamientoSeguro() {
        return $this->getAlmacenamiento() / 10;
    }
}