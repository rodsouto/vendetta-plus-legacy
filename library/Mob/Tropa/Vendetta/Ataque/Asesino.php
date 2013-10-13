<?php

class Mob_Tropa_Vendetta_Ataque_Asesino extends Mob_Tropa_Ataque {
    protected $_arm = 10000;
    protected $_mun = 15000;
    protected $_dol = 10000;
    protected $_duracion = 6000;
    protected $_puntos = 176;
    protected $_ataque = 300;
    protected $_defensa = 200;
    protected $_capacidad = 2000;
    protected $_velocidad = 6500;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 45;
    protected $_requisitos = array ("Psicologico" => 7, "Proteccion" => 7);
    protected $_bonificacionesA = array (
  0 => 'seguridad',
  1 => 'proteccion',
  2 => 'tiro',
  3 => 'guerrilla',
  4 => 'psicologico',
);
    protected $_bonificacionesD = array (
  0 => 'seguridad',
  1 => 'proteccion',
  2 => 'tiro',
  3 => 'guerrilla',
  4 => 'psicologico',
);
protected $_modificadores = array('centinela' => 1.4, 'mercenario' => 2);
}