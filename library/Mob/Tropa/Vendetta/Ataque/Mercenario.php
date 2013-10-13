<?php

class Mob_Tropa_Vendetta_Ataque_Mercenario extends Mob_Tropa_Ataque {
    protected $_arm = 80000;
    protected $_mun = 120000;
    protected $_dol = 50000;
    protected $_duracion = 144000;
    protected $_puntos = 1176;
    protected $_ataque = 1000;
    protected $_defensa = 1200;
    protected $_capacidad = 12000;
    protected $_velocidad = 4500;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 70;
    protected $_requisitos = array ("Guerrilla" => 9, "Combate" => 9, "Proteccion" => 9);
    protected $_bonificacionesA = array (
  0 => 'espionaje',
  1 => 'seguridad',
  2 => 'proteccion',
  3 => 'combate',
  4 => 'armas',
  5 => 'tiro',
  6 => 'guerrilla',
  7 => 'psicologico',
);
    protected $_bonificacionesD = array (
  0 => 'espionaje',
  1 => 'seguridad',
  2 => 'proteccion',
  3 => 'combate',
  4 => 'armas',
  5 => 'tiro',
  6 => 'guerrilla',
  7 => 'psicologico',
);
protected $_modificadores = array('tactico' => 1.4, 'demoliciones' => 1.2, 'maton' => 0.5);
}