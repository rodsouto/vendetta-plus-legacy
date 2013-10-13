<?php

class Mob_Tropa_Vendetta_Ataque_Transportista extends Mob_Tropa_Ataque {
    protected $_arm = 1000;
    protected $_mun = 2000;
    protected $_dol = 5000;
    protected $_duracion = 17200;
    protected $_puntos = 51;
    protected $_ataque = 6;
    protected $_defensa = 8;
    protected $_capacidad = 40000;
    protected $_velocidad = 5000;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 10;
    protected $_requisitos = array ("Psicologico" => 4);
    protected $_bonificacionesA = array (
  0 => 'psicologico',
);
    protected $_bonificacionesD = array (
  0 => 'proteccion',
  1 => 'psicologico',
);
}