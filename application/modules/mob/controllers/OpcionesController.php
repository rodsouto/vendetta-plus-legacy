<?php

class Mob_OpcionesController extends Mob_Controller_Action {
    
    public function indexAction() {

    }
    
    public function mailAction() {
      $this->view->form = $form = new Mob_Form_Email;
      $form->setIdUsuario($this->idUsuario);
      if ($this->getRequest()->getPost("cambiar") !== null && $form->isValid($_POST)) {
        Mob_Loader::getModel("Usuarios")->update(array("email" => $form->email_nuevo1->getValue()), "id_usuario = ".(int)$this->idUsuario);
        $this->_sendMail($form->email->getValue(), $this->view->t("Cambio de email"), sprintf($this->view->t("Tu nuevo email es x"), $form->email_nuevo1->getValue()));
        $this->view->messageOk = true;
      }   
    }
    
    public function passwordAction() {
      $this->view->form = $form = new Mob_Form_Password;
      $form->setIdUsuario($this->idUsuario);
      if ($this->getRequest()->getPost("cambiar") !== null && $form->isValid($_POST)) {
        Mob_Loader::getModel("Usuarios")->update(array("pass" => $form->password_nuevo1->getValue()), "id_usuario = ".(int)$this->idUsuario);
        $this->_sendMail(Mob_Loader::getModel("Usuarios")->getEmail($this->idUsuario), $this->view->t("Cambio de password"), sprintf($this->view->t("Tu nuevo password es x"), $form->password_nuevo1->getValue()));
        $this->view->messageOk = true;
      }
    }
    
    public function deleteAction() {
    
      if (isset($_GET["delete"])) {
        $idUsuario = (int)$this->idUsuario;
        try {
          $db = Zend_Db_Table_Abstract::getDefaultAdapter();
          $db->beginTransaction();        
          Mob_Loader::getModel("Usuarios")->delete("id_usuario = ".$idUsuario);

          $queryTropas = "DELETE FROM mob_tropas WHERE id_edificio 
          IN (SELECT id_edificio FROM mob_edificios WHERE id_usuario = ".$idUsuario.")";
          $db->query($queryTropas);

          Mob_Loader::getModel("Edificio")->delete("id_usuario = ".$idUsuario);
          
          Mob_Loader::getModel("Entrenamiento")->delete("id_usuario = ".$idUsuario);
          Mob_Loader::getModel("Entrenamiento_Nuevo")->delete("id_usuario = ".$idUsuario);
          
          $idFamilia = Mob_Loader::getModel("Familias_Miembros")->getIdFamilia($idUsuario);
          
          if (Mob_Loader::getModel("Familias_Miembros")->esCapo($idUsuario, $idFamilia)) {
            Mob_Loader::getModel("Familias")->borrar($idFamilia);
          } 
  
          Mob_Loader::getModel("Familias_Mensajes")->delete("id_usuario = ".$idUsuario);
          Mob_Loader::getModel("Familias_Miembros")->delete("id_usuario = ".$idUsuario);
          Mob_Loader::getModel("Familias_Solicitudes")->delete("id_usuario = ".$idUsuario);
          
          Mob_Loader::getModel("Habitacion")->delete("id_usuario = ".$idUsuario);
          Mob_Loader::getModel("Habitacion_Nueva")->delete("id_usuario = ".$idUsuario);
          
          Mob_Loader::getModel("Mensajes")->delete("remitente = $idUsuario OR destinatario = $idUsuario");
          
          Mob_Loader::getModel("Misiones")->delete("id_usuario = ".$idUsuario);
          
          Mob_Loader::getModel("Tropa_Nueva")->delete("id_usuario = ".$idUsuario);
          $db->commit();
        } catch (Exception $e) {
          $db->rollBack();
        }          
        Zend_Session::destroy();
        $this->_redirect("/");
      }
    }
    
    protected function _sendMail($para, $titulo, $mensaje) {
      $cabeceras  = 'MIME-Version: 1.0' . "\r\n";
      $cabeceras .= 'From: Vendetta-Plus <support@vendetta-plus.com>' . "\r\n";
      return mail($para, $titulo, $mensaje, $cabeceras);        
    }
    
    public function configuracionAction() {
      $form = $this->view->form = new Mob_Form_Configuracion;
      
      if ($this->getRequest()->getPost("configuracion") && $form->isValid($_POST)) {
        $form->save($this->idUsuario);
      }
    }
    
    public function nameAction() {
      if (Mob_Loader::getModel("Nombres")->puedeCambiar($this->idUsuario)) {
        $this->view->form = $form = new Mob_Form_Username;
        $form->setIdUsuario($this->idUsuario);
        if ($this->getRequest()->getPost("cambiar") !== null && $form->isValid($_POST)) {
          Mob_Loader::getModel("Nombres")->insert(array(
                                                    "id_usuario" => $this->idUsuario, 
                                                    "nombre" => Mob_Loader::getModel("Usuarios")->getUsuario($this->idUsuario),
                                                    "nombre_nuevo" => $form->username->getValue(),
                                                    "fecha" => date("Y-m-d H:i:s")
                                                  )
                                                );
          Mob_Loader::getModel("Usuarios")->update(array("usuario" => $form->username->getValue()), "id_usuario = ".(int)$this->idUsuario);
          Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_MATCHING_ANY_TAG, array('rankingFamilias', 'rankingUsuarios'));
          $this->view->messageOk = true;
        }
      } else {
        $this->view->messageOk = true;;
      }    
    }
    
    public function vacacionesAction() {
    
        $estaDeVacaciones = Mob_Loader::getModel("Vacaciones")->estaDeVacaciones($this->idUsuario);
        $this->view->tieneMisionesActivas = Mob_Loader::getModel("Misiones")->tieneMisionesActivas($this->idUsuario);
        
        if ($this->getRequest()->getParam("activar") == 1 && !$estaDeVacaciones && !$this->view->tieneMisionesActivas) {
            Mob_Loader::getModel("Vacaciones")->insert(
                    array("id_usuario" => $this->idUsuario, 
                    "fecha_inicio" => date("Y-m-d H:i:s"))
                    );
        } elseif ($this->getRequest()->getParam("desactivar") == 1 && $estaDeVacaciones) {
        
            $ultima = Mob_Loader::getModel("Vacaciones")->getUltima($this->idUsuario);
            
            if (!empty($ultima)) {
                Mob_Loader::getModel("Vacaciones")->update(array("fecha_fin" => date("Y-m-d H:i:s")), "id_vacacion = ".$ultima["id_vacacion"]);
            }
        
        }
        
    }
    
    

}