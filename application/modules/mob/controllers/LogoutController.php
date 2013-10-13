<?php

class Mob_LogoutController extends Mob_Controller_Action {

  public function indexAction() {
    Zend_Auth::getInstance()->clearIdentity();
    Zend_Session::destroy();
    $this->_redirect("/");
  }

}