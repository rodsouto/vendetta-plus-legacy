<?php

class IndexController extends Zend_Controller_Action {

    public function init(){
      if (Zend_Auth::getInstance()->hasIdentity() && $this->getRequest()->getActionName() != "wait") {
        $this->_redirect("/mob");
      }
    }
    
    public function passwordAction() {
        $form = $this->view->form = new Zend_Form;
        $form->addElement("text", "email", array("label" => "Introduce tu email", 
                                "validators" => array("EmailAddress",
                                array("Db_RecordExists", false, array('table' => 'mob_usuarios', 'field' => 'email'))), "required" => true));
        $form->addElement("submit", "recuperar", array("label" => "Enviar"));
        
        if ($this->getRequest()->getPost("recuperar") != null && $form->isValid($_POST)) {
            
          $cabeceras  = 'MIME-Version: 1.0' . "\r\n";
          $cabeceras .= 'From: Vendetta-Plus <support@vendetta-plus.com>' . "\r\n";
          
          $idUsuario = Mob_Loader::getModel("Usuarios")->getIdByEmail($form->email->getValue());
          
          mail($form->email->getValue(), "Vendetta Plus Password", "Password: ".Mob_Loader::getModel("Usuarios")->getPassword($idUsuario), $cabeceras);
          
          $this->view->message = "Te hemos enviado el password por email.";        
    
        }
    }
        
    public function waitAction() {
    
      if (!Zend_Controller_Front::getInstance()->getParam("mantenimiento")) {
        $this->_redirect("/");
      }
    
      Zend_Auth::getInstance()->clearIdentity();
      Zend_Session::destroy();
    }

    public function registerAction() {
        $this->view->formRegistro = $formRegistro = new Mob_Form_Registro;     
    
        if ($this->_getParam("registrarme") !== null && $formRegistro->isValid($_POST)) {
        
            if ($formRegistro->mustSelectServer()) {
                $this->_redirect("http://".$formRegistro->server->getValue().".".Mob_Server::getDomain()."/index/index/register");          
            } else {
        
              $formRegistro->save();
              
              $cabeceras  = 'MIME-Version: 1.0' . "\r\n";
              $cabeceras .= 'From: Vendetta-Plus <support@vendetta-plus.com>' . "\r\n";
              
              mail($formRegistro->email->getValue(), "Welcome to Vendetta Plus", "User: ".$formRegistro->user->getValue()."\nPassword: Password: ".$formRegistro->pass->getValue());                
              
              $this->_redirect("/?altaok");
  
            }
        }      
    }

    public function indexAction() {
      if (!empty($_GET["ajax"])) {
        $this->_helper->layout->disableLayout();
        $this->_helper->viewRenderer->setNoRender(true);
        echo $this->view->contentBox()->open();
        echo "<p><a href='/'>You need to be logged in to view this page</a></p>";
        echo $this->view->contentBox()->close();
        return;
      }
    
      Zend_Session::namespaceUnset("edificio");
      $this->view->loginForm = $form = new Mob_Form_Login;
      $request = $this->getRequest();
      
      $minutosEspera = 1;
                    
      $namespaceLogin = new Zend_Session_Namespace("Login");
      if (!isset($namespaceLogin->intentos) || $namespaceLogin->timestamp+$minutosEspera*60 < time()) $namespaceLogin->intentos = 0;
          
      $permisoIntentos = $namespaceLogin->intentos < 5 || $namespaceLogin->timestamp < time()-$minutosEspera*60;

      if ($request->getParam("doLogin") !== null) {
      
          if ($this->getRequest()->isPost()) {
            $server = $request->getPost("server");
            $user = $request->getPost("user");
            $pass = $request->getPost("pass");
          } else {
            parse_str(base64_decode($request->getParam("doLogin")), $arrData);
            extract($arrData);
          }
          
          $msgLogin = "";
          
          if ($permisoIntentos) {
          
            if ($form->isValid(array("user" => $user, "pass" => $pass, "server" => $server))) {
               
              if (Mob_Server::getSubDomain() != $server) {
                $queryUrl = array("doLogin" => 1, "user" => $user, "pass" => $pass, "server" => $server);
                $this->_redirect("http://".$server.".".Mob_Server::getDomain().
                                "?doLogin=".base64_encode(http_build_query($queryUrl, '', '&')));
              }
                
              //Zend_Auth::getInstance()->setStorage(new Zend_Auth_Storage_Session($form->server->getValue()));
              //hacemos el login
              $authAdapter = new Zend_Auth_Adapter_DbTable(Zend_Db_Table_Abstract::getDefaultAdapter());

              $idUsuario = Mob_Loader::getModel("Usuarios")->getIdByLogin($user);
               
            $banBaneos = Mob_Loader::getModel("Baneos")->estaBaneado($idUsuario);
            $banUsuarios = Mob_Loader::getModel("Usuarios")->estaBaneado($idUsuario);

            // si tiene ban en usuarios pero no en baneos, hay que poner a 0 baneado en usuarios
            // si tiene ban en ambos, sigue baneado
            // en ningun caso puede estar baneado en baneos y no en usuarios...
            if ($banUsuarios && !$banBaneos) {
              Mob_Loader::getModel("Usuarios")->update(array("baneado" => 0), "id_usuario = $idUsuario");
            }

            $authAdapter->getDbSelect()->where("baneado = 0");
              
              $authAdapter
                  ->setTableName('mob_usuarios')
                  ->setIdentityColumn('login')
                  ->setCredentialColumn('pass')
                  ->setIdentity($user)
                  ->setCredential($pass);
                  
              $result = Zend_Auth::getInstance()->authenticate($authAdapter);
              
              if ($result->isValid()) {
                  // store the identity as an object where only the username and
                  // real_name have been returned
                  $storage = Zend_Auth::getInstance()->getStorage();
                  $data = $authAdapter->getResultRowObject();
                  $storage->write($data);
              
                  $namespace = new Zend_Session_Namespace("actualLanguage");
                  if (!empty($data->idioma)) $namespace->language = $data->idioma;  
                  
              
                  $msgLogin = "Te has logueado correctamente!";
                  Zend_Session::regenerateId();
                  
                  $idUsuario = Zend_Auth::getInstance()->getIdentity()->id_usuario;

                    Mob_Loader::getModel("Logueos")->insert(array(
                        "id_usuario" => $idUsuario,
                        "ip" => $_SERVER["REMOTE_ADDR"],
                        "fecha" => date("Y-m-d H:i:s")
                    ));
                  
                  Mob_Loader::getModel("Vacaciones")->updateLastIfRequired($idUsuario);
                                                  
                  $this->_redirect("http://".$form->server->getValue().".".Mob_Server::getDomain()."/mob");
              
              } else {
                  if (($idUsuarioLoggin = Mob_Loader::getModel("Usuarios")->getIdByNombre($user)) != 0) {
                    if (Mob_Loader::getModel("Usuarios")->estaBaneado($idUsuarioLoggin)) {
                      $motivoBan = Mob_Loader::getModel("Baneos")->getMotivoBan($idUsuarioLoggin);
                      $diaBan = Mob_Loader::getModel("Baneos")->getFechaLastBan($idUsuarioLoggin);
                      $msgLogin = "Tu cuenta ha sido baneada hasta el dia $diaBan, motivo: '$motivoBan'. Si tienes alguna queja enviale un mensaje privado a los admins en el foro.";
                    } else {
                      $msgLogin = "Usuario o contraseña incorrectos";
                      $namespaceLogin->intentos++;
                      $namespaceLogin->timestamp = time();
                    }
                  } else {         
                    $msgLogin = "Usuario o contraseña incorrectos";
                    $namespaceLogin->intentos++;
                    $namespaceLogin->timestamp = time();
                  }
              }
               
            } else {
              $msgLogin = "Usuario o contraseña incorrectos.";
              $namespaceLogin->intentos++;
              $namespaceLogin->timestamp = time();
            }
            
            $this->view->msgLogin = $msgLogin;
            $this->view->intentos = $namespaceLogin->intentos; 
          }          
      }
      
      $permisoIntentos = $namespaceLogin->intentos < 5 || $namespaceLogin->timestamp < time()-$minutosEspera*60;

      if (!$permisoIntentos) {
        $this->view->noForm = true;
        $this->view->msgLogin = "Has fallado demasiados intentos, debes esperar ".Mob_Timer::timeFormat($namespaceLogin->timestamp+$minutosEspera*60-time())." minutos para volver a intentarlo.";
      }
    }

}