<?php

class Mob_Model_Misiones extends Mob_Db_Table_Abstract {

    protected $_name = "mob_misiones";
    protected $_primary = "id_mision";

    public function getMisionesSimple($idUsuario) {
    
        //if (isset($_GET["newQueryMisiones"])) {
          // para optimizar el join
          // obtengo las misiones que tienen como destino mis edificios y no son mias
          $query = "SELECT distinct(m.id_mision) as id_mision FROM mob_edificios e 
          LEFT JOIN mob_misiones m ON m.coord_dest_1 = e.coord1 AND m.coord_dest_2 = e.coord2 AND m.coord_dest_3 = e.coord3
          WHERE e.id_usuario = $idUsuario AND m.id_usuario != $idUsuario";
          $idMisiones = array(0 => 1);
          foreach ($this->_db->fetchAll($query) as $m) $idMisiones[$m["id_mision"]] = 1;   
            
          $query = "SELECT m.* 
            FROM mob_misiones m
            WHERE (m.id_usuario = $idUsuario OR id_mision IN (".implode(", ", array_keys($idMisiones))."))
            AND fecha_fin < '".date("Y-m-d H:i:s")."' AND cantidad > 0 AND 1 = 1 GROUP BY m.id_mision";
  
          return $this->_db->fetchAll($query);
        //}    
    
        $query = "SELECT m.* 
          FROM mob_misiones m
          LEFT JOIN mob_edificios e ON e.id_usuario = $idUsuario
          AND e.coord1 = m.coord_dest_1
          AND e.coord2 = m.coord_dest_2
          AND e.coord3 = m.coord_dest_3
          WHERE (m.id_usuario = $idUsuario OR e.id_usuario = $idUsuario)
          AND fecha_fin < '".date("Y-m-d H:i:s")."' AND cantidad > 0 GROUP BY m.id_mision";
        return $this->_db->fetchAll($query);
    }

    public function getMisiones($idUsuario) {
      $cacheId = 'getMisiones'.$idUsuario;
      if(($result = $this->_cache->load($cacheId)) === false) {
          $query = $this->_db->select()
            ->from(array("m" =>"mob_misiones"))
            ->from(array("e" => "mob_edificios"), array())
            ->where("e.id_usuario = ?", $idUsuario)
            ->where("e.coord1 = m.coord_orig_1 AND e.coord2 = m.coord_orig_2 AND e.coord3 = m.coord_orig_3 OR
            e.coord1 = m.coord_dest_1 AND e.coord2 = m.coord_dest_2 AND e.coord3 = m.coord_dest_3")
            ->where("m.mision != 5 OR (m.mision = 5 AND e.coord1 = m.coord_dest_1 AND e.coord2 = m.coord_dest_2 AND e.coord3 = m.coord_dest_3)")
            ->where("m.fecha_fin > (NOW())")
            ->order("m.fecha_fin ASC")
            ->group("m.id_mision")
            ->where("cantidad > 0");
          
          $result = $this->_db->fetchAll($query);
       
          $this->_cache->save($result, $cacheId);
      }   
  
      return $result;    
    }
    
    public function puedeVolver($idUsuario, $idMision) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)
                        ->where("id_mision = ?", $idMision)
                        ->where("mision != 5")
                        ->limit(1);
                        
        return $this->_db->fetchAll($query) != array();
    }
    
    public function volver($idMision) {
        $query = $this->select()
                        ->where("id_mision = ?", $idMision)
                        ->where("mision != 5")
                        ->limit(1);
    
        $data = $this->fetchAll($query);
        if ($data->toArray() == array()) return false;

        $data = $data->current();

        $tiempoTranscurridoMision = time() - strtotime($data->fecha_inicio); 

        $data->fecha_fin = date("Y-m-d H:i:s", time() + $tiempoTranscurridoMision);
        $data->fecha_inicio = date("Y-m-d H:i:s");

        $data->mision = 5;

        $a = $data->coord_dest_1;
        $b = $data->coord_dest_2;
        $c = $data->coord_dest_3;

        $data->coord_dest_1 = $data->coord_orig_1;
        $data->coord_dest_2 = $data->coord_orig_2;
        $data->coord_dest_3 = $data->coord_orig_3;

        $data->coord_orig_1 = $a;
        $data->coord_orig_2 = $b;
        $data->coord_orig_3 = $c;

        $data->save();
        return true; 
    }
    
    public function regresar($v) {  
      return $this->insert(array(
        "tropas" => $v["tropas"],
        "coord_dest_1" => $v["coord_orig_1"],
        "coord_dest_2" => $v["coord_orig_2"],
        "coord_dest_3" => $v["coord_orig_3"],
        "coord_orig_1" => $v["coord_dest_1"],
        "coord_orig_2" => $v["coord_dest_2"],
        "coord_orig_3" => $v["coord_dest_3"],
        "mision" => 5, // regresando
        "recursos_arm" => $v["recursos_arm"],
        "recursos_mun" => $v["recursos_mun"],
        "recursos_alc" => $v["recursos_alc"],
        "recursos_dol" => $v["recursos_dol"],
        "fecha_inicio" => $v["fecha_fin"],
        "fecha_fin" => date("Y-m-d H:i:s", strtotime($v["fecha_fin"])+$v["duracion"]),
        "id_usuario" => $v["id_usuario"],
        "duracion" => $v["duracion"],
        //"id_mision_original" => $v["id_mision"]
      ));
    }
    
    public function deleteFinalizadas($idUsuario) {
        $query = "DELETE mob_misiones FROM mob_misiones 
        LEFT JOIN mob_edificios e on e.id_usuario = $idUsuario AND e.coord1 = coord_dest_1 AND e.coord2 = coord_dest_2 AND e.coord3 = coord_dest_3 
        WHERE mob_misiones.id_usuario = $idUsuario
        AND fecha_fin < '".date("Y-m-d H:i:s")."'"; 
        return $this->_db->query($query);
    }
    
    public function deleteById($idMision) {
      return $this->delete("id_mision = ".(int)$idMision);
    }
    
    public function insert(array $data) {
    
      /*$time = strtotime($data["fecha_fin"]);
      $segundos = $time%60;
      
      if ($segundos < 55) ($time += 55-$segundos);
      else $time -= ($segundos - 55);
      
      $data["fecha_fin"] = date("Y-m-d H:i:s", $time);*/    
    
      if (is_array($data["tropas"])) {
        $tropas = $data["tropas"];
        $data["tropas"] = Zend_Json::encode($data["tropas"]);
      } else {
        $tropas = Zend_Json::decode($data["tropas"]); 
      }
      
      $cantidad = array_sum($tropas);
      
      if ($cantidad == 0) return;
      $data["cantidad"] = $cantidad;
      $this->_db->insert("mob_misiones_todas", $data); 
      return parent::insert($data); 
    }
    
    public function getTotalByTipo($tipo) {
      $cacheId = 'getTotalByTipo_'.$tipo;
      if(($result = $this->_cache->load($cacheId)) === false) {
          $query = "SELECT COUNT(*) FROM {$this->_name} WHERE mision = $tipo AND fecha_fin > '".date("Y-m-d H:i:s")."'";
          $result =  (int)$this->_db->fetchOne($query);
       
          $this->_cache->save($result, $cacheId);
      }
      
      return $result;    
    }
    
    public function getTotalTropasByTipo($tipo) {
      $cacheId = 'getTotalTropasByTipo_'.$tipo;
      if(($result = $this->_cache->load($cacheId)) === false) {
          $query = "SELECT SUM(cantidad) FROM {$this->_name} WHERE mision = $tipo AND fecha_fin > '".date("Y-m-d H:i:s")."'";
          $result =  (int)$this->_db->fetchOne($query);
       
          $this->_cache->save($result, $cacheId);
      }
      
      return $result;    
    }
    
    public function getInfoRecTransportados() {
      $cacheId = 'getInfoRecTransportados';
      if(($result = $this->_cache->load($cacheId)) === false) {
          $query = "SELECT SUM(recursos_arm) as arm, SUM(recursos_mun) as mun, SUM(recursos_dol) as dol 
                    FROM {$this->_name} WHERE mision = 3 AND fecha_fin > '".date("Y-m-d H:i:s")."'";
          $result = array_map("intval", $this->_db->fetchRow($query));
       
          $this->_cache->save($result, $cacheId);
      }
      
      return $result;
    }
    
    public function tieneMisionesActivas($idUsuario) {
        $query = "SELECT COUNT(*) FROM {$this->_name} WHERE id_usuario = ".(int)$idUsuario;
        return $this->_db->fetchOne($query) > 0;
    }
    
}