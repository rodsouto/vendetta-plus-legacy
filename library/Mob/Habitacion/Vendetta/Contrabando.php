<?php

class Mob_Habitacion_Vendetta_Contrabando extends Mob_Habitacion_Abstract {
    protected $_arm = 2000;
    protected $_mun = 5000;
    protected $_dol = 500;
    protected $_duracion = 4000;
    protected $_produccion = 21;
    protected $_puntos = 136;
    protected $_requisitos = array("Oficina" => 5, "Cerveceria" => 8);
    
    public function getProduccion() {
        if ($this->getNivel() == 0) return 0;
        return round(21*pow((($this->getNivel()+1)/2), 2));
    }

    public function getConsumoAlcohol() {
        if ($this->getNivel() == 0) return 0;
        return ($this->getProduccion()*4)+1;
    }
    
    public function getProduccionByConsumo($alcohol) {
      if ($alcohol == 0) return 0;
      return ($alcohol-1)/4;
    }    

}       