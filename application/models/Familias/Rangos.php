<?php

/*
tipo: 0 es Capo, 1 es Subcapo, 2 es Miembro, 4 es un rango creado por la familia
*/

class Mob_Model_Familias_Rangos extends Zend_Db_Table_Abstract {

    protected $_name = "mob_familias_rangos";
    protected $_primary = "id_rango";
    protected $_cacheRangos;
    
    public function getDataRangoById($idRango) {
      if (isset($this->_cacheRangos[$idRango])) return $this->_cacheRangos[$idRango]; 
      $data = $this->find($idRango)->toArray();
      return $this->_cacheRangos[$idRango] = $data;
    }
    
    public function getRangoById($idRango) {
        $data = $this->getDataRangoById($idRango);

        if ($data[0]["tipo"] == 0 || $data[0]["tipo"] == 1) {
          return Zend_Registry::get("Zend_Translate")->_("rangoFamilia".$data[0]["tipo"]);
        }
        return isset($data[0]) ? $data[0]["nombre"] : "-";
    }
    
    public function crearRango($idFamilia, $nombre, $tipo = 4) {
        $insert = array("id_familia" => $idFamilia, "nombre" => $nombre, "tipo" => $tipo);
        
        if ($tipo == 0 || $tipo == 1) {
            $permisos = array("leer_mensaje", "escribir_mensaje", "borrar_mensaje", 
                            "aceptar_miembro", "enviar_circular", "recibir_circular");
            foreach ($permisos as $p) $insert[$p] = 1;
        }
        return $this->insert($insert);
    }
    
    public function crearRangosBasicos($idFamilia) {
        return $this->crearRango($idFamilia, "Capo", 0) &&
                  $this->crearRango($idFamilia, "SubCapo", 1) &&
                  $this->crearRango($idFamilia, "Miembro", 2);
    }
    
    public function getIdCapo($idFamilia) {
        $query = $this->select()->where("id_familia = ?", (int)$idFamilia)
                                ->where("tipo = 0")->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_rango"] : 0;
    }
    
    public function getIdSubCapo($idFamilia) {
        $query = $this->select()->where("id_familia = ?", (int)$idFamilia)
                                ->where("tipo = 1")->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_rango"] : 0;
    }

    public function getIdMiembro($idFamilia) {
        $query = $this->select()->where("id_familia = ?", (int)$idFamilia)
                                ->where("tipo = 2")->limit(1);
        $data = $this->fetchAll($query)->toArray();
        return isset($data[0]) ? $data[0]["id_rango"] : 0;
    }
    
    public function getListaRangos($idFamilia, $capo = true) {
        $query = $this->select()->from($this->_name, array("id_rango", "nombre"))
                                ->where("id_familia = ?", $idFamilia);
        if (!$capo) $query->where("tipo != 0");
        
        return $this->_db->fetchPairs($query);
    }
    
    public function getRangos($idFamilia, $all = true) {
        $query = $this->select()->where("id_familia = ?", $idFamilia);
        if (!$all) $query->where("tipo = 4");
        return $this->fetchAll($query)->toArray();
    }
    
    public function puede($idRango, $accion) {
        $data = $this->getDataRangoById($idRango);
        return $data[0][$accion];
    }

}