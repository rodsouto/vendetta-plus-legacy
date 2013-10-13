<?php

class Mob_Habitacion_Space4k_PlQuimicaMejorada extends Mob_Habitacion_Abstract {
    protected $_arm = 10000;
    protected $_mun = 10000;
    protected $_dol = 500;
    protected $_duracion = 2000;
    protected $_produccion = 21;
    protected $_puntos = 316;
    protected $_requisitos = array("centroOperaciones" => 4, "plQuimica" => 5);
    
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