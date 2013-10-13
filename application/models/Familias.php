<?php

class Mob_Model_Familias extends Mob_Db_Table_Abstract {

    protected $_name = "mob_familias";
    protected $_primary = "id_familia";
    protected $_queryRanking;
    protected $_cacheFamilia;
    
    public function getQueryRanking() {
      return $this->_queryRanking;
    }
  
     public function getDescripcion($idFamilia) {
        $data = $this->getFamilia($idFamilia);
        return !empty($data) ? $data["descripcion"] : "";
    }

    public function getFamilia($idFamilia) {
        if (isset($this->_cacheFamilia[$idFamilia])) return $this->_cacheFamilia[$idFamilia];
        $data = $this->find($idFamilia)->toArray();
        return $this->_cacheFamilia[$idFamilia] = isset($data[0]) ? $data[0] : array();
    }
    
    public function getEtiqueta($idFamilia) {
        $data = $this->getFamilia($idFamilia);
        return empty($data) ? null : $data["etiqueta"];
    }
    
    public function existe($idFamilia) {
      return $this->getEtiqueta($idFamilia) != null;
    }
    
    public function getNombre($idFamilia) {
        $data = $this->getFamilia($idFamilia);
        return empty($data) ? null : $data["nombre"];
    }
    
    public function getIdByEtiqueta($etiqueta) {
        $data = $this->fetchAll("etiqueta = '$etiqueta'")->toArray();
        return isset($data[0]) ? $data[0]["id_familia"] : 0;
    }

    public function getIdByNombre($nombre) {
        $data = $this->fetchAll("nombre = '$nombre'")->toArray();
        return isset($data[0]) ? $data[0]["id_familia"] : 0;
    }
    
    public function borrar($idFamilia) {
        Mob_Loader::getModel("Familias_Solicitudes")->borrarFamilia($idFamilia);
    
        Mob_Loader::getModel("Familias_Miembros")->borrarFamilia($idFamilia);
        return $this->delete("id_familia = ".(int)$idFamilia);
    }
    
    public function buscar($nombre) {
        $query = $this->select()
        ->where("MATCH (nombre, etiqueta) AGAINST (? IN BOOLEAN MODE)", "*".$nombre."*")
        ->limit(200); 
        return $this->fetchAll($query)->toArray();       
    }
    
    public function getRanking($order = "pts") {
        $orders = array("me" => "miembros", "pts" => "puntos", "ptsm" => "promedio");
        if (empty($order)) $order = "pts";
        
        $page = Zend_Controller_Front::getInstance()->getRequest()->getParam("page", 1);
        
        $query = $this->select()->from(array("f" => $this->_name), array("f.id_familia", "f.nombre", "f.etiqueta"))
        ->setIntegrityCheck(false)
        ->joinLeft(array("fm" => "mob_familias_miembros"), "f.id_familia = fm.id_familia", array())
        ->joinLeft(array("u" => "mob_usuarios"), "u.id_usuario = fm.id_usuario", array("miembros" => "(COUNT(u.id_usuario))", 
                  "puntos" => "(SUM(u.puntos_edificios + u.puntos_entrenamientos + u.puntos_tropas))",
                  "promedio" => "(if(COUNT(u.id_usuario) > 2, SUM(u.puntos_edificios + u.puntos_entrenamientos + u.puntos_tropas)/COUNT(u.id_usuario), 0))")) 
        ->where("u.id_usuario IS NOT NULL")
          ->group("fm.id_familia")
          ->order("{$orders[$order]} DESC")
          ->limitPage($page, 100);

        $this->_queryRanking = $query;
        
        $cacheId = "getRankingFamilias_".$orders[$order]."_".$page;
        if(($result = $this->_cache->load($cacheId)) === false) {
          $result = $this->_db->fetchAll($query);
          $this->_cache->save($result, $cacheId, array("rankingFamilias"));
        }
                
        return $result;
    }
    
    public function getHtmlEstado($idUsuario, $capo = false) {
      /*
      cuando estan on line de 0 a 5 minutos el color es verde brillante, 
      de 5 a 10 es verde oscuro,
      de 10 a 20 es naranja, 
      y de 20 en adelante es rojo.
      de 30 en adelante directamente dice desconectado
      */
      $lastOnline = Mob_Loader::getModel("Usuarios")->getLastOnline($idUsuario);
           
      if ($lastOnline == "0000-00-00 00:00:00") return "<span style='color: red'>Desconectado</span>";
       
      $diff = time() - strtotime($lastOnline);
      
      $color = "red";
      if ($diff < 300) $color = "lime";
      elseif ($diff < 600) $color = "green";
      elseif ($diff < 1200) $color = "orange";
      
      $txt = $color == "red" ? "Desconectado" : "Conectado";
      
      return "<span style='color: $color'>".($capo ? Mob_Timer::timeFormat($diff) : $txt)."</span>";
    }
    
    public function getFullName($idFamilia) {
      return $this->getNombre($idFamilia)." [".$this->getEtiqueta($idFamilia)."]";
    }    

}