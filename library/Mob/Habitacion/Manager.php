<?php

class Mob_Habitacion_Manager {

  public static function getProduccion($armeria, $municion, $taberna, $contrabando, $cerveceria, $idEdificio = null) {
      $habArmeria = Mob_Server::getHabRecurso(1);
      $habMunicion = Mob_Server::getHabRecurso(2);
      $habTaberna = Mob_Server::getHabRecurso(3);
      $habContrabando = Mob_Server::getHabRecurso(4);
      $habCerveceria  = Mob_Server::getHabRecurso(5); 
      
      $habArmeria->setNivel($armeria);
      $habMunicion->setNivel($municion);
      $habTaberna->setNivel($taberna);
      $habContrabando->setNivel($contrabando);
      $habCerveceria->setNivel($cerveceria);
      
      $prodAlcohol = $cantAlcohol = $habCerveceria->getProduccion();
      if ($idEdificio != null) {
        $recursos = Mob_Loader::getModel("Edificio")->getRecursos($idEdificio);
        if (is_array($recursos) && !empty($recursos["recursos_alc"])) {
          $cantAlcohol += (int)$recursos["recursos_alc"];
        }    
      }
        
      $prodDolares = 0;
      $consumoTaberna = $habTaberna->getConsumoAlcohol();
      $consumoContrabando = $habContrabando->getConsumoAlcohol();
       
      if ($cantAlcohol > $consumoTaberna) {
        // la cantidad de alcohol almacenada puede cubrir el consumo de la taberna
        $prodDolares += $habTaberna->getProduccion();
        $prodAlcohol -= $consumoTaberna;
        $cantAlcohol -= $consumoTaberna;  
      } else {
        // no cubre el 100%, me fijo cuanto cubre
        $prodDolares += $habTaberna->getProduccionByConsumo($cantAlcohol);
        $prodAlcohol = 0;
        $cantAlcohol = 0;
      }
      
      if ($cantAlcohol > $consumoContrabando) {
        // la produccion de alcohol puede cubrir el consumo de la taberna
        $prodDolares += $habContrabando->getProduccion();
        $prodAlcohol -= $consumoContrabando;
        $cantAlcohol -= $consumoContrabando;   
      } else {
        // no cubre el 100%, me fijo cuanto cubre
        $prodDolares += $habContrabando->getProduccionByConsumo($prodAlcohol);
        $prodAlcohol = 0;
        $cantAlcohol = 0;
      }
      
      return array("arm" => $habArmeria->getProduccion(), "mun" => $habMunicion->getProduccion(), "alc" => $prodAlcohol, "dol" => $prodDolares);                 
  }

}