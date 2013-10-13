<?php

class Mob_Tropa_Space4k_Ataque_Tjuger extends Mob_Tropa_Ataque {
    protected $_arm = 6000;
    protected $_mun = 15000;
    protected $_dol = 2000;
    protected $_duracion = 14400;
    protected $_puntos = 106;
    protected $_ataque = 1000;
    protected $_defensa = 700;
    protected $_capacidad = 6000;
    protected $_velocidad = 3500;
    protected $_bonificacionVelocidad = 'motorIonico';
    protected $_salario = 60;
    protected $_requisitos = array("propulsionEspacio" => 1, "tecDefensa" => 6);
    protected $_bonificacionesA = array("focalizacionEnerg", "ionizacion", "proyExplosivos", "proyPlasma");
    protected $_bonificacionesD = array("blindajeMejorado", "tecDefensa", "focalizacionEnerg");
    protected $_modificadores = array("renegado" =>  1.5, "spit" => 1.8, "saqueador" => 1.3, "noe" =>  0.7);
}