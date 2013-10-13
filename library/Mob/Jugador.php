<?php

class Mob_Jugador {
    protected $_idUsuario;
    protected $_edificio;
    protected $_modelHabNueva;
    protected $_modelEntNuevo;
    protected $_modelEdificio;
    protected $_data;
    protected $_dataEntrenamientoActual;
    protected static $_tablaHonor;
    protected $_db;

    public function getModelHabNueva() {
        if ($this->_modelHabNueva == null) {
            $this->_modelHabNueva = Mob_Loader::getModel("Habitacion_Nueva");
        }
        
        return $this->_modelHabNueva;
    }

    public function getModelEdificio() {
        if ($this->_modelEdificio == null) {
            $this->_modelEdificio = Mob_Loader::getModel("Edificio");
        }
        
        return $this->_modelEdificio;
    }
    
    public function getModelEntNuevo() {
        if ($this->_modelEntNuevo == null) {
            $this->_modelEntNuevo = Mob_Loader::getModel("Entrenamiento_Nuevo");
        }
        
        return $this->_modelEntNuevo;
    }

    public function __construct($id_usuario) {
        if (empty($id_usuario)) throw new Exception("id_usuario can't be empty");
        $this->_idUsuario = $id_usuario;
        $this->_edificio = new Mob_Edificio;
        $this->_edificio->setJugador($this);
        $this->_data = Mob_Loader::getModel("Usuarios")->find($id_usuario)->current()->toArray();
        $this->_db = Zend_Db_Table_Abstract::getDefaultAdapter();
    }
    
    public function __destruct() {
      if (isset($this->_edificio) && is_object($this->_edificio)) $this->_edificio->__destruct();
      unset($this->_db, $this->_data);
    }
    
    function setEdificio($id_edificio) {
        $this->_edificio->setEdificio($id_edificio);
    }
    
    public function poseeEdificio($idEdificio) {
        $data = $this->getModelEdificio()->find($idEdificio)->toArray();
        if (empty($data)) return false;
        return $data[0]["id_usuario"] == $this->_idUsuario;
    }
    
    public function borrarEdificio($idEdificio) {
        if ($this->getModelEdificio()->getUsuarioById($idEdificio) != $this->_idUsuario) return;
        
        try {
          $this->_db->beginTransaction();
          Mob_Loader::getModel("Habitacion")->delete("id_edificio = ".(int)$idEdificio." AND id_usuario = ".(int)$this->_idUsuario);
          Mob_Loader::getModel("Habitacion_Nueva")->delete("id_edificio = ".(int)$idEdificio." AND id_usuario = ".(int)$this->_idUsuario);
          Mob_Loader::getModel("Tropa")->delete("id_edificio = ".(int)$idEdificio);
          Mob_Loader::getModel("Tropa_Nueva")->delete("id_edificio = ".(int)$idEdificio);
          $this->getModelEdificio()->delete("id_edificio = ".(int)$idEdificio." AND id_usuario = ".(int)$this->_idUsuario);
          $this->_db->commit();
          return true;
        } catch (Exception $e) {
          $this->_db->rollBack();
          return false;
        }          
    }

    public function getHabitacionesConstruyendo() {
        return $this->getModelHabNueva()->getHabitacionesConstruyendo($this->_idUsuario);
    }
    
    public function getEntrenamientosConstruyendo() {
        return $this->getModelEntNuevo()->getEntrenamientosConstruyendo($this->_idUsuario);
    }
    
    public function getEdificioActual() {
        return $this->_edificio;
    }
    
    public function getIdUsuario() {
    	return $this->_idUsuario;	
    }
    
    public function getEdificios() {
        return $this->getModelEdificio()->getEdificios($this->_idUsuario);
    }
    
    public function getNombre() {
        return Mob_Loader::getModel("Usuarios")->getUsuario($this->_idUsuario);
    }  
    
    public function tieneFamilia() {
        return Mob_Loader::getModel("Familias_Miembros")->tieneFamilia($this->_idUsuario);
    }
    
    public function getIdFamilia() {
        return Mob_Loader::getModel("Familias_Miembros")->getIdFamilia($this->_idUsuario);
    }

    public static function calcPoderAtaque($totalEdificios = null, $honor = null) {
        if (empty(self::$_tablaHonor)) {
            self::$_tablaHonor = include APPLICATION_PATH . "/configs/honor.php";
        }
        
        if ($totalEdificios < 5) return 100;
        
        if ($totalEdificios > 100) {
          return round(100*self::$_tablaHonor[100][$honor]/$totalEdificios);
        }
        
        if ($honor > 8) $honor = 8;

        if (isset(self::$_tablaHonor[$totalEdificios])) {
            return self::$_tablaHonor[$totalEdificios][$honor];
        }

        $base = floor($totalEdificios/5)*5;
        $next = $base + 5;

        $rango = (self::$_tablaHonor[$base][$honor] - self::$_tablaHonor[$next][$honor]) / 5;
        
        return round(self::$_tablaHonor[$base][$honor] - ($rango * ($totalEdificios - $base)));
    
    }
    
    public function getPoderAtaque($cantEdificios = null, $honor = null) {
        return self::calcPoderAtaque($this->getTotalEdificios(), $this->_edificio->getEntrenamiento(Mob_Server::getNameEntPoderAtaque())->getNivel());    
    }
    
    public function getInfo() {
        return array(
            "idFamilia" => $this->getIdFamilia(),
            "totalEdificios" => $this->getTotalEdificios(),
            "puntosEdificios" => $this->_data["puntos_edificios"],
            "puntosEntrenamientos" => $this->_data["puntos_entrenamientos"],
            "puntosTropas" => $this->_data["puntos_tropas"],
            "totalPuntos" => $this->_data["puntos_edificios"]+$this->_data["puntos_entrenamientos"]+$this->_data["puntos_tropas"],
            "poderAtaque" => $this->getPoderAtaque()
        );
    }
    
    public function getTotalEdificios() {
      return $this->getModelEdificio()->getTotalEdificios($this->_idUsuario);
    }
    
    public function getData($key) {
        return array_key_exists($key, $this->_data) ? $this->_data[$key] : null;
    }
    
    public function getEntrenamientoConstruyendo() {
        //if (!empty($this->_dataEntrenamientoActual)) return $this->_dataEntrenamientoActual[0]["entrenamiento"];
        
        $this->_dataEntrenamientoActual = $this->getModelEntNuevo()->getDataEntrenamientoActual($this->_idUsuario);

        return !empty($this->_dataEntrenamientoActual) ? $this->_dataEntrenamientoActual[0]["entrenamiento"] : null;
    }
    
    public function estaEntrenando() {
        return $this->getEntrenamientoConstruyendo() != null;
    }
    
    public function getIdEdificioEntrenamientoActual() {
        if (empty($this->_dataEntrenamientoActual)) $this->getEntrenamientoConstruyendo();
        return $this->_dataEntrenamientoActual[0]["id_edificio"];
    }
    
    public function getTiempoRestanteEntrenamiento($timestamp = false) {
        if (empty($this->_dataEntrenamientoActual)) return false;
        
        if ($timestamp) return strtotime($this->_dataEntrenamientoActual[0]["fecha_fin"])-time();
        
        return Mob_Timer::timeFormat(strtotime($this->_dataEntrenamientoActual[0]["fecha_fin"])-time());
    }
    
    public function cancelarEntrenamiento($idEntrenamientoNuevo) {
        return Mob_Loader::getModel("Entrenamiento_Nuevo")->cancelar((int)$idEntrenamientoNuevo, $this->getIdUsuario(), $this->getEdificioActual()->getId());
    }
    
  public function getTodosEdificios() {
        $this->getModelEdificio()->getTodosEdificios($this->_idUsuario);
  }
  
  public function tieneModoPadrino() {
    return true;
  }
  
  public function puedePonerEntEnCola() {
    $idEdificioConstruyendoActual = $this->getIdEdificioEntrenamientoActual();
    if($idEdificioConstruyendoActual && $idEdificioConstruyendoActual != $this->_edificio->getId()) return false;  
    return Mob_Loader::getModel("Entrenamiento_Nuevo")->totalEntrenamientosEnCola($this->_edificio->getId()) < 6;
  }  
}
