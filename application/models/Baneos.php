<?php

class Mob_Model_Baneos extends Zend_Db_Table_Abstract {

    protected $_name = "mob_baneos";
    protected $_primary = "id_ban";
    
    public function getMotivoBan($idUsuario) {
      $query = $this->select()->from($this->_name, "motivo")
              ->where("id_usuario = ?", (int)$idUsuario)->order("id_ban DESC")->limit(1);
      return $this->_db->fetchOne($query);
    }
    
    public function getFechaLastBan($idUsuario) {
      $query = $this->select()->from($this->_name, "fecha_fin")
              ->where("id_usuario = ?", (int)$idUsuario)->order("id_ban DESC")->limit(1);
      return $this->_db->fetchOne($query);    
    }
    
    public function estaBaneado($idUsuario) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
              ->where("fecha_fin > NOW()")->where("id_usuario = ?", (int)$idUsuario);
      return $this->_db->fetchOne($query) != 0;    
    }    
        
}