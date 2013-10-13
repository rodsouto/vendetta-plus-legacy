<?php

class Mob_Tropa_Space4k_Ataque_Sentih extends Mob_Tropa_Ataque {
    protected $_arm = 40000;
    protected $_mun = 650000;
    protected $_dol = 250000;
    protected $_duracion = 975000;
    protected $_puntos = 5226;
    protected $_ataque = 30000;
    protected $_defensa = 200000;
    protected $_capacidad = 210000;
    protected $_velocidad = 4050;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 160;
    protected $_requisitos = array("tecEspionaje" => 15, "propMultidimensional" => 8, "ionizacion" => 15);
    protected $_bonificacionesA = array("tecEspionaje", "tecCamuflaje", "proyExplosivos", "proyPlasma");
    protected $_bonificacionesD = array("tecEspionaje", "tecCamuflaje", "blindajeMejorado", "tecDefensa");
    protected $_modificadores = array("aguilaGrandeX" => 1.5);
}