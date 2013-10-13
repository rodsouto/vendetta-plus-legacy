<?php

class Mob_Tropa_Space4k_Ataque_Transportador extends Mob_Tropa_Ataque {
    protected $_arm = 12000;
    protected $_mun = 8000;
    protected $_dol = 5000;
    protected $_duracion = 9000;
    protected $_puntos = 108;
    protected $_ataque = 2;
    protected $_defensa = 5000;
    protected $_capacidad = 50000;
    protected $_velocidad = 4500;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 30;
    protected $_requisitos = array("propulsionEspacio" => 5, "capCargaMejorada" => 8);
    protected $_bonificacionesA = array("ionizacion");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "ionizacion");
    protected $_modificadores = array();
}