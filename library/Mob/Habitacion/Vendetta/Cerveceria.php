<?php

class Mob_Habitacion_Vendetta_Cerveceria extends Mob_Habitacion_Abstract {
    protected $_arm = 20;
    protected $_mun = 20;
    protected $_dol = 0;
    protected $_duracion = 1000;
    protected $_produccion = 50;
    protected $_puntos = 1.6;
    
    public function getProduccion($base = true) {
      if ($this->getNivel() == 0) return $base ? 10 : 0;
      $base = $base ? 10 : 0;
      return $base+round(50*pow((($this->getNivel()+1)/2), 2));
    }
}