<?php

class Mob_Data {
	
	public static function getHabitaciones(){
    $method = "getHabitaciones".ucwords(Mob_Server::getGameType());
    return self::$method();
  }
	
	public static function getHabitacionesSpace4k(){
	 return array("centroOperaciones", "centroInvestigacion", "minaHierro", "refineriaLutino", 
                "plataformaPerforacion", "plQuimica", "plQuimicaMejorada", "almacenHierro", "depositoLutino", 
                "tanqueAgua", "tanqueHidrogeno", "hangar", "estacionDefensa", "escudoPlanetario", "centralEnergetica");
	}
	
	public static function getHabitacionesVendetta(){
    return array("oficina", "escuela", "armeria", "municion", "cerveceria", "taberna", "contrabando", 
            "almacenArm", "deposito", "almacenAlc", "caja", "campo", "seguridad", "torreta", "minas");
	}
	
	public static function getEntrenamientos(){
    $method = "getEntrenamientos".ucwords(Mob_Server::getGameType());
    return self::$method();
  }
	
	public static function getEntrenamientosSpace4k(){
	 return array("motorCombustion", "motorIonico", "propulsionEspacio", "tecColonizacion",
            "capCargaMejorada", "tecEspionaje", "propMultidimensional", "tecDeteccion", "tecCamuflaje", "blindajeMejorado",
            "tecDefensa", "focalizacionEnerg", "ionizacion", "proyExplosivos", "proyPlasma", "diplomacia");
	}
	
	public static function getEntrenamientosVendetta(){
    return array("rutas", "encargos", "extorsion", "administracion", "contrabando", "espionaje", "seguridad",
        "proteccion", "combate", "armas", "tiro", "explosivos", "guerrilla", "psicologico", "quimico", "honor");
	}
	
  public static function getTropas($tipo = null){
    $method = "getTropas".ucwords(Mob_Server::getGameType());
    return self::$method($tipo);
  }
	
	public static function getTropasSpace4k($tipo = null){
	   $ataque = array("chacal", "renegado", "darwin", "saqueador", "colonizador", "sondaEspionaje", "tjuger", "cougar", "comerciante",
        "transportador", "bombarderoCamuflaje", "aguilaGrandeV", "noe", "aguilaGrandeX", "spit", "sentih");
        
     $defensa = array("torreLaserPequena", "torreLaser", "lanzadorPulsos", "torrePlasma", "lanzamisiles");
    
    if ($tipo === null) {
      return array_merge($ataque, $defensa);    
    }
    
    if ($tipo == "ataque") return $ataque;
    
    return $defensa;
	}
	
  public static function getTropasVendetta($tipo = null){
	   $ataque = array("maton", "portero", "acuchillador", "pistolero", "ocupacion", "espia", "porteador", "cia", "fbi",
        "transportista", "tactico", "francotirador", "asesino", "ninja", "demoliciones", "mercenario");
        
     $defensa = array("ilegal", "centinela", "policia", "guardaespaldas", "guardia");
    
    if ($tipo === null) {
      return array_merge($ataque, $defensa);    
    }
    
    if ($tipo == "ataque") return $ataque;
    
    return $defensa;
	}
	
	public static function getTipoTropa($tropa) {
    $ataque = Mob_Data::getTropas("ataque");
    
    if (in_array(lcfirst($tropa), $ataque)) return "ataque";
    
    return "defensa";
  }
  
  public static function getIdiomas($all = false) {
    $idiomas = Mob_Server::getIdiomas();
    if (!$all) $idiomas = array_filter($idiomas);
    foreach ($idiomas as $iso => $act) {
      $idiomas[$iso] = Zend_Registry::get("Zend_Translate")->_("idioma_".$iso);
    }
    return $idiomas;  
  }
	
}