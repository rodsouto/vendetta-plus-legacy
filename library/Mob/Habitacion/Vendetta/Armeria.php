<?php

class Mob_Habitacion_Vendetta_Armeria extends Mob_Habitacion_Abstract {
    protected $_arm = 12;
    protected $_mun = 60;
    protected $_dol = 0;
    protected $_duracion = 500;
    protected $_produccion = 10;
    protected $_puntos = 2.32;
    
    public function getProduccion($base = true) {
      if ($this->getNivel() == 0) return $base ? 10 : 0;
      $base = $base ? 10 : 0;
      return $base+round(10*pow((($this->getNivel()+1)/2), 2));
    }
}