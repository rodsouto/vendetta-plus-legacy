<?php

class Mob_Tropa_Space4k_Ataque_AguilaGrandeV extends Mob_Tropa_Ataque {
    protected $_arm = 120000;
    protected $_mun = 5000;
    protected $_dol = 6000;
    protected $_duracion = 96000;
    protected $_puntos = 371;
    protected $_ataque = 3000;
    protected $_defensa = 15000;
    protected $_capacidad = 40000;
    protected $_velocidad = 2700;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 200;
    protected $_requisitos = array("propulsionEspacio" => 6, "blindajeMejorado" => 8);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion", "proyExplosivos", "proyPlasma");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg", "ionizacion");
    protected $_modificadores = array("cougar" => 1.7, "torreLaser" => 1.7);
}