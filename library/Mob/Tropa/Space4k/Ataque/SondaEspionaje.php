<?php

class Mob_Tropa_Space4k_Ataque_SondaEspionaje extends Mob_Tropa_Ataque {
    protected $_arm = 0;
    protected $_mun = 500;
    protected $_dol = 100;
    protected $_duracion = 100;
    protected $_puntos = 4;
    protected $_ataque = 0;
    protected $_defensa = 1;
    protected $_capacidad = 50;
    protected $_velocidad = 130000000000;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 1;
    protected $_requisitos = array("tecEspionaje" => 3);
    protected $_bonificacionesA = array();
    protected $_bonificacionesD = array();
    protected $_modificadores = array();
}