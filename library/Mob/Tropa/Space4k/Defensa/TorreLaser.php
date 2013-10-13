<?php

class Mob_Tropa_Space4k_Defensa_TorreLaser extends Mob_Tropa_Defensa {
    protected $_arm = 3000;
    protected $_mun = 300;
    protected $_dol = 0;
    protected $_duracion = 1200;
    protected $_puntos = 10;
    protected $_ataque = 100;
    protected $_defensa = 500;    
    protected $_requisitos = array("ionizacion" => 2);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion");
    protected $_bonificacionesD = array("tecDeteccion", "tecDefensa");
    protected $_modificadores = array("cougar" => 1.6, "renegado" => 1.4, "sentih" => 0.6);
}