<?php

class Mob_Model_Guerras extends Zend_Db_Table_Abstract {

    protected $_name = "mob_guerras";
    protected $_primary = "id_guerra";
    
    public function getActualesByFamilia($idFamilia) {
      $query = $this->select()->where("(id_familia_1 = $idFamilia OR id_familia_2 = $idFamilia)")->where("fecha_fin = '0000-00-00 00:00:00'");
      return $this->_db->fetchAll($query);
    }
    
    public function getActuales() {
      $query = $this->select()->where("fecha_fin = '0000-00-00 00:00:00'");
      return $this->_db->fetchAll($query);
    }    
    
    public function estanEnGuerra($idFamilia1, $idFamilia2) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("(id_familia_1 = $idFamilia1 AND id_familia_2 = $idFamilia2) || (id_familia_1 = $idFamilia2 AND id_familia_2 = $idFamilia1)")
                              ->where("fecha_fin = '0000-00-00 00:00:00'");
      return $this->_db->fetchOne($query) != 0;    
    }
    
    public function getIdByFamilias($idFamilia1, $idFamilia2) {
      $query = $this->select()->where("(id_familia_1 = $idFamilia1 AND id_familia_2 = $idFamilia2) || (id_familia_1 = $idFamilia2 AND id_familia_2 = $idFamilia1)")
                              ->where("fecha_fin = '0000-00-00 00:00:00'");
      $data = $this->_db->fetchAll($query);
      return isset($data[0]) ? $data[0]["id_guerra"] : 0;
    }    
     
    public function finalizar($idFamiliaWin, $idFamiliaLose, $empate = false) {
      /*$where = $this->select()
                          ->where("(id_familia_1 = $idFamiliaWin AND id_familia_2 = $idFamiliaLose) OR 
                                  (id_familia_2 = $idFamiliaWin AND id_familia_1 = $idFamiliaLose)")
                          ->where("fecha_fin = '0000-00-00 00:00:00'");*/
                          
      $where = "(id_familia_1 = $idFamiliaWin AND id_familia_2 = $idFamiliaLose) OR 
        (id_familia_2 = $idFamiliaWin AND id_familia_1 = $idFamiliaLose) AND fecha_fin = '0000-00-00 00:00:00'";                          
      return $this->update(array("fecha_fin" => date("Y-m-d H:i:s"), "ganador" => $empate ? 0 : $idFamiliaWin), $where);
    }
    
    public function getTotalFinalizadas($idFamilia) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("id_familia_1 = $idFamilia OR id_familia_2 = $idFamilia")
                              ->where("fecha_fin != '0000-00-00 00:00:00'");
      return $this->_db->fetchOne($query);    
    }
    
    public function getFinalizadas($idFamilia = null) {
      $query = $this->select()->where("fecha_fin != '0000-00-00 00:00:00'");
      if ($idFamilia !== null) $query->where("id_familia_1 = $idFamilia OR id_familia_2 = $idFamilia");
      return $this->_db->fetchAll($query);    
    }
    
    public function darPorPerdidas($idFamilia) {
      foreach ($this->getActualesByFamilia($idFamilia) as $g) {
        $this->finalizar($g["id_familia_1"] == $idFamilia ? $g["id_familia_2"] : $g["id_familia_1"], $idFamilia);
      }  
    }
    
    public function getGuerra($idGuerra) {
      $data = $this->find($idGuerra)->toArray();
      return isset($data[0]) ? $data[0] : array();
    }
    
    public function sumarPerdidas($idGuerra, $ptsPerdAtacante, $idFamiliaAtacante, $ptsPerdDefensor, $idFamiliaDefensor) {
      $dataGuerra = $this->getGuerra($idGuerra);
      
      if ($dataGuerra["id_familia_1"] == $idFamiliaAtacante) {
        $ptosPerd1 = $ptsPerdAtacante;
        $ptosPerd2 = $ptsPerdDefensor;
      } else {
        $ptosPerd2 = $ptsPerdAtacante;
        $ptosPerd1 = $ptsPerdDefensor;
      }
      
      $query = "UPDATE {$this->_name} SET 
          ptos_perd_1 = ptos_perd_1 + $ptosPerd1,
          ptos_perd_2 = ptos_perd_2 + $ptosPerd2 
          WHERE id_guerra = ".(int)$idGuerra." LIMIT 1";
          
      $this->_db->query($query);      
    }
    
    public function getPuntosPerdidos($idGuerra) {
      $data = $this->getGuerra($idGuerra);
      return array("familia_1" => $data["ptos_perd_1"], "familia_2" => $data["ptos_perd_2"]);
    }    
            
}