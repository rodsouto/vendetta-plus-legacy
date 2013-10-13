<?php

class Mob_Filter_GameLinksParse implements Zend_Filter_Interface {

    public function filter($value) {
 
      foreach (array("S", "A", "N") as $l) {
          $pattern = '/!'.$l.':[a-zA-Z0-9_\-\.]*:([0-9]*)!/';
          preg_match_all($pattern, $value, $matches);

          if (empty($matches[1])) continue;
          for($i=0; $i < sizeof($matches[1]); $i++) {
              switch ($l) {
                  case "A":
                  // etiqueta
                  $link = "/mob/familias/ver?idf=".$matches[1][$i];
                  $txt = Mob_Loader::getModel("Familias")->getEtiqueta($matches[1][$i]);
                  break;
                  case "N":
                  //nombre
                  $link = "/mob/familias/ver?idf=".$matches[1][$i];
                  $txt = Mob_Loader::getModel("Familias")->getNombre($matches[1][$i]);
                  break;
                  case "S":
                  //jugador
                  $link = "/mob/jugador?id=".$matches[1][$i];
                  $txt = Mob_Loader::getModel("Usuarios")->getUsuario($matches[1][$i]);
                  break;
              }

              $value = str_replace($matches[0][$i], "<a href='$link'>$txt</a>", $value);        
          }  
      }
    
        return $value;
    }

}