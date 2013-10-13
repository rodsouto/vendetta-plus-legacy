<?php
class Mob_Edificio {

    protected $_habitaciones;
    protected $_tropas;
    private $_id_edificio;
    public $habitacion; /* habitacion que se esta construyendo */
    public $tiempo_restante;
    
    public function __construct($id_edificio) {

        $this->_id_edificio = $id_edificio;
    
        $habitaciones = array("Oficina", "Escuela", "Armeria", "Municion", "Cerveceria", "Taberna", "Contrabando", "AlmacenArm", "Deposito", "Caja", "AlmacenAlc", "Campo", "Minas", "Seguridad", "Torreta");
        foreach ($habitaciones as $habitacion) {
            $class = sprintf("Mob_Habitacion_%s", $habitacion);
            $this->_habitaciones[$habitacion] = new $class($this->_id_edificio);
        }
        // "Tactico",  "Demolicion", 
        $tropas = array("Maton", "Portero", "Acuchillador", "Pistolero", "Ocupacion", "Espia", "Porteador", "Cia", "Fbi", "Transportista", "Francotirador", "Asesino", "Ninja", "Mercenario");
        foreach ($tropas as $tropa) {
            $class = sprintf("Mob_Tropa_%s", $tropa);
            $this->_tropas[$tropa] = new $class($this->_id_edificio);
        }
        
        $entrenamientos = array("Administracion", "Armas", "Combate", "Contrabando", "Encargos", "Espionaje", "Explosivos", "Extorsion", "Guerrilla", "Honor", "Proteccion", "Psicologico", "Rutas", "Seguridad", "Tiro");
        foreach ($entrenamientos as $entrenamiento) {
            $class = sprintf("Mob_Entrenamiento_%s", $entrenamiento);
            $this->_entrenamientos[$entrenamiento] = new $class($this->_id_edificio);
        }
    }
    
    public function getRecursos() {
        $q = sprintf("SELECT recursos_ar, recursos_mun, recursos_alc, recursos_dol FROM mob_edificios WHERE id = %s LIMIT 1", $this->_id_edificio);
        $res = Zend_Registry::get("dbAdapter")->fetchAll($q);
        $ret = array();
        foreach ($res[0] as $k => $v) $ret[$k] = $v;
        return $ret;
    }
    
    public function getHabitaciones() {
    	$hab = array();
    	foreach ($this->_habitaciones as $k => $v) {
    		$hab[] = array("nombre" => $v->getNombre(), 
    						"nivel"=> $v->getNivel(),
    						"tiempo"=> timeFormat($v->getTiempo()),
    						"campo"=> $v->getCampo(),
    						"arm"=> $v->getCosto("arm"),
    						"mun" => $v->getCosto("mun"),
    						"dol" => $v->getCosto("dol"),
                            "descripcion" => $v->getAttrib("descripcion"),
                            "img" => $v->getAttrib("img"));
    	}
   	
    	return $hab;
    }
    
    public function getTropas() {
    	$tropas = array();
    	foreach ($this->_tropas as $k => $v) {
    		$tropas[] = array("nombre" => $v->getNombre(),
    						"tiempo"=> timeFormat($v->getTiempo()),
    						"campo"=> $v->getCampo(),
    						"arm"=> $v->getAttrib("armas"),
    						"mun" => $v->getAttrib("municion"),
    						"dol" => $v->getAttrib("dolares"),
                            "puntos" => $v->getAttrib("puntos"),
                            "ataque" => $v->getAttrib("ataque"),
                            "defensa" => $v->getAttrib("defensa"),
                            "capacidad" => $v->getAttrib("capacidad"),
                            "velocidad" => $v->getAttrib("velocidad"),
                            "salario" => $v->getAttrib("salario"),
                            "requisitos" => $v->getAttrib("requisitos"),
                            "tiempo" => timeFormat($v->getTiempo()),
                            "descripcion" => $v->getAttrib("descripcion"),
                            "img" => $v->getAttrib("img"));
    	}
    	return $tropas;
    }
    
    public function getEntrenamientos() {
    	$entrenamiento = array();
    	foreach ($this->_entrenamientos as $k => $v) {
    		$tropas[] = array("nombre" => $v->getNombre(),
    						"tiempo"=> timeFormat($v->getTiempo()),
    						"campo"=> $v->getAttrib("campo"),
    						"arm"=> $v->getAttrib("armas"),
    						"mun" => $v->getAttrib("municion"),
    						"dol" => $v->getAttrib("dolares"),
                            "puntos" => $v->getAttrib("puntos"),
                            "ataque" => $v->getAttrib("ataque"),
                            "defensa" => $v->getAttrib("defensa"),
                            "capacidad" => $v->getAttrib("capacidad"),
                            "velocidad" => $v->getAttrib("velocidad"),
                            "salario" => $v->getAttrib("salario"),
                            "requisitos" => $v->getAttrib("requisitos"),
                            "tiempo" => timeFormat($v->getTiempo()),
                            "descripcion" => $v->getAttrib("descripcion"),
                            "img" => $v->getAttrib("img"));
    	}
    	return $tropas;
    }
    
    public function getTropasEstacionadas() {
        $campos = array();
        foreach ($this->_tropas as $tropa) {
            $campos[] = $tropa->getCampo();
        }
        
        $q = sprintf("SELECT %s FROM mob_edificios WHERE id = %s LIMIT 1", implode(", ", $campos), $this->_id_edificio);
        $res = Zend_Registry::get("dbAdapter")->fetchAll($q);
        return $res[0];
    }
    
    
    public function getHabitacion($habitacion) {
    		$habitacion = str_replace(array("Almacen_arm", "Almacen_alc"), array("AlmacenArm", "AlmacenAlc"), ucwords($habitacion));
    		return $this->_habitaciones[$habitacion];
    }
    
    public function getTropa($tropa) {
            if (!$this->_tropas[ucwords($tropa)] instanceof Mob_Tropa_Abstract) throw new Exception ("VDT_ERROR_NO_INSTANCEOF_TROPA");
    		return $this->_tropas[ucwords($tropa)];
    }
    
    public function getOficina() {
    	$q = "SELECT oficina FROM mob_edificios WHERE id=".$this->_id_edificio." LIMIT 1";
			$res = Zend_Registry::get("dbAdapter")->fetchAll($q);
			return $res[0]["oficina"];
    }
    
    public function getCampoEntrenamiento() {
    	$q = "SELECT campo FROM mob_edificios WHERE id=".$this->_id_edificio." LIMIT 1";
			$res = Zend_Registry::get("dbAdapter")->fetchAll($q);
			return $res[0]["campo"];
    }
    
    public function estaConstruyendo() {
    	$q = "SELECT * FROM mob_habitaciones WHERE id_edificio=".$this->_id_edificio." AND fecha_fin>now() LIMIT 1";
			$res = Zend_Registry::get("dbAdapter")->fetchAll($q);

			if (sizeof($res)>0) {
				$this->habitacion = $res[0]["habitacion"];
				$this->tiempo_restante = timeFormat(strtotime($res[0]["fecha_fin"])-time());
				return true;
			}
			
			return false;
    }
    
    public function getTropasEntrenando() {
    	$q = "SELECT * FROM mob_tropas WHERE id_edificio=".$this->_id_edificio." ORDER BY id ASC";
		$res = Zend_Registry::get("dbAdapter")->fetchAll($q);

        foreach ($res as &$v) {
            $v["tiempo_restante"] = timeFormat(strtotime($v["fecha_fin"])-time());
            $v["tiempo_entrenamiento"] = timeFormat($this->getTropa($v["tropa"])->getTiempo()*$v["cantidad"]);
        }
    	return $res;
    }
    
    public function getHabitacionesConstruyendo() {
    	$q = "SELECT * FROM mob_habitaciones WHERE id_usuario=".Zend_Registry::get("Jugador")->getIdUsuario()." AND fecha_fin>now()";
		$res = Zend_Registry::get("dbAdapter")->fetchAll($q);
		foreach ($res as &$v) {
            $v["tiempo_restante"] = timeFormat(strtotime($v["fecha_fin"])-time());
            $v["nombre"] = $this->getHabitacion($v["habitacion"])->getNombre();
            $v["nivel"] = 8;
        }
        return $res;
    }
    
    public function estaEntrenando() {
        $q = "SELECT COUNT(*) FROM mob_tropas WHERE id_edificio=".$this->_id_edificio;
        $res = Zend_Registry::get("dbAdapter")->fetchAll($q);
        return $res[0]["COUNT(*)"]>0;
    }
    
    public function getHabitacionConstruyendo() {
    	return $this->habitacion;
    }
    
    public function getTiempoRestante() {
    	return $this->tiempo_restante;
    }
    
    public function puedeGastar ($arm=0, $mun=0, $dol=0, $alc=0) {
			$q="SELECT recursos_ar, recursos_mun, recursos_alc, recursos_dol FROM mob_edificios WHERE id = ".$this->_id_edificio." LIMIT 1";
			$res = Zend_Registry::get("dbAdapter")->fetchAll($q);
			$res = $res[0];

			return ($res["recursos_ar"]>=$arm && $res["recursos_mun"]>=$mun && $res["recursos_alc"]>=$alc && $res["recursos_dol"]>=$dol);
	}
	
	public function puedeEntrenar($tropa, $cantidad) {
        if (empty($tropa) || empty($cantidad)) throw new Exception("VDT_ERROR_INCOMPLETE_TROPA_OR_CANTIDAD");
        
        $tropa = $this->getTropa($tropa);

        return $this->puedeGastar($tropa->getAttrib("armas")*$cantidad, $tropa->getAttrib("municion")*$cantidad, $tropa->getAttrib("dolares")*$cantidad, 0);
        
    }
    
    public function entrenar($tropa, $cantidad) {
        if (!$this->puedeEntrenar($tropa, $cantidad)) throw new Excepcion("ERROR_TYPE_NO_MONEY");
        $this->getTropa($tropa)->entrenar($cantidad);
    }
		
	function restarRecursos ($arm=0, $mun=0, $dol=0, $alc=0) {

        $recursos = $this->getRecursos();

        $data = array(
            'recursos_ar' => $recursos["recursos_ar"]-$arm,
    		'recursos_mun' => $recursos["recursos_mun"]-$mun,
    		'recursos_alc' => $recursos["recursos_alc"]-$alc,
    		'recursos_dol' => $recursos["recursos_dol"]-$dol
		);

		Zend_Registry::get("dbAdapter")->update('mob_edificios', $data, "id = {$this->_id_edificio}");
	}
}

if (!function_exists("lcfirst")) {
	function lcfirst($s) {
		$s{0} = strtolower($s{0});
		return $s;
	}
}