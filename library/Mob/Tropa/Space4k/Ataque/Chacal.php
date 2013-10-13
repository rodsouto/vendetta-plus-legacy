<?php

class Mob_Tropa_Space4k_Ataque_Chacal extends Mob_Tropa_Ataque {
    protected $_arm = 500;
    protected $_mun = 0;
    protected $_dol = 0;
    protected $_duracion = 480;
    protected $_puntos = 2;
    protected $_ataque = 5;
    protected $_defensa = 25;
    protected $_capacidad = 250;
    protected $_velocidad = 800;
    protected $_bonificacionVelocidad = 'motorCombustion';
    protected $_salario = 10;
    protected $_requisitos = array();
    protected $_bonificacionesA = array("focalizacionEnerg", "proyExplosivos");
    protected $_bonificacionesD = array("blindajeMejorado", "focalizacionEnerg");
    protected $_modificadores = array("tjuger" => 1.5);
}