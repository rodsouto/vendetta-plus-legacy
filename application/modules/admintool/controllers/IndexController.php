<?php

class Admintool_IndexController extends Mob_Controller_Action {

    protected $_rolesUser;

    protected $_menuItems = array(      
      // array(Texto Link, action)   
      array("Home", "go"),
      array("Team", "roles"),
      array("Ips compartidas", "sharedips"),
      array("Bans", "ban"),
      array("Translate", "translate")
    );

    public function init(){    
      $this->idUsuario = Zend_Auth::getInstance()->getIdentity()->id_usuario;
      $options = $this->getInvokeArg('bootstrap')->getOptions();
      //$access = $options["admintool"][Mob_Server::getGameType()][Mob_Server::getSubDomain()];
      
      $configRoles = include APPLICATION_PATH . "/configs/roles.php";
      
      $validActions = array();
      
      $this->_rolesUser = $rolesUser = Mob_Loader::getModel("Roles")->getRolesByUser($this->idUsuario);
      
      if (!empty($rolesUser)) {      
        $validActions[] = "index";
      }
      
      foreach ($rolesUser as $rol) {
        if (empty($configRoles[$rol])) continue;
        $validActions = array_merge($validActions, $configRoles[$rol]); 
      }

      $menu = array();
      foreach ($this->_menuItems as $i) {
        if (!in_array(0, $rolesUser) && !in_array($i[1], $validActions)) continue;
        $menu[] = "<a href='/admintool/index/".$i[1]."'>".$i[0]."</a>";
      }
    
      $this->getResponse()->appendBody(
        $this->view->contentBox()->open()
        ."<p>".implode(" | ", $menu)."</p>"
        .($this->getRequest()->getParam("user") != null && (in_array(0, $rolesUser) || in_array("user", $validActions)) 
            ? "<p><a href='/admintool/index/user/id/".$this->getRequest()->getParam("user")."'>
              Volver a ".Mob_Loader::getModel("Usuarios")->getFullName($this->getRequest()->getParam("user"))."</a></p>"
            : "")
        .$this->view->contentBox()->close());
    
      if (
          // si no esta logueado
          !Zend_Auth::getInstance()->hasIdentity() 
            ||
            // o no tiene super acceso y no tiene acceso a una seccion en particular 
            (!in_array(0, $rolesUser)
            && !in_array($this->getRequest()->getActionName(), $validActions))
          ) {
        $this->_redirect("/");
      }
             
    }
    
    public function indexAction() {
      // super admins y go
      if (in_array(0, $this->_rolesUser) || in_array(1, $this->_rolesUser)) $this->_redirect("/admintool/index/go");
      
      // traductores
      if (in_array(2, $this->_rolesUser)) $this->_redirect("/admintool/index/translate"); 
    }
    
    public function goAction() {
      $form = $this->view->form = new Zend_Form;
      $form->addElement("text", "nombre", array("label" => "Nombre:"));
      $form->addElement("text", "id", array("label" => "Id:"));
      $form->addElement("submit", "enviar", array("label" => "Buscar"));
      
      $formIp = $this->view->formIp = new Zend_Form(array("action" => "/admintool/index/ip"));
      $formIp->addElement("text", "find", array("required" => true, "label" => "Ip a buscar"));
      $formIp->addElement("submit", "enviar", array("label" => "Buscar Ip"));
      
      if ($this->getRequest()->isPost() && $form->isValid($_POST)) {
        if ($form->nombre->getValue() != null) {
            $this->view->usuarios = Mob_Loader::getModel("Usuarios")->buscar($form->nombre->getValue());
        } else {
            $this->view->usuarios = Mob_Loader::getModel("Usuarios")->find((int)$form->id->getValue());
        }
      }
      
    }
    
    public function misionesAction() {
      $form = $this->view->form = new Zend_Form;
      $misiones = array(0 => "Todas", 1 => "mision_1", 2 => "mision_2", 3 => "mision_3", 4 => "mision_4");
      $form->addElement("select", "tipo_mision", array("label" => "Tipo mision", "multiOptions" => $misiones));
      $form->addElement("submit", "enviar", array("label" => "Enviar"));
      $form->isValid($_POST);

      $this->view->idUsuario = (int)$this->_getParam("user", 0);
    }
    
    public function userAction() {
      $this->view->idUsuario = (int)$this->_getParam("id");
    }
    
    public function banAction() {
      $this->view->form = $form = new Mob_Form_Banear;
      
      if (isset($_GET["id_usuario"])) $this->view->form->id_usuario->setValue((int)$_GET["id_usuario"]);
      
      $namespace = new Zend_Session_Namespace("dataBaneo");
      
      if (($banear = (int)$this->getRequest()->getQuery("banear", 0)) != 0 && !empty($namespace->data)) {
        Mob_Loader::getModel("Usuarios")->update(array("baneado" => 1), "id_usuario = ".$banear);
        
        Mob_Loader::getModel("Baneos")->insert(array(
                                                  "id_usuario" => $banear,
                                                  "id_admin" => $this->idUsuario,
                                                  "fecha" => date("Y-m-d H:i:s"),
                                                  "motivo" => $namespace->data["motivo"],
                                                  "fecha_fin" => $namespace->data["fecha_fin"]
                                                  )
                                                );
                                                
        Zend_Session::namespaceUnset("dataBaneo");  
      }
      
      if (($desbanear = (int)$this->getRequest()->getQuery("desbanear", 0)) != 0 && isset($_GET["desbaneado"])) {
        Mob_Loader::getModel("Usuarios")->update(array("baneado" => 0), "id_usuario = ".$desbanear);  
      }
      
      if ($this->getRequest()->isPost() && $form->isValid($_POST)) {
        $namespace->data = $form->getValues();
        $this->view->usuarioBanear = Mob_Loader::getModel("Usuarios")->find($form->id_usuario->getValue())->toArray();
      }
    }    

    public function translateAction() {
      $this->view->idiomas = Mob_Server::getIdiomas();
      
      $action = $this->view->action = $this->getRequest()->getParam("do");

      if (isset($_GET["exportTextos"])) {
        Mob_Loader::getModel("Textos")->export();
      }

      if ($action != null) {
      
        if ($action == "add") {
                                   
          $this->view->form = $form = new Mob_Form_Admin_Traducir;
          $form->build($this->view->idiomas, $this->_getParam("ref_edit"));
          
          if ($this->getRequest()->isPost() && $form->isValid($_POST)) {
            if ($form->save()) {
              //$this->_redirect("/admintool/index/translate");
              $form->reset();
            }
          }
        } elseif ($action == "list") {
            $form1 = $this->view->form1 = new Zend_Form;
            $form1->addElement("text", "palabra", array("label" => "Palabra"));
            $form1->addElement("submit", "filtrar", array("label" => "Buscar"));
          
            $form = $this->view->form = new Mob_Form_Admin_TraducirAll;
            $form->build($this->getRequest()->getParam("lang"), $this->getRequest()->getParam("palabra"), $this->_getParam("page", 1));
            $this->view->paginator = $form->getPaginator();
            if ($this->getRequest()->getPost("guardar") != null && $form->isValid($_POST)) {
                $form->save();
            }
        }     
      
      }
      
    }
    
    public function errorsAction() {
      
    }
    
    public function changemailAction() {
      $this->view->form = $form = new Mob_Form_Admin_Email;
      $idUsuarioMail = $this->view->idUsuarioMail = (int)$this->getRequest()->getParam("user");
      $form->setIdUsuario($idUsuarioMail);
      if ($this->getRequest()->getPost("cambiar") !== null && $form->isValid($_POST)) {
        Mob_Loader::getModel("Usuarios")->update(array("email" => $form->email->getValue()), "id_usuario = ".(int)$idUsuarioMail);
        $this->view->messageOk = true;
      }        
    }
    
    public function changepassAction() {
      $this->view->form = $form = new Mob_Form_Admin_Password;
      $idUsuarioPass = $this->view->idUsuarioPass = (int)$this->getRequest()->getParam("user");
      $form->setIdUsuario($idUsuarioPass);
      if ($this->getRequest()->getPost("cambiar") !== null && $form->isValid($_POST)) {
        Mob_Loader::getModel("Usuarios")->update(array("pass" => $form->password->getValue()), "id_usuario = ".(int)$idUsuarioPass);
        $this->view->messageOk = true;
      }
    }        
    
    public function supercuentasAction() {
       die("desactivado");
    }
    
    public function tropasAction() {
      $form = $this->view->form = new Zend_Form;
      $form->setAction("/admintool/index/tropas");
      $form->addElement("text", "usuario", array("label" => "Nombre de usuario", "required" => true));
      $form->addElement("submit", "enviar", array("label" => "Buscar"));
      
      if (isset($_GET["usuario"])) {
        $_POST["usuario"] = $_GET["usuario"];
      }

      if (isset($_POST["usuario"]) && $form->isValid($_POST)) {
        $idUsuario = Mob_Loader::getModel("Usuarios")->getIdByNombre($form->usuario->getValue());
        $puntosTropas = 0;
        $tropas = $tropasUsuario = array();
        foreach (Mob_Data::getTropas() as $t) {
            $t = Mob_Loader::getTropa($t);
            $tropas[$t->getNombreBdd()] = $t->getPuntos();
            $tropasUsuario[$t->getNombreBdd()] = 0;
        }
            
        foreach (Mob_Loader::getModel("Edificio")->fetchAll("id_usuario = ".$idUsuario) as $edi) {
            foreach (Mob_Loader::getModel("Tropa")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataTropa) {
              foreach ($tropas as $tropa => $pts) {
                  $tropasUsuario[$tropa] += $dataTropa[$tropa];
                  $puntosTropas += $dataTropa[$tropa] * $pts;
              }
            }
        }
        
        foreach (Mob_Loader::getModel("Misiones")->fetchAll("id_usuario = ".$idUsuario) as $mision) {
          foreach (Zend_Json::decode($mision->tropas) as $tropa => $cantidad) {
            $tropasUsuario[lcfirst($tropa)] += $cantidad;
            $puntosTropas += $cantidad * $tropas[lcfirst($tropa)];  
          }
        }
        
        $this->view->tropasUsuario = $tropasUsuario;
        $formAgregar = $this->view->formAgregar = new Zend_Form;
        $formAgregar->setDescription("Cantidad de tropas a agregar (".$this->view->numberFormat($puntosTropas).")")->addDecorator("Description", array("placement" => "prepend", "tag" => "h2"));
        $subForm = new Zend_Form_SubForm;
        foreach ($tropasUsuario as $tropa => $cantidad) {
          $subForm->addElement("text", $tropa, array("label" => Mob_Loader::getTropa($tropa)->getNombre()." (".$this->view->numberFormat($cantidad).")", 
            "validators" => array(
                "Int", 
                array("GreaterThan", false, array(0))
                )
              )
            );
        }
        $formAgregar->addSubform($subForm, "tropas");
        $formAgregar->addElement("submit", "agregar", array("label" => "Agregar Tropas"));      
        $formAgregar->addElement("hidden", "usuario", array("value" => $_POST["usuario"]));
        
        if (isset($_POST["agregar"]) && $formAgregar->isValid($_POST)) {
          $values = $formAgregar->getValues();
          $idPrincipal = Mob_Loader::getModel("Habitacion")->getIdEdificioPrincipal($idUsuario);
          if (empty($idPrincipal)) die("Error... avisar a haunter :S");
          Mob_Loader::getModel("Tropa")->sumarTropas($idPrincipal, array_filter($values["tropas"]));
          $this->_redirect("/admintool/index/tropas?usuario=".$_POST["usuario"]);
        }
        
      }
    }
    
    public function ipAction() {
      $this->view->ip = $this->_getParam("find", '');
    }
    
    public function mensajesAction() {
      $model = Mob_Loader::getModel("Mensajes");
      $count = 50;
      $page = $this->getRequest()->getParam("page", 1);
      $query = $model->select()->order("id_mensaje DESC")->where("remitente != 0")->limitPage($page, $count);
      $user = $this->view->idUsuarioMensajes = (int)$this->getRequest()->getParam("user");
      if (!empty($user)) {
        $query->where("remitente = $user OR destinatario = $user");
      }
      $this->view->mensajes = $model->fetchAll($query)->toArray();
      $this->view->paginator = Zend_Paginator::factory($query);
      $this->view->paginator->setCurrentPageNumber($page)->setItemCountPerPage($count);
    }
    
    public function rolesAction() {
      $form = $this->view->form = new Mob_Form_Admin_NewRole;
      
      if ($this->getRequest()->isPost() && $form->isValid($_POST)) {
        $form->save();
      }
      
      if (isset($_GET["delete"])) {
        Mob_Loader::getModel("Roles")->delete("id = ".(int)$_GET["delete"]);
      }
    
    }
    
    public function entrenamientosAction() {
      $this->view->idUsuario = (int)$this->_getParam("user");  
    }
    
    public function edificiosAction() {
      $this->_helper->layout->setLayout("visionglobal");
      $this->getResponse()->clearBody();
      $this->view->idUsuario = (int)$this->_getParam("user"); 
    }
    
    public function sharedipsAction() {
    
      if ($this->getRequest()->getParam("eliminar") != null) {
        Mob_Loader::getModel("IpsCompartidas")->delete("id_compartida = ".(int)$this->getRequest()->getParam("eliminar"));  
      }
    
      $form = $this->view->form = new Zend_Form;
      $form->addElement("text", "id_usuario_1", array("label" => "Id usuario 1", "required" => true));
      $form->addElement("text", "id_usuario_2", array("label" => "Id usuario 2", "required" => true));
      $form->addElement("submit", "agregar", array("label" => "Agregar", "ignore" => true));
      
      if ($this->getRequest()->isPost() && $form->isValid($_POST)) {
        Mob_Loader::getModel("IpsCompartidas")->insert($form->getValues());
      }
    }

}