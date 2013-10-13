<?php

class Mob_Form_Registro extends Mob_Form_Standard {

  public function init() {
    $this->setMethod("post")->setAttrib("class", "simpleForm");
    //->setAction("/register");
    
    $passwordValidator = array("Alnum", array('StringLength', false, array(6, 20)));
    
    $elementDecorators = array("ViewHelper", "Label", array("HtmlTag", array("tag" => "div" )), "Errors");
    
    if ($this->mustSelectServer()) {
    
        $this->addElement("select", "server", array("label" => "Selecciona el servidor", "multiOptions" => Mob_Server::getServers(), "required" => true, "decorators" => $elementDecorators));
        $this->addElement("submit", "registrarme", array("label" => "Siguiente", "decorators" => $elementDecorators, "class" => "submit"));
    
    } else {
    
      $this->addElement("text", "user", array(
          "label" => "Usuario", 
          "required" => true, 
          "decorators" => $elementDecorators,
          "validators" => array(
            "login" => array("Db_NoRecordExists", false, array('table' => 'mob_usuarios', 'field' => 'login')),
            array("StringLength", false, array(4, 20))
          ),
          "errorMessages" => array("Ya existe un jugador registrado con ese nombre.")
      ));
          
      $this->addElement("password", "pass", array("label" => "Contraseña", "required" => true, "decorators" => $elementDecorators, "validators" => $passwordValidator));
      
      $this->addElement("text", "email", array(
          "label" => "Email", 
          "required" => true, 
          "decorators" => $elementDecorators,
          "validators" => array(
            //array("Db_NoRecordExists", false, array('table' => 'mob_usuarios', 'field' => 'email'))
          )
      ));
  
      $this->addElement("captcha", "captcha", array(
          'label' => "Please verify you're a human",
          'captcha' => 'Image',
          "decorators" => array("Captcha", "Label", "Errors", array("HtmlTag", array("tag" => "div" ))),
          'captchaOptions' => array(
              'captcha' => 'Image',
              'font' => APPLICATION_PATH."/verdana.ttf",
              'wordLen' => 6,
              'timeout' => 300,
              'imgDir' => PUBLIC_PATH."/cacheFiles/captcha/",
              'imgUrl' => "/cacheFiles/captcha"
          ),
      ));
      
      $this->addElement("submit", "registrarme", array("label" => "Registrarse", "decorators" => $elementDecorators, "class" => "submit"));
    }
    
    $this->registrarme->removeDecorator("Label");
    
  }
  

  public function isValid($data) {
    $isValid = parent::isValid($data);
    
    if ($this->mustSelectServer()) return $isValid;
    
    if (!$this->user->hasErrors()) {
      $validate = new Zend_Validate_Db_NoRecordExists(array('table' => 'mob_usuarios', 'field' => 'usuario'));
      
      if (!$validate->isValid($data["user"])) {
        $this->user->markAsError();
        $isValid = false;
      }
    }

    return $isValid;
  }

    public function save() {
    
        return $id_usuario = Mob_Loader::getModel("Usuarios")->insert(array(
                      "usuario" => $this->user->getValue(),
                      "login" => $this->user->getValue(),
                      "pass" => $this->pass->getValue(),
                      "email" => $this->email->getValue(),
        ));

    }
    
    public function mustSelectServer() {
        return !Mob_Server::isSubDomain();
    }

}