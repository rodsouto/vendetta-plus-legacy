<?php

class Mob_Tropa_Vendetta_Ataque_Ninja extends Mob_Tropa_Ataque {
    protected $_arm = 2000;
    protected $_mun = 1000;
    protected $_dol = 30000;
    protected $_duracion = 40000;
    protected $_puntos = 236;
    protected $_ataque = 400;
    protected $_defensa = 600;
    protected $_capacidad = 5000;
    protected $_velocidad = 8000;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 50;
    protected $_requisitos = array ("Guerrilla" => 8);
    protected $_bonificacionesA = array (
  0 => 'combate',
  1 => 'armas',
  2 => 'guerrilla',
  3 => 'psicologico',
);
    protected $_bonificacionesD = array (
  0 => 'combate',
  1 => 'armas',
  2 => 'guerrilla',
  3 => 'psicologico',
);
protected $_modificadores = array('transportista' => 1.8, 'portero' => 1.5);
}