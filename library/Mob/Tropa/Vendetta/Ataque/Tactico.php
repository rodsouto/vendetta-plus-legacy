<?php

class Mob_Tropa_Vendetta_Ataque_Tactico extends Mob_Tropa_Ataque {
    protected $_arm = 5000;
    protected $_mun = 10000;
    protected $_dol = 4000;
    protected $_duracion = 20000;
    protected $_puntos = 93;
    protected $_ataque = 120;
    protected $_defensa = 150;
    protected $_capacidad = 4000;
    protected $_velocidad = 4000;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 40;
    protected $_requisitos = array ("Tiro" => 5, "Quimico" => 3);
    protected $_bonificacionesA = array ("Combate", "Tiro", "Psicologico", "Tiro");
    protected $_bonificacionesD = array ("Combate", "Tiro", "Psicologico", "Tiro");
    protected $_modificadores = array('guardaespaldas' => 1.8, 'ninja' => 0.8);
}