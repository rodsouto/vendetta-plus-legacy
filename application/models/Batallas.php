<?php

class Mob_Model_Batallas extends Mob_Db_Table_Abstract {

    protected $_name = "mob_batallas";
    protected $_primary = "id_batalla";
    
    public function participo($idUsuario, $idBatalla) {
        $query = $this->select()->where("id_batalla = ?", $idBatalla)
            ->where("atacante = $idUsuario OR defensor = $idUsuario")->limit(1);
        return $this->fetchAll($query)->toArray() != array();
    }
    
    /*
    @param $type: tipo de ranking
    @param $val: valores extra a pasar segun el tipo de ranking
    */
    public function getBatallas($type = null, $val = null) {
        $query = $this->select()->where("pts_perd_atacante != 0 OR pts_perd_defensor != 0")
                                ->where("(pts_perd_atacante+pts_perd_defensor) > ?", Mob_Loader::getModel("Usuarios")->getPromedioPuntos()/10)
                                ->limit(100);
        
        if ($val["rango"]) {
          switch($val["rango"]) {
            case 2: $time = date("Y-m-d", strtotime("-1 week"));break;
            case 3: $time = date("Y-m-d", strtotime("-1 month"));break;
            case 4: $time = date("Y-m-d", strtotime("-1 year"));break;
          }
        }
        
        if ($type == "total") {
          $query->order("(pts_perd_atacante+pts_perd_defensor) DESC");
          if (!empty($time)) $query->where("fecha > ?", $time);
        } elseif ($type == "topUsuarios") {
          $query->from($this->_name, array(
                          "usuario" => $val["tipo"], 
                          "id_batalla", 
                          "pts_perdidos" => "(SUM(pts_perd_".$val["tipo"]."))", 
                          "pts_eliminados" => "(SUM(pts_perd_".($val["tipo"] == "atacante" ? "defensor" : "atacante")."))"));
          
          if ($val["tipo"] == "atacante") {
            $query->group("atacante")->order("(SUM(pts_perd_defensor)) DESC");
          } else {
            $query->group("defensor")->order("(SUM(pts_perd_atacante)) DESC");
          }
           
          $query->where("fecha > ?", $time);
        } else {
          $query->order("fecha DESC")->order("id_batalla DESC");
        }                               
           
        $cacheId = "getBatallas".md5($query->__toString());
        if(($result = $this->_cache->load($cacheId)) === false) {
          $result = $this->_db->fetchAll($query);
          $this->_cache->save($result, $cacheId);
        }
        
        return $result;
    }
    
    public function getGranjeos($type) {
    
        switch($type) {
          case 8: $time = date("Y-m-d", strtotime("-1 week"));break;
          case 9: $time = date("Y-m-d", strtotime("-1 month"));break;
          case 10: $time = date("Y-m-d", strtotime("-1 year"));break;
        }
    
        $query = $this->select()->from($this->_name, array(
                            "usuario" => "atacante", 
                            "id_batalla", 
                            "arm" => "(SUM(recursos_arm))",
                            "mun" => "(SUM(recursos_mun))",
                            "dol" => "(SUM(recursos_dol))",
                            "total" => "(COUNT(*))"
                            )
                          )->where("fecha > ?", $time)
                            ->where("recursos_arm != 0 OR recursos_mun != 0 OR recursos_dol != 0")
                            ->group("atacante")
                            ->order("(SUM(recursos_arm)+SUM(recursos_mun)+SUM(recursos_dol)) DESC")
                            ->limit(100);                               
                            
        $cacheId = "getGranjeos".md5($query->__toString());
        if(($result = $this->_cache->load($cacheId)) === false) {
          $result = $this->_db->fetchAll($query);
          $this->_cache->save($result, $cacheId);
        }
        
        return $result;
    }
    
    public function getInfoAtaquesGuerra($idGuerra, $strtotime = null) {
      $query = $this->select()->from($this->_name, array("id_familia_a", "total" => "(COUNT(*))"))->where("id_guerra = ?", (int)$idGuerra)->group("id_familia_a");
      
      if ($strtotime != null) {
        $query->where("fecha > ?", date("Y-m-d H:i:s", strtotime($strtotime)));
      }
      
      $infoAtaques = array('total' => 0, 'familia_1' => 0, 'familia_2' => 0);
      $dataGuerra = Mob_Loader::getModel("Guerras")->getGuerra($idGuerra);
      $total = 0;
      foreach ($this->_db->fetchAll($query) as $a) {
        $total += $a["total"];
        $infoAtaques[$a["id_familia_a"] == $dataGuerra["id_familia_1"] ? "familia_1" : "familia_2"] = $a["total"];
      }
      $infoAtaques["total"] = $total;
      
      return $infoAtaques; 
    }            
    
}