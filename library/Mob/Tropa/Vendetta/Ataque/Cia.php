<?php

class Mob_Tropa_Vendetta_Ataque_Cia extends Mob_Tropa_Ataque {
    protected $_arm = 7000;
    protected $_mun = 10000;
    protected $_dol = 2500;
    protected $_duracion = 17000;
    protected $_puntos = 87;
    protected $_ataque = 100;
    protected $_defensa = 90;
    protected $_capacidad = 3000;
    protected $_velocidad = 3400;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 30;
    protected $_requisitos = array ("Guerrilla" => 3, "Encargos" => 3);
    protected $_bonificacionesA = array (
  0 => 'armas',
  1 => 'tiro',
  2 => 'guerrilla',
);
    protected $_bonificacionesD = array (
  0 => 'proteccion',
  1 => 'guerrilla',
);
protected $_modificadores = array('tactico' => 1.5, 'francotirador' => 1.3);
}