<?php

class Mob_Model_Entrenamiento_Nuevo extends Mob_Model_Construccion {

    protected $_name = "mob_entrenamientos_nuevos";
    protected $_primary = "id_entrenamiento_nuevo";
    protected $_parentModel = "Entrenamiento";
    protected $_fieldName = "entrenamiento";
    protected $_idField = "id_usuario";

    public function getHabTiempo() {
      return Mob_Server::getNameHabTiempoEnt();
    }
    
    public function getEntrenamientosConstruyendo($idUsuario, $idEdificio = 0) {
      $query = $this->select()->where("id_usuario = ?", $idUsuario)
                                  //->order("fecha_fin ASC")
                                  ->order("id_entrenamiento_nuevo ASC")
                                  ->where("fecha_fin > ?", date("Y-m-d H:i:s"));
                                  
      if ($idEdificio != 0) {
        $query->where("id_edificio = ?", $idEdificio);
      } else {
        $query->group("id_edificio");
      }
      $result = $this->_db->fetchAll($query);
  
      return $result;
    }
    
    public function totalEntrenamientosEnCola($idEdificio, $entrenamiento = null) {
      $query = "SELECT COUNT(*) FROM {$this->_name} WHERE id_edificio = ".(int)$idEdificio;
      if ($entrenamiento != null) $query .= " AND entrenamiento = '$entrenamiento'";
      return $this->_db->fetchOne($query);
    }
    
    public function entrenar(Mob_Edificio $edificio, Mob_Entrenamiento_Abstract $entrenamiento, $enCola = false) {
        return parent::construir($edificio, $entrenamiento, $enCola);
    }

    public function getEntrenamientoActual($idUsuario) {
        $query = $this->select()->from($this->_name, "entrenamiento")
                                ->where("id_usuario = ?", $idUsuario)
                                ->where("fecha_fin > ?", date("Y-m-d H:i:s"))
                                ->limit(1);
                                
        return $this->_db->fetchOne($query);
    }
    
    public function getDataEntrenamientoActual($idUsuario) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)
                                ->where("fecha_fin > ?", date("Y-m-d H:i:s"))
                                ->limit(1);
                                
        return $this->_db->fetchAll($query);
    }
    
    public function getConstruccionActual($idEdificio) {
      $query = $this->select()->where("id_edificio = ?", $idEdificio)
                              ->where("fecha_fin > (NOW())")
                              ->order("id_entrenamiento_nuevo ASC")
                              ->limit(1);
                              
      
      
      return $this->_db->fetchRow($query);
    }
    
    public function getFinalizados($idUsuario = null) {
        $query = $this->select()->where("fecha_fin < ?", date("Y-m-d H:i:s"));
        if ($idUsuario !== null) $query->where("id_usuario = ?", $idUsuario);
        $query->limit("500");
        return $this->_db->fetchAll($query);
    }
    
    public function deleteFinalizados($idUsuario = null) {
        $query = "fecha_fin < '".date("Y-m-d H:i:s")."'";
        if ($idUsuario !== null) $query .= " AND id_usuario = ".(int)$idUsuario; 
        return $this->delete($query);
    }

    public function getByUsuario($idUsuario, $finalizados = true) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)->order("id_edificio")->order("id_entrenamiento_nuevo ASC");
        if ($finalizados) $query->where("fecha_fin < ?", date("Y-m-d H:i:s"));
                                
        return $this->_db->fetchAll($query);
    }
    
    public function processQueue($v, $timestampEnviado) {
      $nuevoNivel = Mob_Loader::getModel("Entrenamiento")->incrementar($v["id_usuario"], $v["entrenamiento"]);
      Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "entrenamiento_completado", "Entrenamiento completado: ".
          Mob_Loader::getEntrenamiento($v["entrenamiento"])->getNombre()." nivel ".$nuevoNivel, date("Y-m-d H:i:s", $timestampEnviado));    
    }
    
    public function getObj($entrenamiento) {
      return Mob_Loader::getEntrenamiento($entrenamiento);
    }
    
    public function getCostoConstruccion($v) {
      $obj = Mob_Loader::getEntrenamiento($v["entrenamiento"]);
      $obj->setNivel($v["nivel"]-1);
      $arm = $obj->getCosto("arm");
      $mun = $obj->getCosto("mun");
      $dol = $obj->getCosto("dol");
      return array("arm" => $arm, "mun" => $mun, "dol" => $dol);     
    }
    
    public function sendMessageNoRecursos($v, $timestampEnviado) {
      Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "entrenamiento_no_construido", "No se pudo construir el entrenamiento ".
                        Mob_Loader::getEntrenamiento($v["entrenamiento"])->getNombre()." nivel ".$v['nivel']." en el edificio ".$v['coord']." por falta de recursos", 
                        date("Y-m-d H:i:s", $timestampEnviado));    
    }
    
    /*
    1: descuento de recursos inmediato
    2: descuento de recursos al poner a construir
    */
    public function getTipoCola() {
      return 2;
    }    

    public function construirTestCase($idUsuario, $puedeConstruir, Mob_Edificio $edificio, Mob_Entrenamiento_Abstract $entrenamiento, 
                                          $enCola = false, $startTime = null, $duracion = null) {
        /*if (!$enCola) {
          $costo_arm = $habitacion->getCosto("arm");
          $costo_mun = $habitacion->getCosto("mun");
          $costo_dol = $habitacion->getCosto("dol");
           
          $edificio->restarRecursos($costo_arm, $costo_mun, $costo_dol);
        }*/

        $nuevoNivel = $entrenamiento->getNivel()+1+$this->totalEntrenamientosEnCola($edificio->getId(), $entrenamiento->getNombreBdd());
        
        if ($puedeConstruir && $enCola) {
          $habClone = clone $entrenamiento;
          $habClone->setNivel($nuevoNivel-1);
          //echo "sumo recursos hab nivel ".($nuevoNivel)." arm: ".$habClone->getCosto("arm")." mun: ".$habClone->getCosto("mun")." dol: ".$habClone->getCosto("dol")."\n";
          $edificio->sumarRecursos($habClone->getCosto("arm"), $habClone->getCosto("mun"), $habClone->getCosto("dol"));
          //echo "estado recursos: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($edificio->getId()))."\n\n";
        }
        
        // para poner la fecha de finalizacion correcta
        $ultimaEnCola = $this->getUltimaEnCola($edificio->getId());
        if ($startTime == null) $startTime = time();
        $nivelEscuela = Mob_Loader::getModel("Habitacion")->getNivel($edificio->getId(), "escuela");
        if ($duracion == null) $duracion = $entrenamiento->getTiempoMejora("segundos", $nuevoNivel, $nivelEscuela);
        
        $fechaFin = date("Y-m-d H:i:s", $duracion +(empty($ultimaEnCola) ? $startTime : strtotime($ultimaEnCola["fecha_fin"])));                   
        var_dump("nuevo nivel", $nuevoNivel, "duracion", $duracion, "fecha fin", $fechaFin, empty($ultimaEnCola), $ultimaEnCola["fecha_fin"]);echo "<br />";               
        return $this->insert(array(
            "id_usuario" => $idUsuario,
            "id_edificio" => $edificio->getId(),
            "fecha_fin" => $fechaFin,
            "duracion" => $duracion,
            "entrenamiento" => $entrenamiento->getNombreBdd(),
            "nivel" => $nuevoNivel,
            "coord" => $edificio->getData("coord1").":".$edificio->getData("coord2").":".$edificio->getData("coord3")
        ));        
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