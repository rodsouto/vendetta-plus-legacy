<?php

class Mob_Habitacion_Vendetta_Taberna extends Mob_Habitacion_Abstract {
    protected $_arm = 10;
    protected $_mun = 50;
    protected $_dol = 0;
    protected $_duracion = 1500;
    protected $_produccion = 2;
    protected $_puntos = 2.1;
    protected $_requisitos = array("Cerveceria" => 1);
    
    public function getProduccion() {
        if ($this->getNivel() == 0) return 0;
        return round(2*pow((($this->getNivel()+1)/2), 2));
    }
    
    public function getConsumoAlcohol() {
        if ($this->getNivel() == 0) return 0;
        return ($this->getProduccion()*7)+3;
    }
    
    public function getProduccionByConsumo($alcohol) {
      if ($alcohol == 0) return 0;
      return ($alcohol-3)/7;
    }
}