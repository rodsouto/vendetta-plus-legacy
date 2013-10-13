<?php
/*
CREATE TABLE  `mob_vacaciones` (
`id_vacacion` INT NOT NULL AUTO_INCREMENT PRIMARY KEY ,
`id_usuario` INT NOT NULL ,
`fecha_inicio` DATETIME NOT NULL ,
`fecha_fin` DATETIME NOT NULL
INDEX (  `id_usuario` )
) ENGINE = MYISAM ;
*/
class Mob_Model_Vacaciones extends Mob_Db_Table_Abstract {

    protected $_name = "mob_vacaciones";
    protected $_primary = "id_vacacion";
    protected $_duracionVacaciones = 15;
    protected $_intervaloVacaciones = 7;
    
    public function getDiasIntervalo() {
        return $this->_intervaloVacaciones;
    }
    
    public function getDiasDuracion() {
        return $this->_duracionVacaciones;
    }
    
    public function estaDeVacaciones($idUsuario) {
        $query = $this->select()->from($this->_name, array("fecha_inicio", "fecha_fin"))
                                    ->where("id_usuario = ?", (int)$idUsuario)
                                    ->order("id_vacacion DESC")->limit(1);
                                    
        $data = $this->_db->fetchRow($query);
        
        if (!$data) return false;
        
        // si fecha_fin esta seteado, no esta de vacaciones
        if ($data["fecha_fin"] != "0000-00-00 00:00:00") return false;
        
        // esta de vacaciones si fecha_inicio + duracion > time()
        return strtotime($data["fecha_inicio"]) + 60*60*24*$this->_duracionVacaciones > time();
    }
    
    public function getUltima($idUsuario) {
        $query = $this->select()->where("id_usuario = ?", (int)$idUsuario)->order("id_vacacion DESC")->limit(1);
        $data = $this->_db->fetchRow($query);
        return $data ? $data : array();
    }
    
    public function puedeActivar($idUsuario) {
        $data = $this->getUltima($idUsuario);
    
        // si nunca se puso en vacaciones
        if (empty($data)) return true;
    
        if ($this->estaDeVacaciones($idUsuario)) return false;
        
        return strtotime($data["fecha_fin"])+$this->_intervaloVacaciones*60*60*24 < time();        
    }
    
    public function updateLastIfRequired($idUsuario) {
        $ultima = $this->getUltima($idUsuario);
        
        if (!$ultima) return false;
        
        $hayQueActualizar = !$this->estaDeVacaciones($idUsuario) && $ultima["fecha_fin"] == "0000-00-00 00:00:00";
        
        if ($hayQueActualizar) {
            $this->update(array(
                                "fecha_fin" => date("Y-m-d H:i:s", strtotime($ultima["fecha_inicio"]) + 60*60*24*$this->_duracionVacaciones)
                                ),
                                "id_vacacion = ".$ultima["id_vacacion"]);
        }
    }

        
}