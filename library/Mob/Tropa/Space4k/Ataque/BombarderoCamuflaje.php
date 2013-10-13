<?php

class Mob_Tropa_Space4k_Ataque_BombarderoCamuflaje extends Mob_Tropa_Ataque {
    protected $_arm = 0;
    protected $_mun = 8000;
    protected $_dol = 200;
    protected $_duracion = 14400;
    protected $_puntos = 42;
    protected $_ataque = 800;
    protected $_defensa = 450;
    protected $_capacidad = 4000;
    protected $_velocidad = 1000;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 100;
    protected $_requisitos = array("motorIonico" => 5, "tecEspionaje" => 5);
    protected $_bonificacionesA = array("tecEspionaje", "tecCamuflaje", "focalizacionEnerg", "ionizacion", "proyPlasma");
    protected $_bonificacionesD = array("tecEspionaje", "tecCamuflaje", "blindajeMejorado", "tecDefensa", "focalizacionEnerg");
    protected $_modificadores = array("lanzamisiles" => 2.2, "aguilaGrandeX" => 1.8);
}