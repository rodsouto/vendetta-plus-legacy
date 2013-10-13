<?php

class Mob_Tropa_Vendetta_Defensa_Centinela extends Mob_Tropa_Defensa {
    protected $_arm = 2000;
    protected $_mun = 3000;
    protected $_dol = 100;
    protected $_duracion = 2500;
    protected $_puntos = 21;
    protected $_ataque = 40;
    protected $_defensa = 50;
    protected $_requisitos = array ("Seguridad" => 2);
    protected $_bonificacionesA = array ("Seguridad", "Combate", "Armas");
    protected $_bonificacionesD = array ("Seguridad", "Combate", "Armas");
    protected $_modificadores = array('maton' => 1.8);
}