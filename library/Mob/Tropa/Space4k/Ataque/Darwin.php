<?php

class Mob_Tropa_Space4k_Ataque_Darwin extends Mob_Tropa_Ataque {
    protected $_arm = 2000;
    protected $_mun = 1500;
    protected $_dol = 0;
    protected $_duracion = 4000;
    protected $_puntos = 13;
    protected $_ataque = 20;
    protected $_defensa = 100;
    protected $_capacidad = 5000;
    protected $_velocidad = 1000;
    protected $_bonificacionVelocidad = 'motorCombustion';
    protected $_salario = 30;
    protected $_requisitos = array("motorCombustion" => 1, "blindajeMejorado" => 2);
    protected $_bonificacionesA = array("focalizacionEnerg");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg");
    protected $_modificadores = array();
}