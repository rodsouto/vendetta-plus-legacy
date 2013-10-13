<?php

class Mob_FamiliasController extends Mob_Controller_Action {
    
    public function init() {
      parent::init();
      $this->view->miIdFamilia = $this->miIdFamilia = $this->_jugador != null ? (int)$this->_jugador->getIdFamilia() : 0;    
    }
    
    public function indexAction() {
    
        if (isset($_GET["cancelarSolicitud"]) && !empty($this->idUsuario)) {
          Mob_Loader::getModel("Familias_Solicitudes")->delete("id_usuario = ".(int)$this->idUsuario);
        }
    
        if ($this->_jugador != null && $this->_jugador->tieneFamilia() && !empty($this->idUsuario)) {
            //$this->_redirect("/mob/familias/ver?idf=".$this->miIdFamilia);
            $this->_forward("ver");
            return;
        }
    }
    
    public function fundarAction() {
        $this->view->formFundar = $form = new Mob_Form_Familia_Fundar;
        
        if ($this->getRequest()->getPost("fundar") !== null && $form->isValid($_POST)) {
            $idFamilia = $form->save($this->idUsuario);
            Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('rankingFamilias', 'rankingUsuarios'));
            $this->_redirect("/mob/familias/ver?idf=".(int)$idFamilia);
        }
        
    }
    
    public function verAction() {
        $this->view->idFamilia = $this->_getParam("idf", $this->view->miIdFamilia);
        $this->view->esMiFamilia = $esMiFamilia = $this->view->miIdFamilia == $this->view->idFamilia;
         
        if ($esMiFamilia) {
        
            if ($this->getRequest()->getQuery("delm") !== null) {
                Mob_Loader::getModel("Familias_Mensajes")->delete("id_familia ={$this->view->miIdFamilia} AND id_mensaje = ".(int)$this->getRequest()->getQuery("delm"));
                Mob_Cache_Factory::getInstance("query")->remove('getByFamilia'.$this->view->miIdFamilia);
            }
        
            $this->view->formNuevoMensaje = $formNuevoMensaje = new Mob_Form_Familia_Mensaje;
            
            if ($this->getRequest()->getPost("escribir") !== null && $formNuevoMensaje->isValid($_POST)) {
                $formNuevoMensaje->save($this->idUsuario, $this->view->idFamilia);
            }
        }
    }
    
    public function cambiarAction() {
    
        if ($this->_getParam("descripcion") !== null) {
            $this->view->form = $form = new Mob_Form_Familia_Descripcion;
            $this->view->titulo = "Añadir/cambiar descripción de la familia";
        } elseif ($this->_getParam("logo") !== null) {
            $this->view->form = $form = new Mob_Form_Familia_Logo;
            $this->view->titulo = "Subir logo";
        /*} elseif ($this->_getParam("web") !== null) {
            $this->view->form = $form = new Mob_Form_Familia_Web;
            $this->view->titulo = "Cambiar página web de la familia";*/
        } else{
            //nombre
            $this->view->form = $form = new Mob_Form_Familia_Fundar;
            $this->view->titulo = "Cambiar abreviatura o nombre de la familia";
        }
        
        $form->build($this->_jugador->getIdFamilia());
        
        $this->view->formGuardado = false;
        $formEnviado = isset($_POST["subir"]) || isset($_POST["guardar"]) || isset($_POST["fundar"]);
        if ($formEnviado && $form->isValid($_POST)) {
            $this->view->formGuardado = true;
            $form->save($this->_jugador->getIdFamilia());
        }
    
    }
    
    public function borrarAction() {
        if (Mob_Loader::getModel("Familias_Miembros")->esCapo($this->idUsuario, $this->_jugador->getIdFamilia())) {
        
            if (isset($_GET["byebye"])) {
                Mob_Loader::getModel("Familias")->borrar($this->_jugador->getIdFamilia());
                Mob_Loader::getModel("Mensajes")->aviso($this->idUsuario, "familia_disuelta", 
                    $this->view->t("familia_disuelta"));
                Mob_Loader::getModel("Guerras")->darPorPerdidas($this->_jugador->getIdFamilia());
                Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('rankingFamilias', 'rankingUsuarios'));
                $this->_redirect("/mob/familias");
            }
        
        }
    }
    
    public function abandonarAction() {
        $idFamilia = $this->_jugador->getIdFamilia();
        if (!Mob_Loader::getModel("Familias_Miembros")->esCapo($this->idUsuario, $idFamilia)) {
        
            if (isset($_GET["byebye"])) {
                Mob_Loader::getModel("Familias_Miembros")->abandonarFlia($this->idUsuario);
                Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('getListadoMiembros'.$idFamilia));
                Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('rankingFamilias', 'rankingUsuarios'));
                $this->_redirect("/mob/familias");
            }
        
        }
    }
    
    public function solicitudAction() {
        $idRango = Mob_Loader::getModel("Familias_Miembros")->getIdRango($this->miIdFamilia, $this->idUsuario);
        $this->view->idFamilia = $this->getRequest()->getParam("ver");
 
        if ($this->getRequest()->getParam("enviar") !== null || $this->getRequest()->getParam("solicitar") !== null) {
          $this->view->accion = "enviar"; 
          $this->view->form = $form = new Mob_Form_Familia_Solicitud;
          $form->setIdFamilia($this->getRequest()->getParam("enviar"));
          $this->view->formGuardado = false;
          
          if ($this->getRequest()->getPost("solicitar") !== null && $form->isValid($_POST)) {
              $form->save($this->getRequest()->getParam("enviar"), $this->idUsuario);
              $this->view->formGuardado = true;
          }
        } else {
        
          if ($this->view->idFamilia != $this->miIdFamilia || !Mob_Loader::getModel("Familias_Rangos")->puede($idRango, "aceptar_miembro")) {
            $this->view->warning = true;
            return;  
          }        
        
          $this->view->accion = "ver";
          
          if (($idSolicitud = $this->getRequest()->getParam("aceptar")) != null) {
            Mob_Loader::getModel("Familias_Solicitudes")->aceptar($idSolicitud);
            
            Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('getListadoMiembros'.$this->miIdFamilia));
            Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('rankingFamilias', 'rankingUsuarios'));
            
          } elseif (($idSolicitud = $this->getRequest()->getParam("rechazar")) != null) {
            Mob_Loader::getModel("Familias_Solicitudes")->rechazar($idSolicitud);
          }
        }
    
    }
    
    function miembrosAction() {
    
    }
    
    public function administrarAction() {
    
        $idFamilia = Mob_Loader::getModel("Familias_Miembros")->getIdFamilia($this->idUsuario);
        
        if (empty($idFamilia)) return;
        
        if (Mob_Loader::getModel("Familias_Miembros")->esCapoSubCapo($this->idUsuario, $idFamilia)) {

            if (isset($_GET["expulsar"]) && isset($_GET["bye"])) {
              Mob_Loader::getModel("Familias_Miembros")->abandonarFlia($_GET["expulsar"], $idFamilia);
              Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('getListadoMiembros'.$idFamilia));
              Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('rankingFamilias', 'rankingUsuarios'));
            }
        
            if (Mob_Loader::getModel("Familias_Miembros")->esCapo($this->idUsuario, $idFamilia)) {
              $this->view->formCapo = new Mob_Form_Familia_Capo;
              $this->view->formCapo->build($idFamilia);
            } 
        
            $this->view->formAdminMiembros = $formAdminMiembros = new Mob_Form_Familia_Miembros;
            $this->view->formAdminMiembros->build($idFamilia);
            
            $this->view->formAdminRangos = $formAdminRangos = new Mob_Form_Familia_Rangos_Admin;
            $this->view->formAdminRangos->build($idFamilia);
            
            $this->view->formAgregarRango = $formAgregarRango = new Mob_Form_Familia_Rangos_Nuevo;
            Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('getListadoMiembros'.$idFamilia));
            if ($this->getRequest()->getPost("guardarRangosAdmin") !== null) {
                if ($formAdminRangos->isValid($_POST)) $formAdminRangos->save($idFamilia);
            } elseif ($this->getRequest()->getPost("guardarRangosNuevo") !== null) {
                if ($formAgregarRango->isValid($_POST)) {
                    $formAgregarRango->save($idFamilia);
                    $this->_redirect("/mob/familias/administrar");
                }
            } elseif ($this->getRequest()->getPost("guardarRangosMiembros") !== null) {
                if ($formAdminMiembros->isValid($_POST)) $formAdminMiembros->save($idFamilia);
            } elseif ($this->getRequest()->getPost("guardarCapo") !== null && isset($this->view->formCapo)) {
                if ($this->view->formCapo->isValid($_POST)) {
                  $this->view->formCapo->save($this->idUsuario);
                }
            }
        
        }
    }
    
    public function correoAction() {
        $idFamilia = Mob_Loader::getModel("Familias_Miembros")->getIdFamilia($this->idUsuario);
          
        if (empty($idFamilia)) {
          $this->view->message = "<p>".$this->view->t("No tienes familia")."</p>";
          return;
        }

        $idRango = Mob_Loader::getModel("Familias_Miembros")->getIdRango($idFamilia, $this->idUsuario);
        
        if (Mob_Loader::getModel("Familias_Rangos")->puede($idRango, "enviar_circular")) {
          $this->view->form = $form = new Mob_Form_Familia_Correo;
          $form->build($idFamilia);
          if ($this->getRequest()->getPost("enviarCircular") !== null && $form->isValid($_POST)) {
            $form->save($this->idUsuario);
            $this->view->message = "<p>".$this->view->t("Mensaje enviado correctamente")."</p>";
          }
        } else {
          $this->view->message = "<p>".$this->view->t("No tienes permiso para enviar circulares").".</p>";
        }
    }
    
    public function guerraAction() {  
        $idf = $this->view->idFamilia = (int)$this->getRequest()->getParam("idf");
        
        $this->view->action = isset($_GET["view"]) ? "ver" : "declarar";
        
        if ($this->view->action == "ver") {
          // listado de las guerras
        } else {
           var_dump(Mob_Loader::getModel("Guerras")->estanEnGuerra($idf, $this->miIdFamilia));
          if ($this->miIdFamilia != $idf && Mob_Loader::getModel("Familias_Miembros")->esCapoSubCapo($this->idUsuario, $this->_jugador->getIdFamilia())
                  && !Mob_Loader::getModel("Guerras")->estanEnGuerra($idf, $this->miIdFamilia)) {
            $form = $this->view->form = new Mob_Form_Guerra_Declaracion;
            $form->build($idf);
            if ($this->getRequest()->getPost("declarar") !== null && $form->isValid($_POST)) {
              $form->save($this->_jugador->getIdFamilia());
              $this->view->message = "<p>".$this->view->t("Guerra declarada! Ahora si, oficialmente vale todo.")."</p>";
            }
          }
        }
    }
    
    public function rendicionAction() {  
        $idf = $this->view->idf = (int)$this->getRequest()->getParam("idf");
        $action = $this->view->action = $this->getRequest()->getParam("go", "default");
        $esCapo = Mob_Loader::getModel("Familias_Miembros")->esCapoSubCapo($this->idUsuario, $this->miIdFamilia);
        // 0 = rendicion; 1 = empate
        $type = (int)$this->getRequest()->getParam("type");
           
        if ($action == "ver") {
        
        } elseif ($action == "aceptar") {
          $this->view->action = "verMsg";
          if ($esCapo) {
            Mob_Loader::getModel("Guerras_Rendicion")->aceptar($this->miIdFamilia, $idf);
            $this->view->msg = $type == 1 ? "Solicitud aceptada, la guerra finaliza en empate." : "Solicitud aceptada, guerra ganada!";
          } else $this->view->msg = "Solo el capo puede hacer eso.";
        } elseif ($action == "rechazar") {
          $this->view->action = "verMsg";
          if ($esCapo) {
            Mob_Loader::getModel("Guerras_Rendicion")->rechazar($idf, $this->miIdFamilia);
            $this->view->msg = "Solicitud rechazada, continua la guerra!";
          } else $this->view->msg = "Solo el capo puede hacer eso.";
        } elseif ($action == "cancelar") {
          $this->view->action = "verMsg";
          if ($esCapo) {
            Mob_Loader::getModel("Guerras_Rendicion")->rechazar($this->miIdFamilia, $idf);
            $this->view->msg = "Continua la guerra con la familia ".Mob_Loader::getModel("Familias")->getNombre($idf);
          } else $this->view->msg = "Solo el capo puede hacer eso.";
        } else {
         
          if ($this->miIdFamilia != $idf && Mob_Loader::getModel("Familias_Miembros")->esCapo($this->idUsuario, $this->_jugador->getIdFamilia())) {
            $form = $this->view->form = new Mob_Form_Guerra_Rendicion;
            $form->build($idf, $type);
            if ($this->getRequest()->getPost("declarar") !== null && $form->isValid($_POST)) {
              $form->save($this->_jugador->getIdFamilia());
              $this->view->message = "<p>".$this->view->t("Rendicion enviada. Ahora debes esperar que desicion toma la familia enemiga.")."</p>";
            }
          }
          
        }
    }    

}