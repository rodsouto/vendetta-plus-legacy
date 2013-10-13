<?php

class Mob_Tropa_Space4k_Ataque_Colonizador extends Mob_Tropa_Ataque {
    protected $_arm = 10000;
    protected $_mun = 30000;
    protected $_dol = 15000;
    protected $_duracion = 750000;
    protected $_puntos = 288;
    protected $_ataque = 1;
    protected $_defensa = 2.000;
    protected $_capacidad = 30000;
    protected $_velocidad = 100;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 300;
    protected $_requisitos = array("motorIonico" => 4);
    protected $_bonificacionesA = array();
    protected $_bonificacionesD = array("tecEspionaje", "tecCamuflaje", "blindajeMejorado", "tecDefensa", "focalizacionEnerg", "ionizacion");
    protected $_modificadores = array();
}