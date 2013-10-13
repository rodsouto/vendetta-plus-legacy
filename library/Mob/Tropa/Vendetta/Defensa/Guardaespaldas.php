<?php

class Mob_Tropa_Vendetta_Defensa_Guardaespaldas extends Mob_Tropa_Defensa {
    protected $_arm = 3000;
    protected $_mun = 1000;
    protected $_dol = 4000;
    protected $_duracion = 15600;
    protected $_puntos = 43;
    protected $_ataque = 100;
    protected $_defensa = 250;
    protected $_requisitos = array ("Proteccion" => 6, "Combate" => 5);
    protected $_bonificacionesA = array ("Seguridad", "Proteccion", "Combate", "Tiro", "Guerrilla");
    protected $_bonificacionesD = array ("Seguridad", "Proteccion", "Guerrilla");
    protected $_modificadores = array('asesino' => 1.5, 'ninja' => 1.8, 'porteador' => 0.5);
}