<?php

abstract class Mob_Model_Construccion extends Mob_Db_Table_Abstract implements Mob_Construccion_Interface {

    public function getPrimaryKey() {
      return is_array($this->_primary) ? reset($this->_primary) : $this->_primary;
    }

    /*
    @description: cancela una construccion, devuelve recursos si tiene que devolverlos. 
    Si es la primer construccion se fija si puede construir la siguiente o si ya esta paga. Si no es la primer construccion, reordena la cola.
    */
    public function cancelar($idPrimaryKey, $idUsuario, $idEdificio) {
        $data = $this->getById($idPrimaryKey);
        
        if (empty($data)) return 0;
        
        // es la construcciona actual?
        $query = "SELECT COUNT(*) FROM {$this->_name} WHERE ".$this->getPrimaryKey()." < $idPrimaryKey AND id_usuario = $idUsuario AND id_edificio = $idEdificio";
        $primeroEnColaEliminado = $this->_db->fetchOne($query) == 0;

        // si esta en modo construccion automatica o si es la primer construccion devuelvo recursos
        if ($this->getTipoCola() == 1 || $primeroEnColaEliminado) {
          $costos = $this->getCostoConstruccion($data);
          Mob_Loader::getModel("Edificio")->sumarRecursos($data["id_edificio"], $costos["arm"], $costos["mun"], $costos["dol"]);
        }

        $delete = $this->delete($this->getPrimaryKey()." = $idPrimaryKey AND id_usuario = $idUsuario");

        if ($primeroEnColaEliminado) {
          // elimine el primero en la cola, asi que el siguiente debe empezar a construirse en el momento actual
          $this->procesarNuevaConstruccion($data["id_edificio"], time());
        } else {
          // no elimine el primero en la cola, asi que reorganizo tomando como punto de partida la finalizacion de la primer construccion
          $dataPrimeroEnCola = $this->getPrimeroEnCola($idEdificio);
          $this->rearmarCola($data["id_edificio"], strtotime($dataPrimeroEnCola["fecha_fin"])-$dataPrimeroEnCola["duracion"]);
        }
        
        return $delete;
    }
    
    public function getById($idPrimaryKey) {
      $query = $this->select()->where($this->getPrimaryKey()." = ?", $idPrimaryKey)->limit(1);
      return $this->_db->fetchRow($query);
    }
    
    /*
     @description: rearma la cola. Puede recibir un timestamp a partir del cual agregar las nuevas construcciones
    */ 
    public function rearmarCola($idEdificio, $timestamp = null) {
      // actualizo nivel, duraciones y fecha fin
      $nivelHabTiempo = Mob_Loader::getModel("Habitacion")->getNivel($idEdificio, $this->getHabTiempo());      
      $niveles = array();
      if ($timestamp == null) $timestamp = time();
               
      foreach ($this->fetchAll("id_edificio = ".$idEdificio, $this->getPrimaryKey()." ASC") as $k => $v) {
        if (!isset($niveles[$v->{$this->_fieldName}])) {
          $niveles[$v->{$this->_fieldName}] = Mob_Loader::getModel($this->_parentModel)->getNivel($v->{$this->_idField}, $v->{$this->_fieldName})+1;
        }
        
        $v->nivel = $niveles[$v->{$this->_fieldName}];
        $niveles[$v->{$this->_fieldName}]++; 

        $v->duracion = $this->getObj($v->{$this->_fieldName})->getTiempoMejora("segundos", $v->nivel, $nivelHabTiempo);
        
        $timestamp += $v->duracion;
        
        $v->fecha_fin = date("Y-m-d H:i:s", $timestamp);
        
        $v->save();
      } 
    }
    
    public function getUltimaEnCola($idEdificio) {
      $query = $this->select()->where("id_edificio = ?", $idEdificio)->order($this->getPrimaryKey()." DESC")->limit(1);
      return $this->_db->fetchRow($query);
    }
    
    public function getPrimeroEnCola($idEdificio) {
      $query = $this->select()->where("id_edificio = ?", $idEdificio)->order($this->getPrimaryKey()." ASC")->limit(1);
      return $this->_db->fetchRow($query);
    }    

    public function totalEnCola($idEdificio, $tipo = null) {
      $query = "SELECT COUNT(*) FROM {$this->_name} WHERE id_edificio = ".(int)$idEdificio;
      if ($tipo != null) $query .= " AND {$this->_fieldName} = '$tipo'";
      return $this->_db->fetchOne($query);
    }
    
    public function construir(Mob_Edificio $edificio, $obj, $enCola = false) {
        if (!$enCola) {
          $costo_arm = $obj->getCosto("arm");
          $costo_mun = $obj->getCosto("mun");
          $costo_dol = $obj->getCosto("dol");
          $edificio->restarRecursos($costo_arm, $costo_mun, $costo_dol);
        }
        
        $nuevoNivel = $obj->getNivel()+1+$this->totalEnCola($edificio->getId(), $obj->getNombreBdd());
        
        $ultimaEnCola = $this->getUltimaEnCola($edificio->getId());
        $fechaFin = date("Y-m-d H:i:s", $obj->getTiempoMejora("segundos")+(empty($ultimaEnCola) ? time() : strtotime($ultimaEnCola["fecha_fin"])));
        
        return $this->insert(array(
            "id_usuario" => Zend_Auth::getInstance()->getIdentity()->id_usuario,
            "id_edificio" => $edificio->getId(),
            "fecha_fin" => $fechaFin,
            $this->_fieldName => $obj->getNombreBdd(),
            "duracion" => $obj->getTiempoMejora("segundos", $nuevoNivel),
            "nivel" => $nuevoNivel,
            "coord" => $edificio->getData("coord1").":".$edificio->getData("coord2").":".$edificio->getData("coord3") 
        ));    
    }
    /*
    busca cual es el siguiente que puede construir, lo pone a construir y rearma la cola
    */
    public function procesarNuevaConstruccion($idEdificio, $lastFinalizacion) {
      // todo lo que tenga en cola ya lo tiene pago y lo puede construir asi que solo rearmamos la cola
      if ($this->getTipoCola() == 1) {
        $this->rearmarCola($idEdificio, $lastFinalizacion);
        return;
      }      
      // resto recursos a las habitaciones en construccion
      foreach ($this->fetchAll("id_edificio = $idEdificio")->toArray() as $k => $construccion) {
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
}