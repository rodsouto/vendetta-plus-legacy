<?php

class Mob_IndexController extends Mob_Controller_Action {
    
    protected $_controllerPluginUpdate = null;
    
    protected function _getPluginUpdate() {
      if ($this->_controllerPluginUpdate === null) {
        $this->_controllerPluginUpdate = new Mob_Controller_Plugin_Update;
      }

      return $this->_controllerPluginUpdate;
    }
    
    public function donateAction() {}
    
    public function simuladorAction() {

      $this->view->form = $form = new Mob_Form_SimuladorFull;
      $this->view->html = "";
      if ($this->getRequest()->getQuery("simular") !== null && $form->isValid($_GET)) {
        $values = $form->getValues();
        $data = array("cant_edificios_at" => (int)$values["trpAt"]["cant_edificios_at"], 
                      "cant_edificios_def" => (int)$values["trpDef"]["cant_edificios_def"],
                      "tropas_atacante" => array(), "tropas_defensor" => array());
        unset($values["trpAt"]["cant_edificios_at"], $values["trpDef"]["cant_edificios_def"]);
        
        foreach ($values["trpAt"] as $tropa => $cant) $data["tropas_atacante"][end(explode("_", $tropa))] = (int)$cant;
        foreach ($values["trpDef"] as $tropa => $cant) $data["tropas_defensor"][end(explode("_", $tropa))] = (int)$cant;
        foreach ($values["entAt"] as $tropa => $cant) $data["entrenamientos_atacante"][end(explode("_", $tropa))] = (int)$cant;
        foreach ($values["entDef"] as $tropa => $cant) $data["entrenamientos_defensor"][end(explode("_", $tropa))] = (int)$cant;
        //var_export($data);
        $simulador = new Mob_Combat_Manager_Simulador($data);
        $this->view->html = $simulador->getHtml();
      }
    
    }
       
    public function indexAction() {
        $this->_forward(null, "visiongeneral");
    }
    
    public function newAction() {
        $this->_helper->layout->disableLayout();
    }
    
    public function setupAction() {               
        if (Mob_Loader::getModel("Edificio")->getPrincipal($this->idUsuario) != 0) {
            $this->_redirect("/");
        }
        
        $this->view->form = $form = new Mob_Form_EdificioBase;
         
        if ($this->getRequest()->isPost()) {
            if ($this->getRequest()->getPost("paso1") !== null && $form->isValid($_POST)) {
        
              switch($form->fuente->getValue()){
                  case 1:
                    // edificio al azar
                    Mob_Loader::getModel("Edificio")->ocupar($this->idUsuario, 
                      Mob_Loader::getModel("Edificio")->getCoordDisponible(),
                      10000,
                      10000,
                      10000,
                      10000
                    );
                    $this->_getPluginUpdate()->actualizarPuntos($this->idUsuario);
                    $this->_redirect("/");
                  break;
                  case 2:
                    // elegir edificio
                    $this->view->form = new Mob_Form_Coordenadas;
                  break;
                  case 3:
                    // exportar
                    $this->view->form = new Mob_Form_Export;
                  break;
                  case 4:
                    // edificio promedio
                    $cantidadEdificios = Mob_Loader::getModel("Edificio")->getCantPromedio();
                    $habitaciones = array();
                    foreach (Mob_Loader::getHabitaciones() as $hab) {
                      $habitaciones[$hab->getNombreBdd()] = Mob_Loader::getModel("Habitacion")->getPromedio($hab->getNombreBdd());
                    }
                    
                    foreach (Mob_Loader::getEntrenamientos() as $ent) {
                      $nivel = Mob_Loader::getModel("Entrenamiento")->getPromedio($ent->getNombreBdd());
                    
                      $extra = rand(1, 10);
                      if (rand(1, 10) > 5) {
                        $nivel = round($nivel - $nivel*$extra/100);
                      } else {
                        $nivel = round($nivel + $nivel*$extra/100);
                      }                    
                      
                      Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($this->idUsuario, $ent->getNombreBdd(), $nivel);
                    }                  
                    
                    $coords = Mob_Loader::getModel("Edificio")->getBarrioDisponible($cantidadEdificios);
                    
                    foreach (range(1, $cantidadEdificios) as $n) {
                      $idEdificio = Mob_Loader::getModel("Edificio")->ocupar($this->idUsuario, 
                        Mob_Loader::getModel("Edificio")->getCoordDisponible($coords[0], $coords[1]),
                        100000,
                        100000,
                        10000,
                        10000
                      );
                      foreach ($habitaciones as $hab => $nivel) {
                        if ($n != 1) {
                          // al primer edificio no le cambiamos nada, sera el principal
                          // +- 10%
                          $extra = rand(1, 10);
                          if (rand(1, 10) > 5) {
                            $nivel = round($nivel - $nivel*$extra/100);
                          } else {
                            $nivel = round($nivel + $nivel*$extra/100);
                          }
                          
                          if (Mob_Server::getNameHabTiempoEnt() == $hab) $nivel = 0;
                        }
                        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, $hab, $nivel);  
                      }
                      
                      if ($n == 1) {
                        // al primer edificio le ponemos los niveles max en estas habitaciones
                        $nivelCaja = Mob_Loader::getModel("Habitacion")->getPromedioMax(Mob_Server::getDeposito(3));
                        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, Mob_Server::getDeposito(3), $nivelCaja);
                        $nivelEscuela = Mob_Loader::getModel("Habitacion")->getPromedioMax(Mob_Server::getNameHabTiempoEnt());
                        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, Mob_Server::getNameHabTiempoEnt(), $nivelEscuela);
                        $nivelOficina = $habitaciones[Mob_Server::getNameHabTiempo()];
                        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, Mob_Server::getNameHabTiempo(), $nivelOficina+$nivelOficina*40/100);                      
                      }                    
                    }
                    
                    $this->_getPluginUpdate()->actualizarPuntos($this->idUsuario);
                    $this->_redirect("/");
                  break;
              }
        
            } elseif ($this->getRequest()->getPost("pasoCoordenadas") != null) {
                $this->view->form = $form = new Mob_Form_Coordenadas;
                if ($form->isValid($_POST)) {
                  Mob_Loader::getModel("Edificio")->ocupar($this->idUsuario, 
                    array($form->coordx->getValue(), $form->coordy->getValue(), $form->coordz->getValue()),
                    10000,
                    10000,
                    10000,
                    10000
                  );
                  $this->_getPluginUpdate()->actualizarPuntos($this->idUsuario);
                  $this->_redirect("/");                
                } 
            } elseif ($this->getRequest()->getPost("pasoExportarEdificios") != null) {
                $this->view->form = new Mob_Form_ExportarEdificios;
                $namespace = new Zend_Session_Namespace("export");
                
                $this->view->form->build($namespace->data["coordenadas"]);
                if ($this->view->form->isValid($_POST)) {
        $process = true;
        $db = Zend_Db_Table_Abstract::getDefaultAdapter();
        while ($process) {
        try {
          $db->beginTransaction();

                    $indexEdificio = 0;
                    foreach($this->view->form->getValues() as $coords) {
                      $idEdificio = Mob_Loader::getModel("Edificio")->ocupar($this->idUsuario, 
                        array($coords["coordx"], $coords["coordy"], $coords["coordz"]),
                        10000,
                        10000,
                        10000,
                        10000
                      );
                      
                      foreach ($namespace->data["edificios"][$indexEdificio++] as $habitacion => $nivel) {
                        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, $habitacion, $nivel);
                      }                    
                    }
                    
                    $idPrincipal = Mob_Loader::getModel("Edificio")->getPrincipal($this->idUsuario);
                    foreach ($namespace->data["tropas"] as $tropa => $cantidad) {
                        Mob_Loader::getModel("Tropa")->setTropa($idPrincipal, $tropa, $cantidad);
                    }

                    foreach ($namespace->data["entrenamientos"] as $entrenamiento => $nivel) {
                        Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($this->idUsuario, $entrenamiento, $nivel);
                    }
                    $this->_getPluginUpdate()->actualizarPuntos($this->idUsuario);
                              $db->commit();
                              $process = false;
        } catch (Exception $e) {
          $db->rollBack();
          var_dump($e->getTraceAsString());
          echo "Transaction error habitaciones: ".$e->getMessage()."\n";
          $process = false;
        }
        }
                    $this->_redirect("/");
                    
                }          
            }
        }  
    }
}
