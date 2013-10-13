<?php

class Mob_Tropa_Space4k_Defensa_TorrePlasma extends Mob_Tropa_Defensa {
    protected $_arm = 2000;
    protected $_mun = 2000;
    protected $_dol = 2000;
    protected $_duracion = 50;
    protected $_puntos = 31;
    protected $_ataque = 500;
    protected $_defensa = 2500;    
    protected $_requisitos = array("proyPlasma" => 3);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion", "proyPlasma");
    protected $_bonificacionesD = array("tecDefensa");
    protected $_modificadores = array("aguilaGrandeV" => 2.0);
}