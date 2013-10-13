<?php

class Mob_Model_Familias_Miembros extends Mob_Db_Table_Abstract {

    protected $_name = "mob_familias_miembros";
    protected $_primary = "id_miembro";
    
    public function tieneFamilia($idUsuario) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)->limit(1);
        return $this->_db->fetchAll($query) != array();
    }
    
    public function borrarFamilia($idFamilia) {
        return $this->delete("id_familia = ".(int)$idFamilia);
    }
    
    public function getIdFamilia($idUsuario) {
        $query = $this->select()->where("id_usuario = ?", $idUsuario)->limit(1);
        $data = $this->_db->fetchAll($query);
        return isset($data[0]) ? $data[0]["id_familia"] : 0;
    }
    
    public function getMiembros($idFamilia) {
        return $this->fetchAll("id_familia = ".(int)$idFamilia)->toArray();
    }
    
    public function getMiembrosOnline($idFamilia) {
        $query = "SELECT * FROM $this->_name m 
        LEFT JOIN mob_usuarios u ON u.id_usuario = m.id_usuario 
        WHERE m.id_familia = ".(int)$idFamilia." AND u.last_online > '".date("Y-m-d H:i:s", strtotime("-10 minutes"))."'";
        
        return $this->_db->fetchAll($query);
    }
    
    public function getPuntos($idFamilia) {                
        $query = $this->_db->select()->from($this->_name, array())
                ->joinLeft("mob_usuarios", "mob_usuarios.id_usuario = mob_familias_miembros.id_usuario", 
                        array("(SUM(puntos_edificios+puntos_entrenamientos+puntos_tropas))"))
                ->where("id_familia = ?", $idFamilia);
                
        return $this->_db->fetchOne($query);
    }
    
    public function getTotalMiembros($idFamilia) {
        $query = $this->select()->from($this->_name, "(COUNT(*))")->where("id_familia = ?", $idFamilia);
        return $this->_db->fetchOne($query);
    }
    
    public function getRango($idFamilia, $idUsuario) {
        $query = $this->select()->where("id_familia = ?", $idFamilia)->where("id_usuario = ?", $idUsuario)->limit(1);
        $data = $this->_db->fetchAll($query);

        if (empty($data)) return '-';
        
        return Mob_Loader::getModel("Familias_Rangos")->getRangoById($data[0]["id_rango"]);
    }

    public function getIdRango($idFamilia, $idUsuario) {
        $query = $this->select()->where("id_familia = ?", (int)$idFamilia)->where("id_usuario = ?", (int)$idUsuario)->limit(1);
        $data = $this->_db->fetchAll($query);

        if (empty($data)) return 0;
        
        return $data[0]["id_rango"];
    }
    
    public function setRango($idMiembro, $idRango) {
        return $this->update(array("id_rango" => (int)$idRango), "id_miembro = ".(int)$idMiembro);
    }
    
    public function esCapo($idUsuario, $idFamilia) {
        $query = $this->select()->where("id_familia = ?", (int)$idFamilia)->where("id_usuario = ?", $idUsuario)->limit(1);
        $data = $this->_db->fetchAll($query);
        
        if (empty($data)) return false;
        
        return $data[0]["id_rango"] == Mob_Loader::getModel("Familias_Rangos")->getIdCapo($idFamilia);
    }
    
    public function esCapoSubCapo($idUsuario, $idFamilia) {
        $query = $this->select()->where("id_familia = ?", (int)$idFamilia)->where("id_usuario = ?", $idUsuario)->limit(1);
        $data = $this->_db->fetchAll($query);
        
        if (empty($data)) return false;
        
        return $data[0]["id_rango"] == Mob_Loader::getModel("Familias_Rangos")->getIdCapo($idFamilia)
                  || $data[0]["id_rango"] == Mob_Loader::getModel("Familias_Rangos")->getIdSubCapo($idFamilia);
    }
    
    public function getIdCapo($idFamilia) {
      $idCapo = Mob_Loader::getModel("Familias_Rangos")->getIdCapo($idFamilia);
      
      $query = $this->select()->where("id_familia = ?", $idFamilia)->where("id_rango = ?", $idCapo)->limit(1);
      $data = $this->_db->fetchAll($query);

      if (empty($data)) return 0;
        
      return $data[0]["id_usuario"];
    }
    
    public function agregarMiembro($idFamilia, $idUsuario, $rango = "miembro") {
        
        if (!is_numeric($rango)) {
            if ($rango == "miembro") {
                $rango = Mob_Loader::getModel("Familias_Rangos")->getIdMiembro($idFamilia);
            } elseif ($rango == "capo") {
                $rango = Mob_Loader::getModel("Familias_Rangos")->getIdCapo($idFamilia);
            }
        }
    
        return $this->insert(array("id_familia" => $idFamilia, "id_usuario" => $idUsuario, "id_rango" => $rango));
    }
    
    public function abandonarFlia($idUsuario, $idFamilia = 0) {
        $where = "id_usuario = ".(int)$idUsuario;
        if (!empty($idFamilia)) $where .= " AND id_familia = $idFamilia"; 
        return $this->delete($where);
    }
    
    public function getListadoMiembros($idFamilia, $order = null) {
      $cacheId = "getListadoMiembros_".$idFamilia."_".$order;
      
      if(($result = $this->_cache->load($cacheId)) === false) {
        $orders = array("name" => "u.usuario", "pos" => "m.id_rango", "pts" => "puntos DESC", "ed" => "edificios DESC", "st" => "u.last_online DESC");
        $query = $this->select()
        ->setIntegrityCheck(false)
        ->from(array("m" => $this->_name), array("id_usuario", "id_rango", "edificios" => "(SELECT COUNT(*) FROM mob_edificios WHERE id_usuario = m.id_usuario)"))
        ->joinLeft(array("u" => "mob_usuarios"), "u.id_usuario = m.id_usuario", 
              array("usuario", "last_online", "puntos" => "(SUM(u.puntos_edificios + u.puntos_entrenamientos + u.puntos_tropas)/COUNT(u.id_usuario))"))
        ->joinLeft(array("r" => "mob_familias_rangos"), "r.id_rango = m.id_rango", array("rango" => "nombre"))
        ->where("m.id_familia = ?", (int)$idFamilia)
        ->group("u.id_usuario")
        ->order(isset($orders[$order]) ? $orders[$order] : "puntos DESC");
        
        $result = $this->_db->fetchAll($query);
        $this->_cache->save($result, $cacheId, array("getListadoMiembros".$idFamilia));        
      }
      
      return $result;
    }
    
    public function getIdByIdUsuario($idUsuario) {
      $data = $this->fetchAll("id_usuario = ".(int)$idUsuario);
      return isset($data[0]) ? $data[0]["id_miembro"] : 0;
    }

}