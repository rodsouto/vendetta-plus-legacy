<?php

class Mob_Model_Entrenamiento extends Zend_Db_Table_Abstract {

    protected $_name = "mob_entrenamientos";
    protected $_primary = "id_entrenamiento";
    protected $_cacheEntrenamiento;
    public function incrementar($idUsuario, $entrenamiento) {
        $entrenamiento = lcfirst($entrenamiento);
        $query = "UPDATE {$this->_name} SET $entrenamiento = $entrenamiento + 1 WHERE id_usuario = $idUsuario LIMIT 1";
        $this->_db->query($query);

        $data = $this->fetchAll("id_usuario = $idUsuario", null, 1)->current();
        
        $puntosEnt = Mob_Loader::getEntrenamiento($entrenamiento)->getPuntos();
        Mob_Loader::getModel("Usuarios")->sumarPuntosEnt($data->id_usuario, $puntosEnt);
        return $data->{$entrenamiento};
    }

    public function crearBase($idUsuario) {
        return $this->insert(array("id_usuario" => $idUsuario));
    }

    public function getNivel($idUsuario, $entrenamiento) {
        $data = $this->getByIdUsuario($idUsuario);
        return $data[lcfirst($entrenamiento)];
    }
    
    public function getByIdUsuario($idUsuario) {
      //if (isset($this->_cacheEntrenamiento[$idUsuario])) return $this->_cacheEntrenamiento[$idUsuario];
      
      $query = $this->select()->where("id_usuario = $idUsuario");
      $data = $this->_db->fetchAll($query);
      return $this->_cacheEntrenamiento[$idUsuario] = isset($data[0]) ? $data[0] : $data;  
    }
    
    public function setEntrenamiento($idUsuario, $entrenamiento, $nivel) {
        return $this->update(array(lcfirst($entrenamiento) => $nivel), "id_usuario = " . $idUsuario);
    }
    
    public function getMax($entrenamiento, $idUsuario = null) {
      $query = $this->select()->from(array("e" => $this->_name), $entrenamiento)      
              ->joinLeft(array("u" => "mob_usuarios"), "u.id_usuario = e.id_usuario", array())
              ->where("u.baneado = 0")
              ->order("$entrenamiento DESC")
              ->limit(1)
              ->setIntegrityCheck(false);      
      if ($idUsuario !== null) $query->where("e.id_usuario = ?", $idUsuario);
      
      return $this->_db->fetchOne($query);
    }
    
    public function getPromedio($entrenamiento) {
      $totalEntrenamiento = $this->_db->fetchOne("SELECT SUM($entrenamiento) FROM {$this->_name}");
      
      return round((int)$totalEntrenamiento/Mob_Loader::getModel("Edificio")->getTotalUsuarios()); 
    }
        
}