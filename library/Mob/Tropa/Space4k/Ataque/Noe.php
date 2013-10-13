<?php

class Mob_Tropa_Space4k_Ataque_Noe extends Mob_Tropa_Ataque {
    protected $_arm = 0;
    protected $_mun = 50000;
    protected $_dol = 9000;
    protected $_duracion = 12000;
    protected $_puntos = 318;
    protected $_ataque = 100;
    protected $_defensa = 12000;
    protected $_capacidad = 250000;
    protected $_velocidad = 8000;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 20;
    protected $_requisitos = array("propMultidimensional" => 2);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion");
    protected $_bonificacionesD = array("tecCamuflaje", "blindajeMejorado", "tecDefensa", "focalizacionEnerg", "ionizacion");
    protected $_modificadores = array();
}