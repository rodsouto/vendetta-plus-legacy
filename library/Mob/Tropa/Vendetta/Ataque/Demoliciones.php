<?php

class Mob_Tropa_Vendetta_Ataque_Demoliciones extends Mob_Tropa_Ataque {
    protected $_arm = 40000;
    protected $_mun = 6000;
    protected $_dol = 20000;
    protected $_duracion = 60000;
    protected $_puntos = 281;
    protected $_ataque = 2000;
    protected $_defensa = 200;
    protected $_capacidad = 2500;
    protected $_velocidad = 3500;
    protected $_bonificacionVelocidad = "encargos";
    protected $_salario = 60;
    protected $_requisitos = array ("Explosivos" => 6, "Quimico" => 8);
    protected $_bonificacionesA = array ("Explosivos", "Psicologico", "Quimico");
    protected $_bonificacionesD = array ("Explosivos", "Psicologico", "Quimico");
    protected $_modificadores = array('pistolero' => 1.5, 'policia' => 1.8);
}