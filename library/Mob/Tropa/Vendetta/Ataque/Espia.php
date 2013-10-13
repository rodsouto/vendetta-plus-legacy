<?php

class Mob_Tropa_Vendetta_Ataque_Espia extends Mob_Tropa_Ataque {
    protected $_arm = 500;
    protected $_mun = 200;
    protected $_dol = 0;
    protected $_duracion = 14000;
    protected $_puntos = 3;
    protected $_ataque = 1;
    protected $_defensa = 1;
    protected $_capacidad = 50;
    protected $_velocidad = 400000;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 1;
    protected $_requisitos = array ("Espionaje" => 2);
    protected $_bonificacionesA = array (
  0 => 'espionaje',
);
    protected $_bonificacionesD = array (
  0 => 'espionaje',
);
}