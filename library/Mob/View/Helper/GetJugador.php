<?php                                   

class Mob_View_Helper_GetJugador extends Zend_View_Helper_Abstract {

  public function getJugador() {
    return Zend_Registry::isRegistered("jugadorActual") ? Zend_Registry::get("jugadorActual") : null;
  }

}