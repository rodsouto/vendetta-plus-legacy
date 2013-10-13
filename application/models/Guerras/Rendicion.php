<?php

class Mob_Model_Guerras_Rendicion extends Zend_Db_Table_Abstract {

    protected $_name = "mob_guerras_rendiciones";
    protected $_primary = "id_rendicion";
    
    public function envioRendicion($idFamilia1, $idFamilia2) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("id_familia_1 = $idFamilia1 AND id_familia_2 = $idFamilia2 AND type = 0");
      return $this->_db->fetchOne($query) != 0;        
    }
    
    public function envioEmpate($idFamilia1, $idFamilia2) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("id_familia_1 = $idFamilia1 AND id_familia_2 = $idFamilia2 AND  type = 1");
      return $this->_db->fetchOne($query) != 0;        
    }    
    
    public function tienePendientes($idFamilia2) {
      $query = $this->select()->from($this->_name, "(COUNT(*))")
                              ->where("id_familia_2 = $idFamilia2");
      return $this->_db->fetchOne($query) != 0;
    } 
    
    public function getPendientes($idFamilia2) {
      $query = $this->select()->where("id_familia_2 = $idFamilia2");
      return $this->_db->fetchAll($query);
    } 
    
    public function getRendicion($idFamilia1, $idFamilia2) {
      echo $query = $this->select()->where("id_familia_1 = $idFamilia1 AND id_familia_2 = $idFamilia2")->limit(1)->order("id_rendicion DESC");
      return $this->_db->fetchRow($query);
    }
    
    // rechazar/cancelar rendiciones o solicitudes de empate
    public function rechazar($idFamilia1, $idFamilia2) {
      return $this->delete("id_familia_1 = $idFamilia1 AND id_familia_2 = $idFamilia2");
    } 
    
    public function aceptar($idFamiliaWin, $idFamiliaLose) {
    
      $rendicion = Mob_Loader::getModel("Guerras_Rendicion")->getRendicion($idFamiliaWin, $idFamiliaLose);
      if (empty($rendicion)) $rendicion = Mob_Loader::getModel("Guerras_Rendicion")->getRendicion($idFamiliaLose, $idFamiliaWin);
      
      $this->delete("(id_familia_1 = $idFamiliaWin AND id_familia_2 = $idFamiliaLose) OR (id_familia_1 = $idFamiliaLose AND id_familia_2 = $idFamiliaWin)");
      return Mob_Loader::getModel("Guerras")->finalizar($idFamiliaWin, $idFamiliaLose, $rendicion["type"] == 1);
    }                   
}