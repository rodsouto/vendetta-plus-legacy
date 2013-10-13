<?php

class Mob_Model_Misiones_Todas extends Mob_Db_Table_Abstract {

    protected $_name = "mob_misiones_todas";
    protected $_primary = "id_mision";
    
    public function getLastByIdUsuario($idUsuario, $mision = null) {          
      $cacheId = "getLastByIdUsuario_".(int)$mision."_".md5($idUsuario);
      if(($result = $this->_cache->load($cacheId)) === false) {
        $query = "SELECT m.* 
          FROM mob_misiones_todas m
          LEFT JOIN mob_edificios e ON e.id_usuario = $idUsuario
          AND e.coord1 = m.coord_dest_1
          AND e.coord2 = m.coord_dest_2
          AND e.coord3 = m.coord_dest_3
          WHERE (m.id_usuario = $idUsuario OR e.id_usuario = $idUsuario)
          AND fecha_inicio > '".date("Y-m-d H:i:s", strtotime("-5 days"))."' AND cantidad > 0 AND m.mision != 5 ";
        if (!empty($mision)) $query .= " AND m.mision = $mision ";
        $query .= "GROUP BY m.id_mision ORDER BY id_mision DESC";
        $result = $this->_db->fetchAll($query);
        $this->_cache->save($result, $cacheId);
      }     
      
      return $result;
    }
    
}