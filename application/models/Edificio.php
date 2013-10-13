<?php

class Mob_Model_Edificio extends Mob_Db_Table_Abstract {

  protected $_name = "mob_edificios";
  protected $_primary = "id_edificio";
  protected $_queryRanking;
  protected $_cacheEdificios;
  
  public function getQueryRanking() {
    return $this->_queryRanking;
  }

    public function getByIdEdificio($idEdificio) {
        if (isset($this->_cacheEdificios[$idEdificio])) {
          return $this->_cacheEdificios[$idEdificio];
        }
                           
        $query = $this->select()->where("id_edificio = ?", (int)$idEdificio)->limit(1);
        $data = $this->_db->fetchAll($query);
        $this->_cacheEdificios[$idEdificio] = isset($data[0]) ? $data[0] : array();
        return $this->_cacheEdificios[$idEdificio];
    }
  
  public function getEdificios($idUsuario) {
      $cacheId = 'getEdificios'.$idUsuario;
      //if(($data = $this->_cache->load($cacheId)) === false) {
        $where = $this->select()->where("id_usuario = ?", (int)$idUsuario)->order(array("coord1", "coord2", "coord3"));
        
        $data = array();
        foreach($this->_db->fetchAll($where) as $v) $data[$v["id_edificio"]] = $v["coord1"].":".$v["coord2"].":".$v["coord3"];
        //$this->_cache->save($data, $cacheId);
      //}
      
      return $data;
  }
  
  public function getIdEdificios($idUsuario) {
    return array_keys($this->getEdificios($idUsuario));
  }
  
  public function getTodosEdificios($idUsuario, $cache = true) {
        
        $where = $this->select()->where("id_usuario = ?", (int)$idUsuario)->order(array("coord1", "coord2", "coord3"));
        
        if (!$cache) {
          return $this->_db->fetchAll($where);        
        }
  
        $cacheId = 'getTodosEdificios'.$idUsuario;
        if(($data = $this->_cache->load($cacheId)) === false) {
          $data = $this->_db->fetchAll($where);
          $this->_cache->save($data, $cacheId);
        }
        
        return $data;
  }
   
  public function getPrincipal($idUsuario) {
    $where = $this->select()->where("id_usuario = ?", (int)$idUsuario);

    $data =  $this->fetchAll($where, null, 1)->toArray();
    return isset($data[0]) ? $data[0]["id_edificio"] : 0;
    
  }
  
    public function puedeGastar($idEdificio, $arm = 0, $mun = 0, $dol = 0, $alc = 0) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")->where("id_edificio = ?", $idEdificio)
      ->where("recursos_arm >= ?", $arm)->where("recursos_mun >= ?", $mun)
      ->where("recursos_dol >= ?", $dol)->where("recursos_alc >= ?", $alc)->limit(1);
      
      //var_dump($query->__toString(), $this->_db->fetchAll($this->select()->where("id_edificio = ?", $idEdificio)->limit(1)));
      
      return $this->_db->fetchOne($query) > 0;
    }
  
    public function restarRecursos($idEdificio, $arm = 0, $mun = 0, $dol = 0, $alc = 0) {
        return $this->sumarRecursos($idEdificio, -1 * $arm, -1 * $mun, -1 * $dol, -1 * $alc);
    }
    
    public function sumarRecursos($idEdificio, $arm = 0, $mun = 0, $dol = 0, $alc = 0) {        
        $almacenamiento = Mob_Loader::getModel("Habitacion")->getAlmacenamiento($idEdificio);
        
        $query1 = "UPDATE mob_edificios SET 
          recursos_arm = LEAST(recursos_arm + $arm, {$almacenamiento['arm']}),
          recursos_mun = LEAST(recursos_mun + $mun, {$almacenamiento['mun']}), 
          recursos_alc = LEAST(recursos_alc + $alc, {$almacenamiento['alc']}), 
          recursos_dol = LEAST(recursos_dol + $dol, {$almacenamiento['dol']}) 
          WHERE id_edificio = ".(int)$idEdificio." LIMIT 1";
        
        $query2 = "UPDATE mob_edificios SET recursos_alc = 0 WHERE id_edificio = ".(int)$idEdificio." AND recursos_alc < 0 LIMIT 1";
        /*$query3 = "UPDATE mob_edificios SET recursos_mun = 0 WHERE id_edificio = ".(int)$idEdificio." AND recursos_mun < 0 LIMIT 1";
        $query4 = "UPDATE mob_edificios SET recursos_dol = 0 WHERE id_edificio = ".(int)$idEdificio." AND recursos_dol < 0 LIMIT 1";
        $query5 = "UPDATE mob_edificios SET recursos_arm = 0 WHERE id_edificio = ".(int)$idEdificio." AND recursos_arm < 0 LIMIT 1";*/ 

        $this->_db->query($query1);
        $this->_db->query($query2);
        /*$this->_db->query($query3);
        $this->_db->query($query4);
        $this->_db->query($query5);*/
    }
    
    public function getTotalEdificios($idUsuario) {
        $cacheId = 'getTotalEdificios'.$idUsuario;
        //if(($data = $this->_cache->load($cacheId)) === false) {
          $query = $this->select()->from($this->_name, "(COUNT(*))")->where("id_usuario = ?", $idUsuario);
          $data = $this->_db->fetchOne($query);
          $this->_cache->save($data, $cacheId);
        //}
        return $data;
    }
    
    public function getCoordDisponible($a = null, $b = null) {
        while(true) {
            $a = $a != null ? $a : rand(1, 50);
            $b = $b != null ? $b : rand(1, 50);
            $c = rand(1, 255);
            $query = $this->select()->where("coord1 = ?", $a)
                                    ->where("coord2 = ?", $b)
                                    ->where("coord3 = ?", $c)
                                    ->limit(1);
            if ($this->fetchAll($query)->toArray() == array()) return array($a, $b, $c);
        }
    }
    
    public function esCoordenadaMia($a, $b, $c, $id_usuario) {
        $query = $this->select()->where("id_usuario = ?", $id_usuario)
                                ->where("coord1 = ?", $a)
                                ->where("coord2 = ?", $b)
                                ->where("coord3 = ?", $c)
                                ->limit(1);
        return $this->fetchAll($query)->toArray() != array();
    }
    
    public function getIdByCoord($a, $b, $c) {
        $query = $this->select()->where("coord1 = ?", $a)
                                ->where("coord2 = ?", $b)
                                ->where("coord3 = ?", $c)
                                ->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_edificio"] : 0;
    }
    
    public function getUsuarioByCoord($a, $b, $c, $id = false) {
        $query = $this->select()->where("coord1 = ?", $a)
                                ->where("coord2 = ?", $b)
                                ->where("coord3 = ?", $c)
                                ->limit(1);
        $data = $this->fetchAll($query)->toArray();
        if (empty($data)) return null;
        if ($id) return $data[0]["id_usuario"]; 
        return isset($data[0]) ? Mob_Loader::getModel("Usuarios")->getUsuario($data[0]["id_usuario"]) : null;
    }

    public function getUsuarioById($idEdificio) {
        $data = $this->getByIdEdificio($idEdificio);
        return $data["id_usuario"];
    }
    
    public function getCoord($idEdificio, $text = false) {
        $data = $this->getByIdEdificio($idEdificio);
        
        if ($text) return !empty($data) ? $data["coord1"].":".$data["coord2"].":".$data["coord3"] : "";
        
        return !empty($data) ? array($data["coord1"], $data["coord2"], $data["coord3"]) : 0;
    }
    
    public function ocupar($idUsuario, array $coords, $arm = 1000, $mun = 1000, $dol = 1000, $alc = 1000) {
        if ($this->getIdByCoord($coords[0], $coords[1], $coords[2]) != 0) return false;

        try {
          $this->_db->beginTransaction();
          
          $idEdificio = $this->insert(array("id_usuario" => $idUsuario,
          "coord1" => $coords[0],
          "coord2" => $coords[1],
          "coord3" => $coords[2], 
          "recursos_arm" => $arm,
          "recursos_mun" => $mun,
          "recursos_alc" => $alc,
          "recursos_dol" => $dol,
          "last_update" => date("Y-m-d H:i:s")
          ));
          
          Mob_Loader::getModel("Habitacion")->crearBase($idUsuario, $idEdificio);
          Mob_Loader::getModel("Tropa")->crearBase($idEdificio);          
          $this->_cache->clean(Zend_Cache::CLEANING_MODE_MATCHING_TAG, array("rankingUsuarios"));
          $this->_cache->remove('getEdificios'.$idUsuario);
          $this->_cache->remove('getTodosEdificios'.$idUsuario);
          $this->_cache->remove('getTotalEdificios'.$idUsuario);
          $this->_cache->remove("mapa_".$coords[0]."_".$coords[1]);          
          $this->_db->commit();
        } catch (Exception $e) {
          $this->_db->rollBack();
          return false;
        }                
        
       return $idEdificio;
    }
    
    public function sumarPuntos($idEdificio, $puntos) {
        $query = "UPDATE {$this->_name} SET puntos = puntos + $puntos WHERE id_edificio = $idEdificio LIMIT 1";
        $this->_db->query($query);
    }
    
    public function getInfoBarrio($ciudad, $barrio) {
        $query = $this->select()->where("coord1 = ?", $ciudad)->where("coord2 = ?", $barrio);
        
        $return = array();
        foreach ($this->_db->fetchAll($query) as $d) {
            $return[$d["coord3"]] = $d;
        }
        
        return $return;
    }

    public function getRanking($order = "pts") {
        $orders = array("pts" => "total_puntos", "ed" => "edificios");
        
        if (empty($order)) $order = "total_puntos";
        
        $page = Zend_Controller_Front::getInstance()->getRequest()->getParam("page", 1);
        
        $query = $this->select()->from($this->_name, array("coord1", "coord2", "total_puntos" => "(SUM(puntos))", "edificios" => "(COUNT(*))"))
                              ->group(array("coord1", "coord2"))->order("{$orders[$order]} DESC")->limitPage($page, 100);
      
        $this->_queryRanking = $query;

        $cacheId = "getRankingBarrios_".$orders[$order]."_".$page;
        if(($result = $this->_cache->load($cacheId)) === false) {
          $result = $this->_db->fetchAll($query);
          $this->_cache->save($result, $cacheId);
        }        
        
        return $result;
    }
    
    public function getRecursos($idEdificio) {
      $query = $this->select()->from($this->_name, array("recursos_arm", "recursos_mun", "recursos_dol", "recursos_alc"))->where("id_edificio = ?", $idEdificio);
      return $this->_db->fetchRow($query);
    }
    
    public function getTotalUsuarios() {
      return $this->_db->fetchOne("SELECT COUNT(DISTINCT(id_usuario)) FROM {$this->_name}");
    }
    
    public function getCantPromedio() {
      $totalEdificios = $this->_db->fetchOne("SELECT COUNT(*) FROM {$this->_name}");
      return max(round($totalEdificios/$this->getTotalUsuarios()), 1); 
    }
    
    public function getBarrioDisponible($cantEdificios) {
      $query = "SELECT coord1, coord2, 255-count(*) as disponibles FROM mob_edificios 
      GROUP BY coord1, coord2 HAVING disponibles >= $cantEdificios ORDER BY disponibles ASC LIMIT 1";
      
      $data = $this->_db->fetchAll($query);
      if (empty($data)) {
        // todos los barrios que tienen algun edificio estan llenos, buscamos un barrio vacio y lo ponemos ahi
        $coords = array();
        $noTengoCoordsVacias = true;
        while ($noTengoCoordsVacias) {
          $a = rand(1, 50);
          $b = rand(1, 50);
          if (!isset($coords[$a.":".$b])) {
            $coords[$a.":".$b] = 1;
            $query = $this->select()->where("coord1 = ?", $a)
                                    ->where("coord2 = ?", $b)
                                    ->limit(1);
            if ($this->fetchAll($query)->toArray() == array()) {
              // cool no hay nada en ese barrio
              return array($a, $b);
            }          
          }
        }
      } else {
        // tenemos un barrio disponible
        return array($data[0]["coord1"], $data[0]["coord2"]);
      }   
    }

}