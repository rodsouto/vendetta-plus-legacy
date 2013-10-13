<?php

class Mob_Form_Paginacion extends Zend_Form {

    public function build($totalResults, $range) {
//        $this->setAction("/mob/mapa");
        $pages = array();
        $totalPages = ceil($totalResults/$range);
        foreach (range(1, $totalPages) as $page) {
        
        if ($range == 1) {
            $pages[$page] = $page;
        } else {
            if($page == 1) {
                $pages[$page] = "1 - $range";
            } else {
                $pages[$page] = ((($page-1)*$range)+1)." - ".($page*$range);
            }
        }
        
        } 
        $this->addElement("select", "page", array("multiOptions" => $pages));
        
        $this->addElement("submit", "cambiar", array("label" => "Go!"));
        
        $this->setMethod("get");
        
        $this->setElementDecorators(array("ViewHelper"));
    
    }
    
    public function addHidden($values) {
        foreach ($values as $k => $v) $this->addElement("hidden", $k, array("value" => $v));
    }

}