<?php

class Mob_Tropa_Space4k_Ataque_Cougar extends Mob_Tropa_Ataque {
    protected $_arm = 20000;
    protected $_mun = 5000;
    protected $_dol = 500;
    protected $_duracion = 14400;
    protected $_puntos = 79;
    protected $_ataque = 400;
    protected $_defensa = 3000;
    protected $_capacidad = 15000;
    protected $_velocidad = 2100;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 90;
    protected $_requisitos = array("propulsionEspacio" => 2, "blindajeMejorado" => 8);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion", "proyPlasma");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg", "ionizacion");
    protected $_modificadores = array("saqueador" => 1.3, "noe" => 1.8, "torrePlasma" => 1.6, "comerciante" => 0.5);
}