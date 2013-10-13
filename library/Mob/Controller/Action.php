<?php

class Mob_Controller_Action extends Zend_Controller_Action {

    protected $_jugador;

    public function init() {
        $ajaxContext = $this->_helper->getHelper('AjaxContext');
        $ajaxContext->addActionContext('index', 'html')
        ->addActionContext('poderataque', 'html')
        ->addActionContext('misiones', 'html')
        ->addActionContext('ver', 'html')
        ->addActionContext('nuevo', 'html')
        ->addActionContext('listado', 'html')
        ->addActionContext('configuracion', 'html')
        ->addActionContext('mail', 'html')
        ->addActionContext('password', 'html')
        ->addActionContext('delete', 'html')
        ->addActionContext('miembros', 'html')
        ->addActionContext('correo', 'html')
        ->addActionContext('administrar', 'html')
        ->addActionContext('borrar', 'html')
        ->addActionContext('cambiar', 'html')
        ->addActionContext('solicitud', 'html')
        ->addActionContext('abandonar', 'html')
        ->addActionContext('name', 'html')
        ->addActionContext('guerra', 'html')
        ->addActionContext('rendicion', 'html')
        ->addActionContext('simulador', 'html')
        ->addActionContext('setup', 'html')
        ->setSuffix("html", "phtml", false)
        ->initContext();
    }
    
    public function preDispatch() {
      if (Zend_Auth::getInstance()->hasIdentity() && !Zend_Registry::isRegistered("barraRecursos") 
            && $this->getRequest()->getModuleName() != "admintool") {
        $this->getResponse()->appendBody($this->view->barraRecursos());
        
        if (isset($_POST["guardarTest"]) && Mob_Server::getSubDomain() == "test") {
          $form = $this->view->testBar("form");
          if ($form->isValid($_POST)) {
            foreach($form->getValues() as $type => $data) {
              foreach ($data as $name => $val) {
                if ($type == "tropas") {
                  Mob_Loader::getModel("Tropa")->setTropa($this->idEdificio, $name, $val);
                } elseif ($type == "habitaciones") {
                  Mob_Loader::getModel("Habitacion")->setHabitacion($this->idEdificio, $name, $val);
                } elseif ($type == "entrenamientos") {
                  Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($this->idUsuario, $name, $val);
                }
              }
            }
            $this->getRequest()->setParam("updatePuntos", $this->idUsuario);
          }
        }        
        
      }
      
      Zend_Registry::set("barraRecursos", true);
    }

    public function __construct(Zend_Controller_Request_Abstract $request, Zend_Controller_Response_Abstract $response, array $invokeArgs = array())
    {
        $this->setRequest($request)
             ->setResponse($response)
             ->_setInvokeArgs($invokeArgs);
        $this->_helper = new Zend_Controller_Action_HelperBroker($this);
       
        $controllerAccess = array("buscar", "jugador", "familias", "mapa", "records", "entrenamiento", "habitaciones", "clasificacion", "batallas", "reclutamiento", "seguridad");
        $actionAccess = array("familias" => array("ver", "miembros"));
                                                      
        if (!Zend_Auth::getInstance()->hasIdentity()) {
          $validController = in_array($this->getRequest()->getControllerName(), $controllerAccess);
          $validAction = !isset($actionAccess[$this->getRequest()->getControllerName()]) ||
                            in_array($this->getRequest()->getActionName(), $actionAccess[$this->getRequest()->getControllerName()]);
          
          if ($this->getRequest()->getControllerName() == "familias" && $this->getRequest()->getParam("idf") === null) $validController = false;
          if (!$validController || !$validAction) {
            $this->_redirect("/?ajax=".(int)$this->getRequest()->isXmlHttpRequest());
          }
        } else {
        
          $this->_jugador = Zend_Registry::get("jugadorActual");
          
          $userData = Zend_Auth::getInstance()->getIdentity();
          
          $this->idUsuario = $this->view->idUsuario = $userData->id_usuario;
          
          $namespaceEdificio = new Zend_Session_Namespace("edificio");
                  
          $this->idEdificio = $this->view->idEdificio = $namespaceEdificio->edificio;
          
          $this->edificioActual = $this->view->edificioActual = $this->_jugador->getEdificioActual();
        
        }
        
        $this->init();
    }
    
    public function getModel($model) {
      return Mob_Loader::getModel($model);
    }

}