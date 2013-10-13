<?php

class Mob_Tropa_Space4k_Ataque_AguilaGrandeX extends Mob_Tropa_Ataque {
    protected $_arm = 0;
    protected $_mun = 275000;
    protected $_dol = 15000;
    protected $_duracion = 480000;
    protected $_puntos = 1488;
    protected $_ataque = 9200;
    protected $_defensa = 40000;
    protected $_capacidad = 150000;
    protected $_velocidad = 6000;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 125;
    protected $_requisitos = array("propMultidimensional" => 4, "proyPlasma" => 10);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion", "proyExplosivos", "proyPlasma");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg", "ionizacion");
    protected $_modificadores = array("aguilaGrandeV" => 1.5, "lanzadorPulsos" => 1.6);
}