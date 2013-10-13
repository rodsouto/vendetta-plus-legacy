<?php

class Mob_Tropa_Vendetta_Ataque_Acuchillador extends Mob_Tropa_Ataque {
    protected $_arm = 1000;
    protected $_mun = 200;
    protected $_dol = 0;
    protected $_duracion = 2000;
    protected $_puntos = 4;
    protected $_ataque = 10;
    protected $_defensa = 4;
    protected $_capacidad = 300;
    protected $_velocidad = 2500;
    protected $_bonificacionVelocidad = "rutas";
    protected $_salario = 1;
    protected $_requisitos = array ("Extorsion" => 4);
    protected $_bonificacionesA = array (
  0 => 'extorsion',
  1 => 'armas',
);
    protected $_bonificacionesD = array (
  0 => 'extorsion',
  1 => 'combate',
);
    protected $_modificadores = array('maton' => 1.2, 'espia' => 0.5);
}