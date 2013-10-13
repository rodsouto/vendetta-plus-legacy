<?php

class Mob_Tropa_Space4k_Ataque_Saqueador extends Mob_Tropa_Ataque {
    protected $_arm = 5000;
    protected $_mun = 4000;
    protected $_dol = 200;
    protected $_duracion = 7775;
    protected $_puntos = 35;
    protected $_ataque = 150;
    protected $_defensa = 450;
    protected $_capacidad = 2000;
    protected $_velocidad = 2000;
    protected $_bonificacionVelocidad = 'motorCombustion';
    protected $_salario = 40;
    protected $_requisitos = array("motorIonico" => 2, "tecDefensa" => 3);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg");
    protected $_modificadores = array("darwin" => 1.2, "comerciante" => 1.5, "transportador" => 1.9);
}