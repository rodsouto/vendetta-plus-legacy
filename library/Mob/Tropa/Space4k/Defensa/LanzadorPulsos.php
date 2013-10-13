<?php

class Mob_Tropa_Space4k_Defensa_LanzadorPulsos extends Mob_Tropa_Defensa {
    protected $_arm = 200;
    protected $_mun = 5000;
    protected $_dol = 0;
    protected $_duracion = 9600;
    protected $_puntos = 26;
    protected $_ataque = 400;
    protected $_defensa = 1000;    
    protected $_requisitos = array("tecDefensa" => 2, "focalizacionEnerg" => 4);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion");
    protected $_bonificacionesD = array("tecDeteccion", "tecDefensa", "focalizacionEnerg");
    protected $_modificadores = array("bombarderoCamuflaje" => 2.0);
}