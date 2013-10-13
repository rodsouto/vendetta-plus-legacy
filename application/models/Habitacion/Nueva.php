<?php

class Mob_Model_Habitacion_Nueva extends Mob_Model_Construccion {

    protected $_name = "mob_habitaciones_nuevas";
    protected $_primary = "id_habitacion_nueva";
    protected $_parentModel = "Habitacion";
    protected $_fieldName = "habitacion";
    protected $_idField = "id_edificio";
    
    public function getHabTiempo() {
      return Mob_Server::getNameHabTiempo();
    }
        
    public function getHabitacionesConstruyendo($idUsuario, $idEdificio = 0) {
      $cacheId = 'getHabitacionesConstruyendo_'.$idUsuario.'_'.$idEdificio;
      //if(($result = $this->_cache->load($cacheId)) === false) {
          $query = $this->select()->where("id_usuario = ?", $idUsuario)
                                      ->where("fecha_fin > ?", date("Y-m-d H:i:s"));
                                      
          if ($idEdificio != 0) {
            $query->where("id_edificio = ?", $idEdificio)->order("id_habitacion_nueva ASC");
          } else {
            $query->group("id_edificio")->order("fecha_fin ASC");
          }
          $result = $this->_db->fetchAll($query);
        //  $this->_cache->save($result, $cacheId); 
      //}
  
      return $result;
    }
    
    public function totalHabitacionesEnCola($idEdificio, $habitacion = null) {
      $query = "SELECT COUNT(*) FROM {$this->_name} WHERE id_edificio = ".(int)$idEdificio;
      if ($habitacion != null) $query .= " AND habitacion = '$habitacion'";
      return $this->_db->fetchOne($query);
    }

    public function estaConstruyendo($idEdificio, $habitacion = null) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("id_edificio = ?", $idEdificio)
                              ->where("habitacion = ?", $habitacion);
                              
      if ($habitacion !== null) $query->where("fecha_fin > ?", date("Y-m-d H:i:s"));
      
      return $this->_db->fetchOne($query) > 0;
    }
    
    public function getConstruccionActual($idEdificio, $habitacion = null) {
      $query = $this->select()->where("id_edificio = ?", $idEdificio)
                              ->where("fecha_fin > (NOW())")
                              ->order("id_habitacion_nueva ASC")
                              ->limit(1);
                              
      if ($habitacion) $query->where("habitacion = ?", $habitacion);
      
      return ($d = $this->_db->fetchAll($query)) ? $d[0] : array();
    }
    
    public function esConstruccionActual($idHabitacionNueva) {
      $data = $this->getById($idHabitacionNueva);
      if (empty($data)) return false;
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("id_habitacion_nueva < ?", (int)$idHabitacionNueva)
                              ->where("id_edificio = ?", $data["id_edificio"]);
      return $this->_db->fetchOne($query) == 0; 
    }

    public function construirTestCase($idUsuario, $puedeConstruir, Mob_Edificio $edificio, Mob_Habitacion_Abstract $habitacion, 
                                          $enCola = false, $startTime = null, $duracion = null) {
        /*if (!$enCola) {
          $costo_arm = $habitacion->getCosto("arm");
          $costo_mun = $habitacion->getCosto("mun");
          $costo_dol = $habitacion->getCosto("dol");
           
          $edificio->restarRecursos($costo_arm, $costo_mun, $costo_dol);
        }*/

        $nuevoNivel = $habitacion->getNivel()+1+$this->totalHabitacionesEnCola($edificio->getId(), $habitacion->getNombreBdd());
        
        if ($puedeConstruir && $enCola) {
          $habClone = clone $habitacion;
          $habClone->setNivel($nuevoNivel-1);
          //echo "sumo recursos hab nivel ".($nuevoNivel)." arm: ".$habClone->getCosto("arm")." mun: ".$habClone->getCosto("mun")." dol: ".$habClone->getCosto("dol")."\n";
          $edificio->sumarRecursos($habClone->getCosto("arm"), $habClone->getCosto("mun"), $habClone->getCosto("dol"));
          //echo "estado recursos: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($edificio->getId()))."\n\n";
        }
        
        // para poner la fecha de finalizacion correcta
        $ultimaEnCola = $this->getUltimaEnCola($edificio->getId());
        if ($startTime == null) $startTime = time();
        $fechaFin = date("Y-m-d H:i:s", ($duracion != null ? $duracion : $habitacion->getTiempoMejora("segundos", $nuevoNivel))
                                                +(empty($ultimaEnCola) ? $startTime : strtotime($ultimaEnCola["fecha_fin"])));                   

        if ($duracion == null) $duracion = $habitacion->getTiempoMejora("segundos", $nuevoNivel);
                       
        return $this->insert(array(
            "id_usuario" => $idUsuario,
            "id_edificio" => $edificio->getId(),
            "fecha_fin" => $fechaFin,
            "duracion" => $duracion,
            "habitacion" => $habitacion->getNombreBdd(),
            "nivel" => $nuevoNivel,
            "coord" => $edificio->getData("coord1").":".$edificio->getData("coord2").":".$edificio->getData("coord3")
        ));        
    }    

    public function getFinalizadas($idUsuario = null) {
        $query = $this->select()->where("fecha_fin < ?", date("Y-m-d H:i:s"));
        if ($idUsuario !== null) $query->where("id_usuario = ?", $idUsuario);
        $query->limit("2000");
        return $this->_db->fetchAll($query);
    }
    
    public function deleteFinalizadas($idUsuario = null) {
        $query = "fecha_fin < '".date("Y-m-d H:i:s")."'";
        if ($idUsuario !== null) $query .= " AND id_usuario = ".(int)$idUsuario; 
        return $this->delete($query);
    }
    
    public function getEdificiosFinalizados($idUsuario = null) {
        $query = $this->select()->from($this->_name, "id_edificio")
                                ->where("fecha_fin < ?", date("Y-m-d H:i:s"))
                                ->group("id_edificio");
        if ($idUsuario !== null) $query->where("id_usuario = ?", $idUsuario);                                
        return $this->_db->fetchAll($query);
    }
    
    public function getByIdEdificio($idEdificio) {
        $query = $this->select()->where("id_edificio = ?", $idEdificio)
                                ->where("fecha_fin < ?", date("Y-m-d H:i:s"))
                                ->order("id_habitacion_nueva ASC");
        return $this->_db->fetchAll($query);
    }        

    public function getByUsuario($idUsuario, $finalizados = true) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)->order("id_edificio")->order("id_habitacion_nueva ASC");
        if ($finalizados) $query->where("fecha_fin < ?", date("Y-m-d H:i:s"));
                                
        return $this->_db->fetchAll($query);
    }
    
    public function processQueue($v, $timestampEnviado) {
        if ($v["habitacion"] == "campo" || $v["habitacion"] == "seguridad") {
          // actualizo los tiempos de las tropas que correspondan
          Mob_Loader::getModel("Tropa_Nueva")->actualizarTiemposCola($v["id_edificio"], $v["habitacion"] == "campo" ? 1 : 2);
        }

        $nuevoNivel = Mob_Loader::getModel("Habitacion")->incrementar($v["id_edificio"], $v["habitacion"]);
        Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "habitacion_finalizada", "Habitacion finalizada: ".
            Mob_Loader::getHabitacion($v["habitacion"])->getNombre().
            " nivel ".$nuevoNivel." edificio ".$v['coord'], date("Y-m-d H:i:s", $timestampEnviado));
        Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo'.$v["id_usuario"]);    
    }
    
    public function getObj($habitacion) {
      return Mob_Loader::getHabitacion($habitacion);
    }
    
    public function getCostoConstruccion($v) {
      $obj = Mob_Loader::getHabitacion($v["habitacion"]);
      $obj->setNivel($v["nivel"]-1);
      $arm = $obj->getCosto("arm");
      $mun = $obj->getCosto("mun");
      $dol = $obj->getCosto("dol");
      return array("arm" => $arm, "mun" => $mun, "dol" => $dol);     
    }
    
    public function sendMessageNoRecursos($v, $timestampEnviado) {
        Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "habitacion_no_construida", "No se pudo construir la habitacion ".
                  Mob_Loader::getHabitacion($v["habitacion"])->getNombre()." nivel ".$v['nivel']." en el edificio ".$v['coord']." por falta de recursos", 
                  date("Y-m-d H:i:s", $timestampEnviado));    
    }
    
    /*
    1: descuento de recursos inmediato
    2: descuento de recursos al poner a construir
    */
    public function getTipoCola() {
      return 2;
    }     
    
    /*public function insert(array $data) {
      $time = strtotime($data["fecha_fin"]);
      $segundos = $time%60;
      
      if ($segundos < 55) ($time += 55-$segundos);
      else $time -= ($segundos - 55);
      
      $data["fecha_fin"] = date("Y-m-d H:i:s", $time);
      return parent::insert($data);
    }*/    
    
}      
      