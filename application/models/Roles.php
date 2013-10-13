<?php

class Mob_Model_Roles extends Mob_Db_Table_Abstract {

    protected $_name = "mob_roles";
    protected $_primary = "id";
    
    protected $_roles = array(0 => "Super Admin", 1 => "GO", 2 => "LA");
    
    public function getRoles() {
      return $this->_roles;
    }
    
    public function getRol($idRole) {
      return $this->_roles[$idRole];
    }
    
    public function getRolesByUser($idUsuario) {
      $roles = array();
      foreach ($this->fetchAll("id_usuario = ".(int)$idUsuario) as $v) {
        $roles[] = $v->id_rol;
      }
      return $roles;
    }  
    
    public function hasAnyRol($idUsuario) {
      return $this->_db->fetchOne("SELECT COUNT(*) FROM mob_roles WHERE id_usuario = ".(int)$idUsuario);
    }  
}