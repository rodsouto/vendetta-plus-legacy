<?php

class Mob_Model_Familias_Mensajes extends Mob_Db_Table_Abstract {

    protected $_name = "mob_familias_mensajes";
    protected $_primary = "id_mensaje";
    
    public function enviar($idUsuario, $idFamilia, $mensaje) {
        $data = array("id_usuario" => $idUsuario, "id_familia" => $idFamilia, 
                        "mensaje" => $mensaje, "fecha" => date("Y-m-d H:i:s"));
        $this->_cache->remove('getByFamilia'.$idFamilia);                        
        return $this->insert($data);
    }
    
    public function getByFamilia($idFamilia) {
        $cacheId = 'getByFamilia'.$idFamilia;
        if(($data = $this->_cache->load($cacheId)) === false) {
          $query = $this->select()->where("id_familia = ?", (int)$idFamilia)->order("id_mensaje DESC")->limit(50);
          $data = $this->_db->fetchAll($query);
          $this->_cache->save($data, $cacheId);
        }
        return $data;
    }

}