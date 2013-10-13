<?php

class Mob_Tropa_Vendetta_Ataque_Porteador extends Mob_Tropa_Ataque {
    protected $_arm = 300;
    protected $_mun = 100;
    protected $_dol = 1000;
    protected $_duracion = 3600;
    protected $_puntos = 9;
    protected $_ataque = 4;
    protected $_defensa = 6;
    protected $_capacidad = 10000;
    protected $_velocidad = 2400;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 5;
    protected $_requisitos = array (
);
    protected $_bonificacionesA = array (
  0 => 'combate',
);
    protected $_bonificacionesD = array (
  0 => 'combate',
);
}