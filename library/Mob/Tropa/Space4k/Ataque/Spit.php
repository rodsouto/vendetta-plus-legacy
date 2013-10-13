<?php

class Mob_Tropa_Space4k_Ataque_Spit extends Mob_Tropa_Ataque {
    protected $_arm = 1300;
    protected $_mun = 5000;
    protected $_dol = 3000;
    protected $_duracion = 3150;
    protected $_puntos = 51;
    protected $_ataque = 300;
    protected $_defensa = 250;
    protected $_capacidad = 8000;
    protected $_velocidad = 3200;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 20;
    protected $_requisitos = array("motorIonico" => 4, "focalizacionEnerg" => 4);
    protected $_bonificacionesA = array("focalizacionEnerg");
    protected $_bonificacionesD = array("blindajeMejorado", "focalizacionEnerg");
    protected $_modificadores = array("sentih" => 1.7, "tjuger" => 0.6);
}