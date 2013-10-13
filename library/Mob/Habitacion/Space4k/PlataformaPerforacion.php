<?php

class Mob_Habitacion_Space4k_PlataformaPerforacion extends Mob_Habitacion_Abstract {
    protected $_arm = 20;
    protected $_mun = 15;
    protected $_dol = 0;
    protected $_duracion = 300;
    protected $_produccion = 10;
    protected $_puntos = 1.5;
    protected $_requisitos = array();
    
    public function getProduccion($base = true) {
        if ($this->getNivel() == 0) return $base ? 10 : 0;
        $base = $base ? 10 : 0;
        return $base+round(10*pow((($this->getNivel()+1)/2), 2));
    }    
}