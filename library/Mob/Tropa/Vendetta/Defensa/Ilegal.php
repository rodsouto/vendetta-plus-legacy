<?php

class Mob_Tropa_Vendetta_Defensa_Ilegal extends Mob_Tropa_Defensa {
    protected $_arm = 500;
    protected $_mun = 500;
    protected $_dol = 0;
    protected $_duracion = 1000;
    protected $_puntos = 4;
    protected $_ataque = 15;
    protected $_defensa = 15;
    protected $_requisitos = array ();
    protected $_bonificacionesA = array('Combate');
    protected $_bonificacionesD = array('Combate');
    protected $_modificadores = array('porteador' => 2);
}