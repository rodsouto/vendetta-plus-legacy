<?php

class Mob_Tropa_Vendetta_Ataque_Francotirador extends Mob_Tropa_Ataque {
    protected $_arm = 4000;
    protected $_mun = 500;
    protected $_dol = 2000;
    protected $_duracion = 25000;
    protected $_puntos = 28;
    protected $_ataque = 200;
    protected $_defensa = 10;
    protected $_capacidad = 1000;
    protected $_velocidad = 6000;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 20;
    protected $_requisitos = array ("Psicologico" => 5, "Guerrilla" => 5);
    protected $_bonificacionesA = array (
  0 => 'seguridad',
  1 => 'tiro',
  2 => 'guerrilla',
  3 => 'psicologico',
);
    protected $_bonificacionesD = array (
  0 => 'tiro',
  1 => 'guerrilla',
  2 => 'psicologico',
);
protected $_modificadores = array('guardia' => 2);
}