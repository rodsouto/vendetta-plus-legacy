<?php

abstract class Mob_Tropa_Defensa extends Mob_Tropa_Abstract {
    
    //1 = tropa de ataque, 2 = tropa de defensa
    protected $_tipo = 2;

    public function getHabEntrenamiento() {
      return Mob_Server::getNameHabDefensa();
    }
    
}