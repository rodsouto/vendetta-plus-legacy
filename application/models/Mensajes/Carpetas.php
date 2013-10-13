<?php

class Mob_Model_Mensajes_Carpetas  extends Zend_Db_Table_Abstract {

    protected $_name = "mob_mensajes_carpetas";
    protected $_primary = "id_carpeta";
    
    public function getCarpetas($idUsuario) {
        $query = "SELECT *, (SELECT COUNT(*) FROM mob_mensajes WHERE id_carpeta = c.id_carpeta AND borrado_dest = 0 AND destinatario = c.id_usuario) as mensajes FROM {$this->_name} c 
        WHERE c.id_usuario = ".(int)$idUsuario;
        return $this->_db->fetchAll($query);
    }
    
    public function getNombre($idCarpeta) {
        return $this->_db->fetchOne("SELECT nombre FROM {$this->_name} WHERE id_carpeta = ".(int)$idCarpeta." LIMIT 1");
    }    
    
    public function borrar($idUsuario, $idBorrar) {
      return $this->delete("id_usuario = ".(int)$idUsuario." AND id_carpeta = ".(int)$idBorrar);
    }
    
    public function esDeUsuario($idCarpeta, $idUsuario) {
      $query = "SELECT COUNT(*) FROM {$this->_name} WHERE id_usuario = ".(int)$idUsuario." AND id_carpeta = ".(int)$idCarpeta;
      return $this->_db->fetchOne($query) > 0;
    }

}