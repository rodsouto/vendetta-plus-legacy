<?php

class Mob_Model_Tropa_Nueva extends Zend_Db_Table_Abstract {

    protected $_name = "mob_tropas_nuevas";
    protected $_primary = "id_tropa_nueva";

    public function getPrimaryKey() {
      return is_array($this->_primary) ? reset($this->_primary) : $this->_primary;
    }

    public function getUltimaEnCola($idEdificio, $tipo) {
      $query = $this->select()->where("id_edificio = ?", $idEdificio)
                              ->where("tipo = ?", $tipo)
                              ->order("id_tropa_nueva DESC")->limit(1);
      return $this->_db->fetchRow($query);
    }
    
    public function getPrimeroEnCola($idEdificio, $tipo) {
      $query = $this->select()->where("id_edificio = ?", $idEdificio)
                              ->where("tipo = ?", $tipo)
                              ->order("id_tropa_nueva ASC")->limit(1);
      return $this->_db->fetchRow($query);
    }
    
    public function entrenar(Mob_Edificio $edificio, Mob_Tropa_Abstract $tropa, $cantidad, $enCola = true) {
        //if (!$enCola) {
          $edificio->restarRecursos($tropa->getCosto("arm")*$cantidad, 
                                  $tropa->getCosto("mun")*$cantidad, 
                                  $tropa->getCosto("dol")*$cantidad);
        //}    
        $ultimaEnCola = $this->getUltimaEnCola($edificio->getId(), $tropa->getTipo());
        $fechaFin = date("Y-m-d H:i:s", $tropa->getTiempoEntrenamiento(false)*$cantidad+(empty($ultimaEnCola) ? time() : strtotime($ultimaEnCola["fecha_fin"])));

        return $this->insert(array(
            "fecha_fin" => $fechaFin,
            "id_edificio" => $edificio->getId(),
            "id_usuario" => Zend_Auth::getInstance()->getIdentity()->id_usuario,
            "tropa" => $tropa->getNombreBdd(),
            "cantidad" => $cantidad,
            "duracion" => $tropa->getTiempoEntrenamiento(false)*$cantidad,
            "tipo" => $tropa->getTipo()
        ));
    }
    
    public function getById($idTropaNueva) {
      $query = $this->select()->where("id_tropa_nueva = ?", $idTropaNueva)->limit(1);
      return $this->_db->fetchRow($query);
    } 
    
    public function cancelar($idTropasNuevas) {
        if (!is_array($idTropasNuevas)) $idTropasNuevas = array($idTropasNuevas);
        // es la construcciona actual?
        
        $dataMinimo = $this->getById(min($idTropasNuevas));
        if (empty($dataMinimo)) return 0;
        
        $dataPrimeroEnCola = $this->getPrimeroEnCola($dataMinimo["id_edificio"], $dataMinimo["tipo"]);

        $primeroEnColaEliminado = $dataPrimeroEnCola["id_tropa_nueva"] == $dataMinimo["id_tropa_nueva"];
        
        if ($this->getTipoCola() == 1 || $primeroEnColaEliminado) {
          foreach ($this->find($idTropasNuevas)->toArray() as $t) {
            $costos = $this->getCostoConstruccion($t);
            Mob_Loader::getModel("Edificio")->sumarRecursos($t["id_edificio"], $costos["arm"], $costos["mun"], $costos["dol"]);
          }
        }
        
        $delete = $this->delete("id_tropa_nueva IN (".implode(",", $idTropasNuevas).")");
        
        if ($primeroEnColaEliminado) {
          // elimine el primero en la cola, asi que el siguiente debe empezar a construirse en el momento actual
          $this->procesarNuevaConstruccion($dataPrimeroEnCola["id_edificio"], date("Y-m-d H:i:s"), $dataPrimeroEnCola["tipo"]);
        } else {
          // no elimine el primero en la cola, asi que reorganizo tomando como punto de partida la finalizacion de la primer construccion
          $this->rearmarCola($dataPrimeroEnCola["id_edificio"], strtotime($dataPrimeroEnCola["fecha_fin"])-$dataPrimeroEnCola["duracion"], $dataPrimeroEnCola["tipo"]);
        }
          
        return $delete;
    }
    
    public function actualizarTiemposCola($idEdificio, $tipo) {
      $dataPrimeroEnCola = $this->getPrimeroEnCola($idEdificio, $tipo);
      $this->rearmarCola($idEdificio, strtotime($dataPrimeroEnCola["fecha_fin"])-$dataPrimeroEnCola["duracion"], $tipo);  
    }
    
    /*
    @param soloSiguientes: para actualizar la duracion en caso de construir una habitacion campo / seguridad
    */
    public function rearmarCola($idEdificio, $timestamp = null, $tipo) {
      if ($timestamp == null) $timestamp = time();
      
      $nivelCampo = null;               
      foreach ($this->fetchAll("tipo = $tipo AND id_edificio = ".$idEdificio, "id_tropa_nueva ASC") as $tropa) {
        if ($nivelCampo === null) {
          $nivelCampo = Mob_Loader::getModel("Habitacion")->getNivel($idEdificio, $tipo == 1 ? Mob_Server::getNameHabAtaque() : Mob_Server::getNameHabDefensa());
        }

        $tropa->duracion = Mob_Loader::getTropa($tropa->tropa)->getTiempoEntrenamiento(false, $nivelCampo)*$tropa->cantidad;
        $timestamp += $tropa->duracion;

        $tropa->fecha_fin = date("Y-m-d H:i:s", $timestamp);
        
        $tropa->save();
      } 
    }    
    
    public function getColaEntrenamientos($idEdificio, $tipo) {
        $query = $this->select()->where("fecha_fin > ?", date("Y-m-d H:i:s"))
                                ->where("id_edificio = ?", $idEdificio)
                                ->where("tipo = ?", $tipo);
        
        return $this->fetchAll($query)->toArray();
    }
    
    public function getByIdEdificio($idEdificio) {
        $query = $this->select()->where("id_edificio = ?", $idEdificio)
                                ->where("fecha_fin < ?", date("Y-m-d H:i:s"))
                                ->order("id_tropa_nueva ASC");
        return $this->_db->fetchAll($query);
    }
    
    public function getEdificiosFinalizados($idUsuario = null) {
        $query = $this->select()->from($this->_name, "id_edificio")
                                ->where("fecha_fin < ?", date("Y-m-d H:i:s"))
                                ->group("id_edificio");
        if ($idUsuario !== null) $query->where("id_usuario = ?", $idUsuario);                                
        return $this->_db->fetchAll($query);
    }
    
    public function getByUsuario($idUsuario, $finalizados = true) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)->order("id_edificio")->order("id_tropa_nueva ASC");
        if ($finalizados) $query->where("fecha_fin < ?", date("Y-m-d H:i:s"));
                                
        return $this->_db->fetchAll($query);
    }
    
    public function processQueue($v, $timestampEnviado) {
      Mob_Loader::getModel("Tropa")->sumarTropas($v["id_edificio"], array($v["tropa"] => $v["cantidad"]));
      Mob_Loader::getModel("Usuarios")->sumarPuntosTropa($v["id_usuario"], $v["cantidad"] * Mob_Loader::getTropa($v["tropa"])->getPuntos());
      Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "tropa_entrenada", "Unidad completada: ".$v["cantidad"]." ".
                                          Mob_Loader::getTropa($v["tropa"])->getNombre()." edificio ".
                                          Mob_Loader::getModel("Edificio")->getCoord($v["id_edificio"], true), date("Y-m-d H:i:s", $timestampEnviado));
      Mob_Cache_Factory::getInstance("html")->remove('tropasVisionGeneral'.$v["id_edificio"]);                                              
    }

    public function getCostoConstruccion($v) {
      $obj = Mob_Loader::getTropa($v["tropa"]);
      $arm = $obj->getCosto("arm")*$v["cantidad"];
      $mun = $obj->getCosto("mun")*$v["cantidad"];
      $dol = $obj->getCosto("dol")*$v["cantidad"];
      return array("arm" => $arm, "mun" => $mun, "dol" => $dol);     
    }
    
    public function sendMessageNoRecursos($v, $timestampEnviado) {
      Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "tropa_no_construida", "No se pudieron construir ".$v["cantidad"]." ".
                        Mob_Loader::getEntrenamiento($v["entrenamiento"])->getNombre()." en el edificio ".$v['coord']." por falta de recursos", 
                        date("Y-m-d H:i:s", $timestampEnviado));    
    }
    
    /*
    1: descuento de recursos inmediato
    2: descuento de recursos al poner a construir
    */
    public function getTipoCola() {
      return 1;
    }
    
    /*
    busca cual es el siguiente que puede construir, lo pone a construir y rearma la cola
    */
    public function procesarNuevaConstruccion($idEdificio, $lastFinalizacion, $tipo) {
      // todo lo que tenga en cola ya lo tiene pago y lo puede construir asi que solo rearmamos la cola
      if ($this->getTipoCola() == 1) {
        $this->rearmarCola($idEdificio, $lastFinalizacion, $tipo);
        return;
      }      
      // resto recursos a las habitaciones en construccion
      foreach ($this->fetchAll("tipo = $tipo AND id_edificio = $idEdificio")->toArray() as $k => $construccion) {
          $costos = $this->getCostoConstruccion($construccion);
          if (Mob_Loader::getModel("Edificio")->puedeGastar($construccion["id_edificio"], $costos["arm"], $costos["mun"], $costos["dol"])) {
            //if ($this->_debug || 1) {
                //echo "construye ".$construccion["nivel"]."\n";
            //} 
            Mob_Loader::getModel("Edificio")->restarRecursos($construccion["id_edificio"], $costos["arm"], $costos["mun"], $costos["dol"]);
            
            // ok la pudo construir rearmamos la cola y salimos            
            $this->rearmarCola($construccion["id_edificio"], $lastFinalizacion);
            break;
          } else {
            // vamos borrando las que no pueda construir hasta que pueda construir alguna
            //if ($this->_debug || 1) {
                //echo "no puede construir ".$construccion["nivel"]." arm ".$costos["arm"]." mun ".$costos["mun"]." dol ".$costos["dol"]." dispone de ".
                //      implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($construccion["id_edificio"]))."\n";
            //} 
            $this->sendMessageNoRecursos($construccion, $lastFinalizacion);
            $this->delete($this->getPrimaryKey()." = " . $construccion[$this->getPrimaryKey()]);
          }
       }                         
    }        
    
    /*public function insert(array $data) {
      $time = strtotime($data["fecha_fin"]);
      $segundos = $time%60;
      
      if ($segundos < 55) ($time += 55-$segundos);
      else $time -= ($segundos - 55);
      
      $data["fecha_fin"] = date("Y-m-d H:i:s", $time);
      return parent::insert($data);
    } */   
        
}