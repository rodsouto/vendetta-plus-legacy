<?php

class Mob_Model_Usuarios extends Mob_Db_Table_Abstract {

  protected $_name = "mob_usuarios";
  protected $_primary = "id_usuario";
  protected $_queryRanking;
  
  public function getQueryRanking() {
    return $this->_queryRanking;
  }
  
    public function existe($nombre) {
        $query = $this->select()->where("usuario = ?", $nombre)->limit(1);
        return $this->fetchAll($query)->toArray() != array();
    }
    
    public function getIdByNombre($nombre) {
        $query = $this->select()->where("usuario = ?", $nombre)->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_usuario"] : 0;
    }
    
    public function getIdByLogin($nombre) {
        $query = $this->select()->where("login = ?", $nombre)->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_usuario"] : 0;
    }    

    public function getIdByEmail($email) {
        $query = $this->select()->where("email = ?", $email)->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_usuario"] : 0;
    }

    public function getUsuario($idUsuario) {
        $data = $this->find($idUsuario)->toArray();
        return isset($data[0]) ? $data[0]["usuario"] : 0;
    }
    
    public function getLogin($idUsuario) {
        $data = $this->find($idUsuario)->toArray();
        return isset($data[0]) ? $data[0]["login"] : 0;
    }    
    
    public function getIdioma($idUsuario) {
        $data = $this->find($idUsuario)->toArray();
        return isset($data[0]) ? $data[0]["idioma"] : 0;
    }    
    
    public function getPassword($idUsuario) {
        $data = $this->find($idUsuario)->toArray();
        return isset($data[0]) ? $data[0]["pass"] : 0;
    }
    
    public function getEmail($idUsuario) {
        $data = $this->find($idUsuario)->toArray();
        return isset($data[0]) ? $data[0]["email"] : 0;
    }
    
    public function emailExists($email) {
      $query = $this->select()->where("email = ?", $email)->limit(1);
      return $this->_db->fetchAll($query) != array();
    }

    public function getRanking($order = "to", $page = 1) {
        $orders = array("en" => 3, "ed" => 4, 
                            "tr" => 2, "to" => 1);
        
        if (!isset($orders[$order])) $order = "to";

        if ($page < 1) $page = 1;
        $min = ($page-1)*100+1;
        $max = ($page-1)*100+100;
        
        $fields = array("id_usuario", 
                        "usuario", 
                        "puntos_edificios", 
                        "puntos_entrenamientos", 
                        "puntos_tropas",
                        "baneado", 
                        "total" => "(puntos_edificios+puntos_entrenamientos+puntos_tropas)",
                        "(SELECT COUNT(*) FROM mob_edificios e WHERE e.id_usuario = {$this->_name}.id_usuario) as total_edificios",
                        "id_familia" => "(SELECT id_familia FROM mob_familias_miembros WHERE id_usuario = {$this->_name}.id_usuario LIMIT 1)");
        
        $query = Mob_Loader::getModel("Ranking")->select()->from("mob_ranking", "*")->setIntegrityCheck(false)
        ->joinLeft("mob_usuarios", "mob_usuarios.id_usuario = mob_ranking.id_usuario", $fields)
        ->where("tipo = ?", $orders[$order])
        ->where("rank >= $min")->where("rank <= $max")
        ->order("id_ranking ASC");
        
        $this->_queryRanking = $query;
        
        $cacheId = "getRankingUsuarios_".$orders[$order]."_".$page;
        
        if(($result = $this->_cache->load($cacheId)) === false) {
          $result = $this->_db->fetchAll($query);
          $this->_cache->save($result, $cacheId, array("rankingUsuarios"));
        }
        
        return $result;   
    }
    
    public function buscar($nombre) {
        $query = $this->select()->from($this->_name, 
                                            array("id_usuario", 
                                            "usuario",  
                                            "total" => "(ROUND(puntos_edificios+puntos_entrenamientos+puntos_tropas))"))
                                        ->order("total DESC")
                                        ->where("MATCH (usuario) AGAINST (? IN BOOLEAN MODE)", "*".$nombre."*")
                                        ->limit(200);

        return $this->fetchAll($query)->toArray();       
    }
    
    public function estaBaneado($valor, $porIdUsuario = true) {
      $query = $this->select()->from($this->_name, "baneado")->limit(1);
      if ($porIdUsuario) {
        $query->where("id_usuario = ".(int)$valor);
      } else {
        $query->where("usuario = ?", $valor);
      }
      return $this->_db->fetchOne($query) == 1;
    }
    
    public function getPuntos($idUsuario) {
        $query = $this->select()->from($this->_name, 
                                            array("total" => "(puntos_edificios+puntos_entrenamientos+puntos_tropas)"))
                                        ->where("id_usuario = ?", $idUsuario);
        return $this->_db->fetchOne($query);
    }
    
    public function sumarPuntosEnt($idUsuario, $puntos) {
        $query = "UPDATE {$this->_name} SET puntos_entrenamientos = puntos_entrenamientos + $puntos WHERE id_usuario = $idUsuario LIMIT 1";
        $this->_db->query($query);    
    }
    
    public function sumarPuntosEdi($idUsuario, $puntos) {
        $query = "UPDATE {$this->_name} SET puntos_edificios = puntos_edificios + $puntos WHERE id_usuario = $idUsuario LIMIT 1";
        $this->_db->query($query);    
    }
    
    public function sumarPuntosTropa($idUsuario, $puntos) {
        $query = "UPDATE {$this->_name} SET puntos_tropas = puntos_tropas + $puntos WHERE id_usuario = $idUsuario LIMIT 1";
        $this->_db->query($query);
    }
    
    public function restarPuntosTropa($idUsuario, $puntos) {
        $query = "UPDATE {$this->_name} SET puntos_tropas = puntos_tropas - $puntos WHERE id_usuario = $idUsuario LIMIT 1";
        $this->_db->query($query);
    }    
    
    public function insert(array $data) {
        $idUsuario = parent::insert($data);
        Mob_Loader::getModel("Entrenamiento")->crearBase($idUsuario);
        return $idUsuario;
    }
    
    public function getLastOnline($idUsuario) {
      $query = $this->select()->from($this->_name, "last_online")->where("id_usuario = ?", (int)$idUsuario);
      return $this->_db->fetchOne($query);    
    }
    
    public function getEstadisticas() {
      $query = $this->select()->from($this->_name, array("id_usuario", "puntos_edificios", "puntos_entrenamientos", "puntos_tropas"));
      return $this->_db->fetchAll($query);
    } 
    
    public function getPromedioPuntos() {
      return round($this->_db->fetchOne("SELECT SUM(puntos_edificios+puntos_tropas+puntos_entrenamientos)/COUNT(*) FROM mob_usuarios"));
    }
    
    public function getPosicionRanking($idUsuario) {
        return Mob_Loader::getModel("Ranking")->getRanking($idUsuario);
        $cacheId = "getPosicionRanking_".$idUsuario;
        if(($result = $this->_cache->load($cacheId)) === false || 1) {
          $misPuntos = $this->select()->from($this->_name, array("total" => "(puntos_edificios+puntos_entrenamientos+puntos_tropas)"))
                                      ->where("id_usuario = ?", $idUsuario)->limit(1);
          $query = $this->select()->from($this->_name, "(COUNT(*))")
          ->where("(puntos_edificios+puntos_entrenamientos+puntos_tropas) > (?)", new Zend_Db_Expr($misPuntos->__toString()));
          $result = $this->_db->fetchOne($query)+1;
          $this->_cache->save($result, $cacheId);
        }
        
        return $result;
    }
    
    public function getFullName($idUsuario) {
      $idFamilia = (int)Mob_Loader::getModel("Familias_Miembros")->getIdFamilia((int)$idUsuario);
      $return = $this->getUsuario((int)$idUsuario);
      if (!empty($idFamilia)) $return .= " [".Mob_Loader::getModel("Familias")->getEtiqueta($idFamilia)."]";
      return $return;
    }
    
    public function getBaneados() {
      $query = "SELECT u.*, b.fecha, b.fecha_fin, b.motivo FROM mob_usuarios u LEFT JOIN mob_baneos b ON b.id_usuario = u.id_usuario WHERE u.baneado = 1 ORDER BY b.fecha DESC";
      return $this->_db->fetchAll($query);    
    }
}                                   