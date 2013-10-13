<?php

class Mob_Form_Ranking_Batallas extends Zend_Form {

    public function init() {
        $this->setMethod("get")->setAction("/mob/batallas");
        $multiOptions = array(
                0 => "Ultimas Batallas", 
                1 => "Historico", 
                2 => "Atacantes Top Semana", 
                3 => "Atacantes Top Mes", 
                4 => "Atacantes Top Año",
                /*5 => "Defensores Top Semana", 
                6 => "Defensores Top Mes", 
                7 => "Defensores Top Año",*/
                8 => "Granjeadores Top Semana", 
                9 => "Granjeadores Top Mes", 
                10 => "Granjeadores Top Año"
                );
        $this->addElement("select", "type", array("multiOptions" => $multiOptions));
                
        $this->addElement("submit", "ver", array("label" => "Ver", "ignore" => true));
    
    }
    
}