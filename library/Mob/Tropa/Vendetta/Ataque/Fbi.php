<?php

class Mob_Tropa_Vendetta_Ataque_Fbi extends Mob_Tropa_Ataque {
    protected $_arm = 4000;
    protected $_mun = 6000;
    protected $_dol = 1000;
    protected $_duracion = 15500;
    protected $_puntos = 48;
    protected $_ataque = 60;
    protected $_defensa = 50;
    protected $_capacidad = 2000;
    protected $_velocidad = 3000;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 20;
    protected $_requisitos = array ("Tiro" => 2);
    protected $_bonificacionesA = array (
  0 => 'proteccion',
  1 => 'tiro',
);
    protected $_bonificacionesD = array (
  0 => 'proteccion',
  1 => 'tiro',
);
protected $_modificadores = array('asesino' => 1.8, 'cia' => 0.6);
}