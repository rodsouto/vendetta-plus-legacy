<?php

class Mob_Tropa_Vendetta_Ataque_Pistolero extends Mob_Tropa_Ataque {
    protected $_arm = 2000;
    protected $_mun = 3000;
    protected $_dol = 0;
    protected $_duracion = 1200;
    protected $_puntos = 21;
    protected $_ataque = 30;
    protected $_defensa = 10;
    protected $_capacidad = 500;
    protected $_velocidad = 2400;
    protected $_bonificacionVelocidad = "rutas";
    protected $_salario = 2;
    protected $_requisitos = array ("Tiro" => 2);
    protected $_bonificacionesA = array (
  0 => 'tiro',
);
    protected $_bonificacionesD = array (
  0 => 'seguridad',
  1 => 'proteccion',
);
protected $_modificadores = array('portero' => 1.5, 'transportista' => 1.2, 'porteador' => 0.8);
}