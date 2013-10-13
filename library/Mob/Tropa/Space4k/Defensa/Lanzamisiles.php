<?php

class Mob_Tropa_Space4k_Defensa_Lanzamisiles extends Mob_Tropa_Defensa {
    protected $_arm = 60000;
    protected $_mun = 5000;
    protected $_dol = 1000;
    protected $_duracion = 14400;
    protected $_puntos = 183;
    protected $_ataque = 3000;
    protected $_defensa = 5000;    
    protected $_requisitos = array("blindajeMejorado" => 4, "proyExplosivos" => 6);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion", "proyExplosivos");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg");
    protected $_modificadores = array("sentih" => 2.0);
}