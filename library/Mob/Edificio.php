<?php

class Mob_Edificio {

  protected $_edificioId = null;
  protected $_habitaciones = array();
  protected $_tropas = array();
  protected $_tropasSeguridad = array();
  protected $_entrenamientos = array();
  protected $_habitacionConstruyendo = null;
  protected $_data;
  protected $_jugador;
  protected $_model;
  protected $_modelTropa;
  protected $_modelTropaNueva;
  
  public function __destruct() {
    unset($this->_modelTropa, $this->_modelTropaNueva, $this->_model, $this->_tropas, $this->_tropasSeguridad, $this->_entrenamientos, $this->_habitaciones);
  }
  
  public function getModelTropa() {
      if ($this->_modelTropa == null) {
          $this->_modelTropa = Mob_Loader::getModel("Tropa");
      }
      
      return $this->_modelTropa;
  }
  
  public function getModelTropaNueva() {
      if ($this->_modelTropaNueva == null) {
          $this->_modelTropaNueva = Mob_Loader::getModel("Tropa_Nueva");
      }
      
      return $this->_modelTropaNueva;
  }
  
  public function getModel() {
      if ($this->_model == null) {
          $this->_model = Mob_Loader::getModel("Edificio");
      }
      
      return $this->_model;
  }
  
  public function getData($key) {
    return $this->_data[$key];
  }
  
  public function getCiudad() {
    return $this->getData("coord1");
  }
  
  public function getBarrio() {
    return $this->getData("coord2");
  }
  
  public function setJugador(Mob_Jugador $jugador) {
    $this->_jugador = $jugador;
    return $this;
  }
  
  public function getJugador() {
    return $this->_jugador;
  }
  
  public function getId() {
    return $this->_edificioId;
  }
  
  public function setData() {
    $this->_data = $this->getModel()->find($this->_edificioId)->current()->toArray();
    return $this;
  }
  
  public function setEdificio($idEdificio) {
    $this->_edificioId = $idEdificio;
     
    $this->_data = $this->getModel()->find($idEdificio)->current()->toArray();
    
    $this->setData()->load();
    return $this;
  }
  
  public function load() {
    return $this->_setHabitaciones()
            ->_setTropas()
            ->_setTropasSeguridad()
            ->_setEntrenamientos();  
  }

    protected function _setHabitaciones() {
        foreach (Mob_Data::getHabitaciones() as $habitacion) {
            $class = Mob_Loader::getClassHabitacion($habitacion);
            $object = new $class();
            $object->setEdificio($this);
            $this->_habitaciones[$habitacion] = $object;
        }
        return $this;
    }
    
    protected function _setEntrenamientos() {
        foreach (Mob_Data::getEntrenamientos() as $entrenamiento) {
            $class = Mob_Loader::getClassEntrenamiento($entrenamiento);
            $object = new $class();
            $object->setEdificio($this);
            $this->_entrenamientos[$entrenamiento] = $object;
        }
        return $this;
    }
    
    public function getOficina() {
        return $this->_habitaciones[Mob_Server::getNameHabTiempo()];
    }
    
    public function tieneCampoEntrenamiento() {
        return $this->_habitaciones[Mob_Server::getNameHabAtaque()]->getNivel() > 0;
    }

    public function getCampoEntrenamiento() {
        return $this->_habitaciones[Mob_Server::getNameHabAtaque()];
    }

    public function tieneSeguridad() {
        return $this->_habitaciones[Mob_Server::getNameHabDefensa()]->getNivel() > 0;
    }

    public function getSeguridad() {
        return $this->_habitaciones[Mob_Server::getNameHabDefensa()];
    }

    public function tieneEscuela() {
        return $this->_habitaciones[Mob_Server::getNameHabTiempoEnt()]->getNivel() > 0;
    }

    public function getEscuela() {
        return $this->_habitaciones[Mob_Server::getNameHabTiempoEnt()];
    }
    
    public function getHabitaciones() {
        $return = array();
        foreach ($this->_habitaciones as $hab) {
          if ($this->cumpleRequisitosHab($hab)) $return[] = $hab;
        }
        return $return;
    }
    
    public function cumpleRequisitosHab($habitacion) {
        if (is_string($habitacion)) {    
            $habitacion = $this->getHabitacion($habitacion);
        }
        foreach ($habitacion->getRequisitos() as $habReq => $level) {
          if ($this->getHabitacion($habReq)->getNivel() < $level) {
            return false;
          }
        }
        
        return true;      
    }
    
    public function getEntrenamientos() {
        $return = array();
        foreach ($this->_entrenamientos as $ent) {
          if ($this->cumpleRequisitosEnt($ent)) $return[] = $ent;
        }
        return $return;
    }
    
    public function cumpleRequisitosEnt($entrenamiento) {
        if (is_string($entrenamiento)) {    
            $entrenamiento = $this->getEntrenamiento($entrenamiento);
        }
        foreach ($entrenamiento->getRequisitos() as $entReq => $level) {
          if ($this->getEntrenamiento($entReq)->getNivel() < $level) {
            return false;
          }
        }
        
        return true;      
    }    

    public function getTropas($all = true, $orderTropas = array()) {
        return $this->_getTropas("ataque", $all, $orderTropas);
    }

    protected function _getTropas($tipo, $all = true, $orderTropas = array()) {
    
        $tipo = $tipo == "ataque" ? "_tropas" : "_tropasSeguridad";
    
        if ($all) {
            $return = array();
            
            $tropas = array();
            if ($orderTropas != array()) {
                foreach ($orderTropas as $t) $tropas[$t] = $this->getTropa($t);
            } else {
                $tropas = $this->{$tipo};
            }
            
            foreach ($tropas as $tropa) {
              if ($this->cumpleRequisitosTrp($tropa)) $return[] = $tropa;
            }
            return $return;
        }
        
        return array_filter($this->{$tipo}, create_function('$tropa', 'return $tropa->getCantidad() > 0;'));        
    }
    
    public function cumpleRequisitosTrp($tropa) {
        if (is_string($tropa)) {    
            $tropa = $this->getTropa($tropa);
        }
        foreach ($tropa->getRequisitos() as $entReq => $level) {
          if ($this->getEntrenamiento($entReq)->getNivel() < $level) {
            return false;
          }
        }
        
        return true;      
    }    

    public function getTropasSeguridad($all = true, $orderTropas = array()) {
        return $this->_getTropas("defensa", $all, $orderTropas);        
    }
    
    public function getTropasEstacionadas() {
      return array_merge($this->getTropas(false), $this->getTropasSeguridad(false));
    }
    
    protected function _setTropas() {        
        foreach (Mob_Data::getTropas("ataque") as $tropa) {
            $class = Mob_Loader::getClassTropa($tropa);            
            $object = new $class();
            $object->setEdificio($this);
            $this->_tropas[$tropa] = $object;
        }

        return $this;
    }
    
    protected function _setTropasSeguridad() {
        foreach (Mob_Data::getTropas("defensa") as $tropa) {
            $class = Mob_Loader::getClassTropa($tropa);
            $object = new $class();
            $object->setEdificio($this);
            $this->_tropasSeguridad[$tropa] = $object;
        }

        return $this;
    }

    public function getHabitacionConstruyendo() { 
        if ($this->_habitacionConstruyendo !== null) {
          return $this->_habitacionConstruyendo === false ? null : $this->_habitacionConstruyendo;
        }
              
        $data = Mob_Loader::getModel("Habitacion_Nueva")->getConstruccionActual($this->getId());
          
        if (!empty($data)) {
                                             
          return $this->_habitacionConstruyendo = $this->getHabitacion($data["habitacion"]);
        }

        return $this->_habitacionConstruyendo = false; 
    }
      
    public function getTiempoRestanteHabitacion($timestamp = false) {
        $dataConstruccion = Mob_Loader::getModel("Habitacion_Nueva")->getConstruccionActual($this->getId());
        
        if (empty($dataConstruccion)) return false;
        
        if ($timestamp) return strtotime($dataConstruccion["fecha_fin"])-time();
        
        return Mob_Timer::timeFormat(strtotime($dataConstruccion["fecha_fin"])-time());
    }
    
    public function estaConstruyendo() {
        return $this->getHabitacionConstruyendo() != null;
    }
        
    public function getTotalRecurso($recurso) {
        return $this->_data["recursos_" . $recurso];
    }

    public function getHabitacion($name) {
        foreach ($this->_habitaciones as $hab) {
            if ($hab->getNombreBdd() == lcfirst($name)) return $hab;
        }
        
        return null;
    }
    
    public function getEntrenamiento($name) {
    
        foreach ($this->_entrenamientos as $ent) {
            if ($ent->getNombreBdd() == lcfirst($name)) return $ent;
        }
        
        return null;
    }


    public function puedeConstruir($habitacion) {
        if (is_string($habitacion)) {    
            $habitacion = $this->getHabitacion($habitacion);
        }
        return $this->getTotalRecurso("arm") >= $habitacion->getCosto("arm") &&
                $this->getTotalRecurso("mun") >= $habitacion->getCosto("mun") &&
                $this->getTotalRecurso("dol") >= $habitacion->getCosto("dol");
    }
    
    public function puedeConstruirEntrenamiento($entrenamiento) {
        if (is_string($entrenamiento)) {    
            $entrenamiento = $this->getEntrenamiento($entrenamiento);
        }

        if (!$entrenamiento instanceof Mob_Entrenamiento_Abstract) return false;

        return $this->getTotalRecurso("arm") >= $entrenamiento->getCosto("arm") &&
                $this->getTotalRecurso("mun") >= $entrenamiento->getCosto("mun") &&
                $this->getTotalRecurso("dol") >= $entrenamiento->getCosto("dol");
    }
    
    public function getTropa($tropa) {
        return isset($this->_tropas[lcfirst($tropa)]) ? 
                    $this->_tropas[lcfirst($tropa)] :
                    $this->_tropasSeguridad[lcfirst($tropa)];
    }
    
    public function puedeEntrenar($tropa, $cantidad) {
        $tropa = $this->getTropa($tropa);
    
        return $this->getTotalRecurso("arm") >= $tropa->getCosto("arm")*$cantidad &&
                $this->getTotalRecurso("mun") >= $tropa->getCosto("mun")*$cantidad &&
                $this->getTotalRecurso("dol") >= $tropa->getCosto("dol")*$cantidad; 
    }
    
    public function construir($habitacion, $enCola = false) {
        if (!$this->estaConstruyendo()) {
          $this->_habitacionConstruyendo = $this->getHabitacion($habitacion);
        }
        
        Mob_Loader::getModel("Habitacion_Nueva")->construir($this, $this->getHabitacion($habitacion), $enCola);
        $this->setData();
    }
    
    public function entrenar($tropa, $cantidad) {
        return $this->getTropa($tropa)->entrenar($cantidad);
    }
    
    public function construirEntrenamiento($entrenamiento, $enCola = false) {
        return Mob_Loader::getModel("Entrenamiento_Nuevo")->entrenar($this, $this->getEntrenamiento($entrenamiento), $enCola);
    }
    
    public function getColaEntrenamientos() {
        return $this->getModelTropaNueva()->getColaEntrenamientos($this->getId(), 1);
    }
    
    public function getColaEntrenamientosSeguridad() {
        return $this->getModelTropaNueva()->getColaEntrenamientos($this->getId(), 2);
    }
    
    public function restarRecursos($arm = 0, $mun = 0, $dol = 0, $alc = 0) {
        return $this->getModel()->restarRecursos($this->getId(), $arm, $mun, $dol, $alc);
    }
    
    public function sumarRecursos($arm = 0, $mun = 0, $dol = 0, $alc = 0) {
        return $this->getModel()->sumarRecursos($this->getId(), $arm, $mun, $dol, $alc);
    }
    
    public function getDistancia($ciudad, $barrio, $edificio) {
        //http://board.vendetta.es/index.php?page=Thread&postID=738335&highlight=ciudad+barrio#post738335
        // http://themobchallenge/mob/misiones?coord1=25:25:17&coord2=25:25:251
        /*
        $distanciaIzquierda = 
            function ($c, $e) {return ($c-1)*17+($e % 17 == 0 ? 17 : (($e/17)-floor($e/17)) *17) -1;};
        $distanciaArriba = 
            function ($b, $e) {return ($b-1)*15+ceil($e/17)-1;};
        */
        $distanciaIzquierda = 
            create_function('$c,$e', 'return ($c-1)*17+($e % 17 == 0 ? 17 : (($e/17)-floor($e/17)) *17) -1;');
        $distanciaArriba = create_function('$b,$e', 'return ($b-1)*15+ceil($e/17)-1;');
        // mis distancias
        $distanciaIzquierda1 = $distanciaIzquierda($this->_data["coord1"], $this->_data["coord3"]);
        $distanciaArriba1 = $distanciaArriba($this->_data["coord2"], $this->_data["coord3"]);
    
        // las distancais del otro edificio
        $distanciaIzquierda2 = $distanciaIzquierda($ciudad, $edificio);
        $distanciaArriba2 = $distanciaArriba($barrio, $edificio);
        
        $distanciaIzquierda = abs($distanciaIzquierda1 - $distanciaIzquierda2);
        $distanciaArriba = abs($distanciaArriba1 - $distanciaArriba2);
    
        $distancia = round(sqrt(pow($distanciaArriba, 2)+pow($distanciaIzquierda, 2))) * 1000;
    
        return $distancia;
    }
    
    public function getListadoHabitaciones() {
        return $this->_habitaciones;
    }

    public function getListadoEntrenamientos() {
        return $this->_entrenamientos;
    }

    public function getListadoTropas() {
        return $this->_tropas;
    }
    
    public function getListadoTropasSeguridad() {
        return $this->_tropasSeguridad;
    }
    
    public function totalHabitacionesEnCola() {
      return Mob_Loader::getModel("Habitacion_Nueva")->totalHabitacionesEnCola($this->getId());
    }
    
    public function puedePonerHabEnCola() {
      return $this->totalHabitacionesEnCola() < 6;
    }
    
    public function cancelarHabitacion($idHabitacionNueva) {
      Mob_Loader::getModel("Habitacion_Nueva")->cancelar((int)$idHabitacionNueva, $this->_jugador->getIdUsuario(), $this->getId());
      $this->setData();
    }
    
    public function getRecursosDesprotegidos() {
        return array(
          "arm" => max($this->getTotalRecurso("arm") - $this->getHabitacion(Mob_Server::getDeposito(1))->getAlmacenamientoSeguro(), 0),
          "mun" => max($this->getTotalRecurso("mun") - $this->getHabitacion(Mob_Server::getDeposito(2))->getAlmacenamientoSeguro(), 0),
          "dol" => max($this->getTotalRecurso("dol") - $this->getHabitacion(Mob_Server::getDeposito(3))->getAlmacenamientoSeguro(), 0),
          "alc" => max($this->getTotalRecurso("alc") - $this->getHabitacion(Mob_Server::getDeposito(4))->getAlmacenamientoSeguro(), 0)
        );
    }
    
    public function restarTropas(array $tropas) {
        return $this->getModelTropa()->restarTropas($this->_edificioId, $tropas);
    }
}