<?php

class Mob_Tropa_Vendetta_Defensa_Policia extends Mob_Tropa_Defensa {
    protected $_arm = 5000;
    protected $_mun = 7500;
    protected $_dol = 500;
    protected $_duracion = 6000;
    protected $_puntos = 54;
    protected $_ataque = 60;
    protected $_defensa = 80;
    protected $_requisitos = array ("Combate" => 4, "Tiro" => 4);
    protected $_bonificacionesA = array("Seguridad", "Proteccion", "Combate", "Tiro");
    protected $_bonificacionesD = array("Seguridad", "Proteccion", "Tiro");
    protected $_modificadores = array('tactico' => 0.6, 'cia' => 1.9, 'fbi' => 2);
}