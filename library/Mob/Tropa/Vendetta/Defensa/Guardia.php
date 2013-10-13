<?php

class Mob_Tropa_Vendetta_Defensa_Guardia extends Mob_Tropa_Defensa {
    protected $_arm = 15000;
    protected $_mun = 40000;
    protected $_dol = 20000;
    protected $_duracion = 20000;
    protected $_puntos = 388;
    protected $_ataque = 400;
    protected $_defensa = 500;
    protected $_requisitos = array ("Guerrilla" => 8, "Psicologico" => 6);
    protected $_bonificacionesA = array ("Seguridad", "Combate", "Tiro", "Guerrilla", "Psicologico");
    protected $_bonificacionesD = array ("Seguridad", "Proteccion", "Tiro", "Guerrilla", "Psicologico");
    protected $_modificadores = array('ninja' => 2.1);
}