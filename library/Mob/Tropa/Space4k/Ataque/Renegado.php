<?php

class Mob_Tropa_Space4k_Ataque_Renegado extends Mob_Tropa_Ataque {
    protected $_arm = 1000;
    protected $_mun = 0;
    protected $_dol = 50;
    protected $_duracion = 1200;
    protected $_puntos = 3;
    protected $_ataque = 20;
    protected $_defensa = 50;
    protected $_capacidad = 400;
    protected $_velocidad = 850;
    protected $_bonificacionVelocidad = 'motorCombustion';
    protected $_salario = 15;
    protected $_requisitos = array("motorCombustion" => 3);
    protected $_bonificacionesA = array("focalizacionEnerg", "proyExplosivos");
    protected $_bonificacionesD = array("blindajeMejorado", "focalizacionEnerg");
    protected $_modificadores = array("chacal" => 1.2, "bombarderoCamuflaje" => 1.8, "cougar" => 1.5, "torreLaserPequena" => 1.6);
}