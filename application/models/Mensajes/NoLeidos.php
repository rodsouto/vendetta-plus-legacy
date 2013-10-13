<?php

class Mob_Model_Mensajes_NoLeidos extends Zend_Db_Table_Abstract {

    protected $_name = "mob_mensajes_no_leidos";
    protected $_primary = array("id_usuario", "remitente");

    public function tieneMensajes($idUsuario) {
        $query = $this->select()->from($this->_name, "(COUNT(*))")
                                ->where("id_usuario = ?", (int)$idUsuario)
                                ->where("remitente = 1");
        return $this->_db->fetchOne($query) > 0;
    }

    public function tieneAlertas($idUsuario) {
        $query = $this->select()->from($this->_name, "(COUNT(*))")
                                ->where("id_usuario = ?", (int)$idUsuario)
                                ->where("remitente = 0");
        return $this->_db->fetchOne($query) > 0;
    }

    public function marcarLeido($idUsuario, $remitente) {
        return $this->delete("id_usuario = ".(int)$idUsuario." AND remitente = ".(int)$remitente);
    }
    
}
