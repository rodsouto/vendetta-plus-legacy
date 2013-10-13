<?php

class Mob_Model_Familias_Solicitudes extends Zend_Db_Table_Abstract {

    protected $_name = "mob_familias_solicitudes";
    protected $_primary = "id_solicitud";
    
    public function getTotal($idFamilia) {
        $query = $this->select()->from($this->_name, "(COUNT(*))")->where("id_familia = ?", $idFamilia);
        return $this->_db->fetchOne($query);
    }
    
    public function getSolicitudes($idFamilia) {
        return $this->fetchAll("id_familia = ".(int)$idFamilia)->toArray();    
    }
    
    public function getFamiliaSolicitud($idUsuario) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_familia"] : 0;
    }
    
    public function borrarFamilia($idFamilia) {
        return $this->delete("id_familia = ".(int)$idFamilia);
    }
    
    public function getSolicitud($idSolicitud) {
        $data = $this->find($idSolicitud)->toArray();
        return isset($data[0]) ? $data[0] : array();
    }
    
    public function borrarUsuario($idUsuario) {
        return $this->delete("id_usuario = ".(int)$idUsuario);
    }
    
    public function aceptar($idSolicitud) {
        $data = $this->getSolicitud($idSolicitud);
        if (empty($data)) return false;
        Mob_Loader::getModel("Familias_Miembros")->agregarMiembro($data["id_familia"], $data["id_usuario"]);
        $this->borrarUsuario($data["id_usuario"]);
        Mob_Loader::getModel("Mensajes")->aviso($data["id_usuario"], "solicitud_aceptada", 
                    "Ha sido aceptada tu solicitud para entrar a la familia ".
                    Mob_Loader::getModel("Familias")->getNombre($data["id_familia"]));
    }
    
    public function rechazar($idSolicitud) {
        $data = $this->getSolicitud($idSolicitud);
        if (empty($data)) return false;
        $this->borrarUsuario($data["id_usuario"]);
        Mob_Loader::getModel("Mensajes")->aviso($data["id_usuario"], "solicitud_rechazada", 
                    "Ha sido rechazada tu solicitud para entrar a la familia ".
                    Mob_Loader::getModel("Familias")->getNombre($data["id_familia"]));
    }
}