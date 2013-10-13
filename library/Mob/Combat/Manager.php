<?php

class Mob_Combat_Manager {

    protected $_data;
    protected $_jugadorDefensor;
    protected $_jugadorAtacante;
    protected $_edificioAtacante;
    protected $_combat;
    protected $_robo;
    protected $_numberFormat;
    protected $_idBatalla;
    
    public function __construct(array $dataMisiones = null) {
        $this->_numberFormat = new Mob_View_Helper_NumberFormat;
        $this->_data = $dataMisiones;
        
        $tropasBatalla = array();
        
        $this->_jugadorAtacante = new Mob_Jugador($this->_data["id_usuario"]);
        
        $idEdificioAtacante = Mob_Loader::getModel("Edificio")->getIdByCoord($this->_data["coord_orig_1"], $this->_data["coord_orig_2"], $this->_data["coord_orig_3"]);
        
        $this->_jugadorAtacante->setEdificio($idEdificioAtacante);
        
        $this->_edificioAtacante = $this->_jugadorAtacante->getEdificioActual();
                    
        $tropasAtacante = Zend_Json::decode($this->_data["tropas"]);

        foreach ($tropasAtacante as $tropa => $cantidad) {
            $tropasBatalla[$tropa]["a"] = array("total" => $cantidad, 
                    "ataque" => $this->_edificioAtacante->getTropa($tropa)->getAtaque(),
                    "defensa" => $this->_edificioAtacante->getTropa($tropa)->getDefensa());
            $tropasBatalla[$tropa]["d"] = array("total" => 0, "ataque" => 0, "defensa" => 0);    
        }
        
        $this->_jugadorDefensor = new Mob_Jugador(
                Mob_Loader::getModel("Edificio")->getUsuarioByCoord(
                    $this->_data["coord_dest_1"], $this->_data["coord_dest_2"], $this->_data["coord_dest_3"], true));
                                                    
        $idEdificioDefensor = Mob_Loader::getModel("Edificio")->getIdByCoord($this->_data["coord_dest_1"], $this->_data["coord_dest_2"], $this->_data["coord_dest_3"]);

        $this->_jugadorDefensor->setEdificio($idEdificioDefensor);
        
        foreach ($this->_jugadorDefensor->getEdificioActual()->getTropasEstacionadas() as $tropa) {
            if ($tropa->getCantidad() > 0) {
                if (!isset($tropasBatalla[$tropa->getNombreBdd()]["a"])) {
                    $tropasBatalla[$tropa->getNombreBdd()]["a"] = array("total" => 0, "ataque" => 0, "defensa" => 0);
                }
                
                $tropasBatalla[$tropa->getNombreBdd()]["d"] = array("total" => $tropa->getCantidad(),
                    "ataque" => $tropa->getAtaque(), "defensa" => $tropa->getDefensa());
        
            }
        }
        
        $extra = array("pctPoderA" => $this->_jugadorAtacante->getPoderAtaque(), "pctPoderD" => $this->_jugadorDefensor->getPoderAtaque(),
        "totalEdificiosA" => $this->_jugadorAtacante->getTotalEdificios(), "totalEdificiosD" => $this->_jugadorDefensor->getTotalEdificios(),
        "honorA" => $this->_jugadorAtacante->getEdificioActual()->getEntrenamiento(Mob_Server::getNameEntPoderAtaque())->getNivel(),
        "honorD" => $this->_jugadorDefensor->getEdificioActual()->getEntrenamiento(Mob_Server::getNameEntPoderAtaque())->getNivel());
        
        $combatSystemClass = Mob_Server::getCombatSystemClass();
        $this->_combat = new $combatSystemClass($tropasBatalla, $extra);
        
        $this->_save();     
    }
    
    public function __destruct() {
      $this->_jugadorAtacante->__destruct();
      $this->_jugadorDefensor->__destruct();
    }
    
    protected function _save() {
    
        // seteamos tropas restantes del defensor
        // primero todo a cero y despues seteamos la cantidad que haya quedado
        foreach (Mob_Data::getTropas() as $tropa) {
          Mob_Loader::getModel("Tropa")->setTropa($this->getIdEdificioDefensor(), $tropa, 0);
        }
        
        foreach ($this->_combat->getTropasRestantes("defensor") as $tropa => $cantidad) {
            Mob_Loader::getModel("Tropa")->setTropa($this->getIdEdificioDefensor(), $tropa, $cantidad);
        }
        
        // restamos a ambos jugadores los puntos de tropas perdidos
        Mob_Loader::getModel("Usuarios")->restarPuntosTropa($this->_jugadorAtacante->getIdUsuario(), $this->_combat->getPuntosPerdidos("atacante"));
        Mob_Loader::getModel("Usuarios")->restarPuntosTropa($this->_jugadorDefensor->getIdUsuario(), $this->_combat->getPuntosPerdidos("defensor"));
        
        // restamos al defensor el robo
        $robo = $this->getRobo();
        Mob_Loader::getModel("Edificio")->restarRecursos($this->getIdEdificioDefensor(), $robo["arm"], $robo["mun"], $robo["dol"], $robo["alc"]);

        $resultado = array(
                          "coord_atacante" => $this->_data["coord_orig_1"].":".$this->_data["coord_orig_2"].":".$this->_data["coord_orig_3"],
                          "coord_defensor" => $this->_data["coord_dest_1"].":".$this->_data["coord_dest_2"].":".$this->_data["coord_dest_3"],
                          "robo" => $this->getRobo(),
                          "batalla" => $this->_combat->getData(),
                          "habitaciones_defensor" => array_map(create_function('$hab', 'return $hab->getNivel();'), $this->_jugadorDefensor->getEdificioActual()->getListadoHabitaciones()),
                          "recursos_disponibles" => array(),
                          "trp_atacante" => Zend_Json::encode($this->_combat->getTropas("atacante")),
                          "trp_defensor" => Zend_Json::encode($this->_combat->getTropas("defensor")),
                          "trp_rest_atacante" => Zend_Json::encode($this->_combat->getTropasRestantes("atacante")),
                          "trp_rest_defensor" => Zend_Json::encode($this->_combat->getTropasRestantes("defensor"))
                    );
           
        $this->_jugadorDefensor->getEdificioActual()->setData();
        foreach (array("arm", "mun", "dol", "alc") as $rec) {
          $resultado["recursos_disponibles"][$rec] = $this->_jugadorDefensor->getEdificioActual()->getTotalRecurso($rec);
        }
        
        $idFamiliaAtacante = $this->_jugadorAtacante->getIdFamilia();
        $idFamiliaDefensor = $this->_jugadorDefensor->getIdFamilia();
        
        $ptsPerdAtacante = $this->_combat->getPuntosPerdidos("atacante");
        $ptsPerdDefensor = $this->_combat->getPuntosPerdidos("defensor");
                  
        $idGuerra = Mob_Loader::getModel("Guerras")->getIdByFamilias($idFamiliaAtacante, $idFamiliaDefensor);
        // hacemos el insert
        $this->_idBatalla = Mob_Loader::getModel("Batallas")->insert(array(
                "resultado" => Zend_Json::encode($resultado), 
                "atacante" => $this->_jugadorAtacante->getIdUsuario(), 
                "defensor" => $this->_jugadorDefensor->getIdUsuario(),
                "pts_atacante" => $this->_combat->getPuntosTotales("atacante"),
                "pts_defensor" => $this->_combat->getPuntosTotales("defensor"),
                "pts_perd_atacante" => $ptsPerdAtacante,
                "pts_perd_defensor" => $ptsPerdDefensor,
                "fecha" => $this->_data["fecha_fin"],
                "recursos_arm" => $robo["arm"],
                "recursos_mun" => $robo["mun"],
                "recursos_dol" => $robo["dol"],
                "recursos_alc" => $robo["alc"],
                "id_familia_a" => $idFamiliaAtacante,
                "id_familia_d" => $idFamiliaDefensor,
                "nombre_a" => $this->_jugadorAtacante->getNombre(),
                "nombre_d" => $this->_jugadorDefensor->getNombre(),
                "id_guerra" => $idGuerra                
              )
        );
               
        if ($idGuerra) {
          Mob_Loader::getModel("Guerras")->sumarPerdidas($idGuerra, $ptsPerdAtacante, $idFamiliaAtacante, $ptsPerdDefensor, $idFamiliaDefensor);
        }
               
        /*$i = include_once APPLICATION_PATH."/modules/mob/views/helpers/getBatalla.php";
        $renderBatalla = new Mob_View_Helper_GetBatalla;
        $renderBatalla->view = Zend_Controller_Front::getInstance()->getParam('bootstrap')->getResource('view'); 
        echo $renderBatalla->getBatalla($this->_idBatalla, Zend_Auth::getInstance()->getIdentity()->id_usuario);*/              
    }
    
    public function getIdBatalla() {
      return $this->_idBatalla;
    }
    
    public function getIdEdificioDefensor() {
        return $this->_jugadorDefensor->getEdificioActual()->getId();
    }
    
    public function getTropasRestantesAtacante() {
        return $this->_combat->getTropasRestantes("atacante");
    }
        
    public function getRobo() {
        if (isset($this->_robo)) return $this->_robo;
        
        $robos = array("arm" => 0, "mun" => 0, "alc" => 0, "dol" => 0);
        
        if ($this->_combat->getTropasRestantes("defensor") != array()) return $this->_robo = $robos;
        
        $capacidad = 0;
        
        foreach ($this->_combat->getTropasRestantes("atacante") as $tropa => $c) {
            $capacidad += $c*$this->_edificioAtacante->getTropa($tropa)->getCapacidad();
        }
        
        $this->_recursosLibresDefensor = $this->_jugadorDefensor->getEdificioActual()->getRecursosDesprotegidos();
        
        $totalRecursos = array_sum($this->_recursosLibresDefensor);       
        if ($totalRecursos == 0) return $this->_robo = $robos;
        $almacenamientoLibre = 0;
        foreach ($this->_recursosLibresDefensor as $rec => $cant) {
            // porcentaje del recurso sobre el total de recursos disponibles
            $porcentaje = $cant*100/$totalRecursos;
            // el robo es dicho porcentaje sobre la capacidad total
            $posibleRobo = round($porcentaje*$capacidad/100);
            if ($posibleRobo > $cant) {
              // puedo robar mas de lo que hay, entonces robo solo lo que hay y el resto lo dejo para otro posible recurso
              $robo = $cant;
              $almacenamientoLibre += $posibleRobo-$cant;
            } else {
              $robo = $posibleRobo;
              // puedo robar mas de este recurso, si tengo almacenamiento libre (porque de otro recurso robe menos) lo lleno
              if ($almacenamientoLibre > 0) {
                // le sumo el almacenamientoLibre que dispongo o sino, lo que queda del recurso
                $roboExtra = min($almacenamientoLibre, $cant-$robo);
                $almacenamientoLibre = max($roboExtra, 0);
                $robo += $roboExtra;
              }
            }
            $robo = round($porcentaje*$capacidad/100);
            //echo "total $rec = $cant, porcentaje = $porcentaje, robo = $robo<br>";
            $robos[$rec] = $robo <= $cant ? $robo : $cant;
        }
        
        return $this->_robo = $robos;
    }
    
}