<?php

class Mob_Model_Tropa extends Zend_Db_Table_Abstract {

    protected $_name = "mob_tropas";
    protected $_primary = "id_tropa";
    
    public function getByEdificio($idEdificio) {
        $query = $this->select()->where("id_edificio = ?", $idEdificio)->limit(1);
        return $this->_db->fetchRow($query);
    }
    
    public function getCantidad($tropa, $idEdificio) {
        $query = $this->select()->from($this->_name, lcfirst($tropa))
                                ->where("id_edificio = ?", $idEdificio)
                                ->limit(1);
                                
        return $this->_db->fetchOne($query);
    }
    
    public function crearBase($idEdificio) {
        return $this->insert(array("id_edificio" => $idEdificio));
    }
    
    public function restarTropas($idEdificio, array $tropas) {
        $data = array();
        foreach ($tropas as $tropa => $cantidad) {
            $tropa = lcfirst($tropa);
            $data[] = "$tropa = $tropa - ".(int)$cantidad;
        } 
        $query = "UPDATE {$this->_name} SET ".implode(", ", $data)." WHERE id_edificio = $idEdificio LIMIT 1";
        $this->_db->query($query);
    }
    
    public function sumarTropas($idEdificio, array $tropas) {
        $data = array();
        foreach ($tropas as $tropa => $cantidad) {
            $tropa = lcfirst($tropa);
            $data[] = "$tropa = $tropa + ".(int)$cantidad;
        }
        $query = "UPDATE {$this->_name} SET ".implode(", ", $data)." WHERE id_edificio = $idEdificio LIMIT 1";
        $this->_db->query($query);
    }
    
    public function setTropa($idEdificio, $tropa, $cantidad) {
        $query = "UPDATE {$this->_name} SET $tropa = $cantidad WHERE id_edificio = $idEdificio LIMIT 1";
        $this->_db->query($query);        
    }
    
    public function getTotalTropasByTipo($idUsuario, $tipo) {

        $namespace = new Zend_Session_Namespace("totalTropas_".(int)$idUsuario."_".$tipo);
        
        if (!empty($namespace->data)) return $namespace->data;

        $fields = array();

        foreach (Mob_Data::getTropas($tipo) as $t) {
            $fields[$t] = "SUM(t.$t) as $t";
        }
    
        $query = "SELECT ".implode(", ", $fields)." FROM mob_edificios e
        LEFT JOIN mob_tropas t ON t.id_edificio = e.id_edificio 
        WHERE e.id_usuario = ".(int)$idUsuario;
        
        $data = $this->_db->fetchAll($query);
    
        if (empty($data)) return array();
        
        arsort($data[0]);
        
        return $namespace->data = $data[0];
    }
        
}