<?php

class Mob_Model_Nombres extends Mob_Db_Table_Abstract {

    protected $_name = "mob_usuarios_nombres";
    protected $_primary = "id_cambio";
    
    public function puedeCambiar($idUsuario) {
      $query = $this->select()->where("id_usuario = ?", (int)$idUsuario)->order("id_cambio DESC")->limit(1);
      $data = $this->_db->fetchAll($query);
      if (empty($data)) return true;
      return strtotime($data[0]["fecha"]) < strtotime("-15 days");
    }
    
    public function fechaProxCambio($idUsuario) {
      $query = $this->select()->where("id_usuario = ?", (int)$idUsuario)->order("id_cambio DESC")->limit(1);
      $data = $this->_db->fetchAll($query);
      if (empty($data)) return 0;
      // el prox cambio es en 15 dias
      $quinceDias = strtotime($data[0]["fecha"]) + 60*60*24*15;
      
      return Mob_Timer::timeFormat($quinceDias-time());     
    }
    
}