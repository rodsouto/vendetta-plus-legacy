<?php

class Mob_Model_Puntos extends Zend_Db_Table_Abstract {

    protected $_name = "mob_puntos";
    protected $_primary = "id_puntos";
    
    public function getUltimoRanking($idUsuario) {
      $query = $this->select()->from($this->_name, "pos_ranking")->where("id_usuario = ?", $idUsuario)->limit(1)->order("id_puntos DESC");
      return $this->_db->fetchOne($query);
    }
    
    public function getVariacion($idUsuario) {
      $query = $this->select()->where("id_usuario = ?", $idUsuario)->limit(2)->order("id_puntos DESC");
      $data = $this->_db->fetchAll($query);
      
      if (sizeof($data) < 2) return true; // crecio
      
      return $data[0]["puntos_total"] >= $data[1]["puntos_total"];
    }            
}