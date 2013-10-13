<?php

class Mob_Tropa_Space4k_Ataque_Comerciante extends Mob_Tropa_Ataque {
    protected $_arm = 2000;
    protected $_mun = 2000;
    protected $_dol = 0;
    protected $_duracion = 5000;
    protected $_puntos = 16;
    protected $_ataque = 1;
    protected $_defensa = 50;
    protected $_capacidad = 9000;
    protected $_velocidad = 1900;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 10;
    protected $_requisitos = array();
    protected $_bonificacionesA = array("ionizacion");
    protected $_bonificacionesD = array("blindajeMejorado");
    protected $_modificadores = array();
}