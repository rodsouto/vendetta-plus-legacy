<?php

class Mob_Tropa_Space4k_Defensa_TorreLaserPequena extends Mob_Tropa_Defensa {
    protected $_arm = 600;
    protected $_mun = 0;
    protected $_dol = 0;
    protected $_duracion = 400;
    protected $_puntos = 2;
    protected $_ataque = 20;
    protected $_defensa = 25;    
    protected $_requisitos = array();
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion");
    protected $_bonificacionesD = array("tecDefensa");
    protected $_modificadores = array("tjuger" => 1.4, "sondaEspionaje" => 1.2, "transportador" => 0.8);
}