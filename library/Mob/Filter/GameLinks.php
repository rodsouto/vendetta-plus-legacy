<?php

class Mob_Filter_GameLinks implements Zend_Filter_Interface {

    public function filter($value) {
    
      foreach (array("A", "N", "S") as $l) {
          $pattern = '/!'.$l.':([a-zA-Z0-9_-]*)!/';
          preg_match($pattern, $value, $matches);
          for($i=0; $i < sizeof($matches); $i = $i+2) {
              switch ($l) {
                  case "A":
                  // etiqueta
                  $id = Mob_Loader::getModel("Familias")->getIdByEtiqueta($matches[$i+1]);
                  break;
                  case "N":
                  //nombre
                  $id = Mob_Loader::getModel("Familias")->getIdByNombre($matches[$i+1]);
                  break;
                  case "S":
                  //jugador
                  $id = Mob_Loader::getModel("Usuarios")->getIdByNombre($matches[$i+1]);
                  break;
              }
              $value = str_replace($matches[$i], str_replace($matches[$i+1], $matches[$i+1].":".$id, $matches[$i]), $value);        
          }  
      }
    
        return $value;
    }

}