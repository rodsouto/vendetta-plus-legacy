<?php

class Mob_Form_Login extends Mob_Form_Standard {

  public function init() {
    $this->setMethod("post")->setAction("/");
    
    $elementDecorators = array("ViewHelper");
    
    //$this->setAttrib("onSubmit", "this.action = 'http://'+this['server'].value+'.".Mob_Server::getDomain()."/'");
    
    $this->addElement("select", "server", array("label" => "Server", "multiOptions" => Mob_Server::getServers(), "required" => true, "decorators" => $elementDecorators));
    $this->addElement("text", "user", array("label" => "Usuario", "required" => true, "decorators" => $elementDecorators));
    $this->addElement("password", "pass", array("label" => "Contraseña", "required" => true, "decorators" => $elementDecorators));
    $this->addElement("submit", "doLogin", array("label" => "Enviar", "decorators" => $elementDecorators));
    
  }

}