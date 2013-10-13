<?php

class Mob_TestController extends Mob_Controller_Action {
    
    public function testupdatesAction() {
        echo $this->view->contentBox()->open("Test");
    
    //$n = "001";
    //var_dump($n+1, (int)$n);
    //die();
        $this->_helper->viewRenderer->setNoRender(true);
        $idEdificio = 3818;
        
        $allTropas = Mob_Data::getTropas();
        
        $tropas = array();         
        // seteo cantidad inicial de tropas al azar
        foreach ($allTropas as $t) {
          $tropas[$t] = rand(0, 100);
        }

        $sumar = $restar = array();
        foreach (array_rand($tropas, 5) as $t) $sumar[$t] = rand(1, 50);
        while (sizeof($restar) <= 5) {
          $rand = array_rand($tropas, 1);
          if (!isset($sumar[$rand]) && !isset($restar[$rand])) $restar[$rand] = $tropas[$rand]-ceil($tropas[$rand]/10); 
        }
        
        // le agrego un cero adelante a algunas
        foreach (array_rand($sumar, 2) as $t) $sumar[$t] = "0".$sumar[$t];
        foreach (array_rand($restar, 2) as $t) $restar[$t] = "0".$restar[$t];
        
        Zend_Debug::dump($tropas, "TOTAL");
        Zend_Debug::dump($sumar, "SUMAR");
        Zend_Debug::dump($restar, "RESTAR");
        
        $this->_setTropas($tropas, $idEdificio);
        $this->_compararTropas($tropas, $idEdificio);
          
        $this->_sumarTropas($tropas, $sumar, $idEdificio);
         
        $this->_setTropas($tropas, $idEdificio);
        $this->_compararTropas($tropas, $idEdificio);
        
        $this->_restarTropas($tropas, $restar, $idEdificio);
    
        echo $this->view->contentBox()->close();
    }
    
    protected function _compararTropas($tropas, $idEdificio) {
      echo "<br/></br/>Comparo______<br />";
      foreach ($tropas as $t => $c) {
         echo "$t: ".(($n = Mob_Loader::getModel("Tropa")->getCantidad($t, $idEdificio)) == $c ? "Ok" : "Error ($n)")."<br />";
      }
    }
    
    protected function _setTropas($tropas, $idEdificio) {
        echo "<br/></br/>";
        foreach ($tropas as $t => $c) {
          echo "Seteo $t = $c<br />";
          Mob_Loader::getModel("Tropa")->setTropa($idEdificio, $t, $c);
        }    
    }
    
    protected function _sumarTropas($tropas, $sumar, $idEdificio) {
        Mob_Loader::getModel("Tropa")->sumarTropas($idEdificio, $sumar);
        echo "<br/></br/>Sumar______<br />";
        foreach ($tropas as $t => $c) {
           $ns = isset($sumar[$t]) ? $sumar[$t] : 0;
           echo "$t ".$c."+".$ns."= ".(($n = Mob_Loader::getModel("Tropa")->getCantidad($t, $idEdificio)) == $c+$ns ? "$n Ok! " : "$n Error!")."<br />";
        }
    }
    
    protected function _restarTropas($tropas, $restar, $idEdificio) {
        Mob_Loader::getModel("Tropa")->restarTropas($idEdificio, $restar);        
        echo "<br/></br/>Restar______<br />";
        foreach ($tropas as $t => $c) {
           $nr = isset($restar[$t]) ? $restar[$t] : 0;
           echo "$t ".$c."-".$nr."= ".(($n = Mob_Loader::getModel("Tropa")->getCantidad($t, $idEdificio)) == $c-$nr ? "$n Ok! " : "$n Error!")."<br />";
        }       
    }

}