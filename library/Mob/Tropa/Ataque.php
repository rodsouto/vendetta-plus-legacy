<?php

abstract class Mob_Tropa_Ataque extends Mob_Tropa_Abstract {
    
    //1 = tropa de ataque, 2 = tropa de defensa
    protected $_tipo = 1;
    
    public function getHabEntrenamiento() {
      return Mob_Server::getNameHabAtaque();
    }

}