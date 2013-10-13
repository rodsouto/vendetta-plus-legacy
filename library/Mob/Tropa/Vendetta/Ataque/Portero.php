<?php

class Mob_Tropa_Vendetta_Ataque_Portero extends Mob_Tropa_Ataque {
    protected $_arm = 500;
    protected $_mun = 800;
    protected $_dol = 0;
    protected $_duracion = 1600;
    protected $_puntos = 6;
    protected $_ataque = 8;
    protected $_defensa = 6;
    protected $_capacidad = 400;
    protected $_velocidad = 2000;
    protected $_bonificacionVelocidad = "rutas";
    protected $_salario = 1;
    protected $_requisitos = array ("Extorsion" => 2);
    protected $_bonificacionesA = array (
  0 => 'extorsion',
);
    protected $_bonificacionesD = array (
  0 => 'extorsion',
  1 => 'seguridad',
);
protected $_modificadores = array('acuchillador' => 1.5, 'guardia' => 1.8, 'fbi' => 0.5);
}