<?php

class Mob_Model_Logueos extends Mob_Db_Table_Abstract {

    protected $_name = "mob_logueos";
    protected $_primary = "id_login";
    
    public function getUltimos($idUsuario, $limit = 20) {
      return $this->fetchAll("id_usuario = $idUsuario", "id_login DESC", $limit)->toArray();
    }
    
    public function totalSameIp($ip, $distinticIdUser) {
     
      $cacheId = "totalSameIp_".md5($ip."_".$distinticIdUser);
      if(($result = $this->_cache->load($cacheId)) === false) {
        $query = $this->select()->from($this->_name, "(COUNT(DISTINCT(id_usuario)))")->where("ip = ?", $ip)->where("id_usuario != ?", $distinticIdUser);
        $result = $this->_db->fetchOne($query);
        $this->_cache->save($result, $cacheId);
      }            
      return $result;
    }
    
    public function getByIp($ip) {      
      $cacheId = "getByIp_".md5($ip);
      if(($result = $this->_cache->load($cacheId)) === false) {
        $query = $this->select()->where("ip = ?", $ip)->order("id_login DESC");
        $result = $this->_db->fetchAll($query);
        $this->_cache->save($result, $cacheId);
      }            
      return $result;      
    }
    
    public function getCoincidenciasIp() {
      $fecha = date("Y-m-d 00:00:00", strtotime("-2 days"));
     
      $cacheId = "getCoincidenciasIp_".md5($fecha);
      if(($result = $this->_cache->load($cacheId)) === false) {
        $query = "SELECT COUNT( DISTINCT (
            id_usuario
            ) ) as total, ip
            FROM mob_logueos
            WHERE fecha >  '".$fecha."'
            GROUP BY ip
            HAVING COUNT( DISTINCT (
            id_usuario
            ) ) >1
            ORDER BY COUNT( DISTINCT (
            id_usuario
            ) ) DESC ";      
        $result = $this->_db->fetchAll($query);
        $this->_cache->save($result, $cacheId);
      }            
      return $result;
    }
}