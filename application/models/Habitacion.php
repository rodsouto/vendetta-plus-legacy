<?php

class Mob_Model_Habitacion extends Zend_Db_Table_Abstract {

    protected $_name = "mob_habitaciones";
    protected $_primary = "id_habitacion";
    
    protected $_cacheEdificios = array();
    
    public function crearBase($idUsuario, $idEdificio) {
        return $this->insert(array("id_usuario" => $idUsuario, "id_edificio" => $idEdificio, Mob_Server::getNameHabTiempo() => 1));
    }
    
    public function getAlmacenamiento($idEdificio) {
        $data = $this->getByIdEdificio($idEdificio);
        
        return array(
            "arm" => $data[Mob_Server::getDeposito(1)]*150000+10000,
            "mun" => $data[Mob_Server::getDeposito(2)]*150000+10000,
            "dol" => $data[Mob_Server::getDeposito(3)]*150000+10000,
            "alc" => $data[Mob_Server::getDeposito(4)]*150000+10000
        );
    }
    
    public function incrementar($idEdificio, $habitacion) {
        $habitacion = lcfirst($habitacion);
        $query = "UPDATE {$this->_name} SET $habitacion = $habitacion + 1 WHERE id_edificio = $idEdificio LIMIT 1";
        $this->_db->query($query);

        $data = $this->fetchAll("id_edificio = $idEdificio", null, 1)->current();

        $puntosHab = Mob_Loader::getHabitacion($habitacion)->getPuntos();
        Mob_Loader::getModel("Edificio")->sumarPuntos($idEdificio, $puntosHab);
        Mob_Loader::getModel("Usuarios")->sumarPuntosEdi($data["id_usuario"], $puntosHab);
        return $data->{$habitacion};
    }
    
    public function getByIdEdificio($idEdificio) {
        /*if (isset($this->_cacheEdificios[$idEdificio])) {
          return $this->_cacheEdificios[$idEdificio];
        }*/
                           
        $query = $this->select()->where("id_edificio = ?", $idEdificio)->limit(1);
        $data = $this->_db->fetchAll($query);
        $this->_cacheEdificios[$idEdificio] = isset($data[0]) ? $data[0] : array();
        return $this->_cacheEdificios[$idEdificio];
    }
    
    public function getNivel($idEdificio, $habitacion) {
        $data = $this->getByIdEdificio($idEdificio);
        return $data[$habitacion];
    }

    public function setHabitacion($idEdificio, $habitacion, $nivel) {
        return $this->update(array(lcfirst($habitacion) => $nivel), "id_edificio = " . $idEdificio);
    }
    
    public function getIdEdificioPrincipal($idUsuario) {
      $query = "SELECT id_edificio FROM mob_habitaciones WHERE id_usuario = $idUsuario ORDER BY escuela DESC LIMIT 1";
      return $this->_db->fetchOne($query);
    }
    
    public function getMax($habitacion, $idUsuario = null) {
      $query = $this->select()->from(array("h" => $this->_name), $habitacion)
              ->joinLeft(array("u" => "mob_usuarios"), "u.id_usuario = h.id_usuario", array())
              ->where("u.baneado = 0")
              ->order("$habitacion DESC")
              ->limit(1)
              ->setIntegrityCheck(false);
      if ($idUsuario !== null) $query->where("h.id_usuario = ?", $idUsuario);
      
      return $this->_db->fetchOne($query);
    }
    
    public function getPromedio($habitacion) {
      $totalHabitacion = $this->_db->fetchOne("SELECT SUM($habitacion) FROM {$this->_name} h LEFT JOIN mob_usuarios u ON u.id_usuario = h.id_usuario WHERE u.baneado = 0");
      $totalHabitaciones = $this->_db->fetchOne("SELECT COUNT(*) FROM {$this->_name} h LEFT JOIN mob_usuarios u ON u.id_usuario = h.id_usuario WHERE u.baneado = 0");
      return round((int)$totalHabitacion/$totalHabitaciones); 
    }
    
    public function getPromedioMax($habitacion) {
      $query1 = $this->select()->setIntegrityCheck(false)
                                ->from(array("h" => $this->_name), $habitacion)
                                ->where("h.id_usuario = u.id_usuario")
                                ->order("$habitacion DESC")->limit(1);
  
      $page = 1;
      $count = 100;                                          
      $query2 = Mob_Loader::getModel("Usuarios")->select()->setIntegrityCheck(false)
            ->from(array("u" => "mob_usuarios"), "(".$query1->__toString().") as max")
            ->where("baneado = 0")->limitPage($page, $count);
      
      $sum = 0;
      $total = 0;      
      while (($data = $this->_db->fetchAll($query2)) != array()) {
        foreach ($data as $d) {
          if ($d["max"] == 0) continue;
          $sum += (isset($d["max"]) ? $d["max"] : 0);
          $total++;
          $page++;
        }
        $query2->limitPage($page, $count);
      }   
      return round($sum/$total);
    }    
        
}