<?php

    /*
        array(7) { 
            ["Uni"]=>  string(34) "s10.vendetta.es/vendetta/login.php" 
            ["layout"]=>  string(1) "1" 
            ["antiback"]=>  string(13) "1284938454906" 
            ["ln"]=>  string(7) "rodrigo" 
            ["pw"]=>  string(8) "rodrigo9" 
            ["x"]=>  string(2) "16" 
            ["y"]=>  string(1) "6" 
        } 
        
        array(4) { 
            ["q"]=>  string(47) "011befd7523318e34355ffcf06cebb1fdad84x34x12x132" 
            ["o"]=>  string(0) "" 
            ["s"]=>  string(1) "s" 
            ["a"]=>  string(1) "1" } 
        */


class Mob_Export {

    protected $_q;
    
    public function __construct(array $data) {        
                
        $dataDomain = explode(":", $data["servidor"]);
        
        $this->_login($dataDomain[1], $dataDomain[0], $data["user"], $data["pass"]);
        $puntos = $this->_getData($data["nombre"], $dataDomain[1], $dataDomain[0]);
        
        $puntosEntrenamientos = 0;
        foreach ($data["entrenamientos"] as $ent => $nivel) {
            $puntosEntrenamientos += Mob_Loader::getEntrenamiento($ent)->getPuntos() * $nivel;
        }
        
        $puntosTropas = 0;
        $txtTropas = "<br />";
        foreach ($data["tropas"] as $tropa => $cantidad) {
            $puntosTropas += @Mob_Loader::getTropa($tropa)->getPuntos() * $cantidad;
            if (!empty($cantidad)) $txtTropas .= Mob_Loader::getTropa($tropa)->getNombre()." (".(@Mob_Loader::getTropa($tropa)->getPuntos()).") * $cantidad = " .@Mob_Loader::getTropa($tropa)->getPuntos() * $cantidad."<br/>";
        }
        
        $puntosTropas = round($puntosTropas);
        $puntosEntrenamientos = round($puntosEntrenamientos);
        
        $visionGlobal = str_replace("\t", " ", trim($data["vision_global"]));
        
        $visionGlobal = explode("\r", $visionGlobal);
        
        if (sizeof($visionGlobal) == 21) {
          // no copio el nombre del jugador asi que van de la 5 a la 21
          $lineaCoordenadas = 0;
          $inicio = 5;
          $fin = 19;
        } else {
          // las habitaciones estan de la linea 6 a la 20
          $lineaCoordenadas = 1;
          $inicio = 6;
          $fin = 20;
        }

        $coordenadas = explode(" ", trim($visionGlobal[$lineaCoordenadas]));
        array_shift($coordenadas);array_pop($coordenadas);
        
        $habs = array($inicio => "Oficina", "escuela", "armeria", "municion", "cerveceria", "taberna", 
        "contrabando", "almacenArm", "deposito", "almacenAlc", "caja", "campo", "seguridad", "torreta", "minas");
        
        $ptosHabitaciones = 0;
        $edis = array();
        foreach (range($inicio, $fin) as $line) {
            $info = explode(" ", str_replace(".", "", trim($visionGlobal[$line])));
            unset($info[sizeof($info)-1]);
            foreach ($info as $k => $v) {
                if ($v == "-") $info[$k] = $v = 0;
                if (!is_numeric($v)) unset($info[$k]);
            }
            $info = array_values($info);
            
            foreach ($info as $e => $nivelHab) {
                $edis[$e][$habs[$line]] = $nivelHab;
            }            
        
        }
        
        foreach ($edis as $n => $hab) {
            $puntosEdi = 0;
            foreach ($hab as $name => $level) {
                $puntosEdi += Mob_Loader::getHabitacion($name)->getPuntos() * $level;
            }
            $ptosHabitaciones += floor($puntosEdi);
        }
        
        $ok = true; 
        
        $entrenamientosOk = $puntosEntrenamientos == $puntos["entrenamientos"] || abs($puntosEntrenamientos - $puntos["entrenamientos"]) < 3;
        $tropasOk = $puntosTropas == $puntos["tropas"] || abs($puntosTropas - $puntos["tropas"]) < 35;
        //$tropasOk = $puntosTropas == $puntos["tropas"];
        $ok = $ok && $entrenamientosOk;  
        //$ok = $ok && $puntosTropas == $puntos["tropas"];
        $ok = $ok && $tropasOk;        
        $ok = $ok && $ptosHabitaciones == $puntos["edificios"];
        
        $this->_msg = "Edificios: ".($ptosHabitaciones == $puntos["edificios"] ? "Ok" : "Error ( ".$ptosHabitaciones." != ".$puntos["edificios"]." )")."<br />";
        $this->_msg .= "Entrenamientos: ".($entrenamientosOk ? "Ok" : "Error ( ".$puntosEntrenamientos." != ".$puntos["entrenamientos"]." )")."<br />";
        $this->_msg .= "Tropas: ".($tropasOk ? "Ok" : "Error ( ".$puntosTropas." != ".$puntos["tropas"]." )")."<br />";
        if (!$tropasOk) $this->_msg .= $txtTropas;
        
        $this->_isValid  = $ok;
        $this->_data = array(
            "tropas" => $data["tropas"],
            "entrenamientos" => $data["entrenamientos"],
            "edificios" => $edis,
            "coordenadas" => $coordenadas
        );   
    }
    
    public function isValid() {
        return $this->_isValid;
    }
    
    public function getData() {
        return $this->_data;
    }
    
    public function getMessage() {
      return $this->_msg;
    }
    
    protected function _login($serverNumber, $domain, $user, $pass) {
        $client = new Zend_Http_Client();
        $client->setUri('http://s'.$serverNumber.'.'.$domain.'/vendetta/login.php');
                                                                                  
        $client->setParameterPost('http://s'.$serverNumber.'.'.$domain.'/vendetta/login.php');
        $client->setParameterPost('layout', '1');
        $client->setParameterPost('antiback', time());
        $client->setParameterPost('ln', $user);
        $client->setParameterPost('pw', $pass);
        $client->setParameterPost('x', '16');
        $client->setParameterPost('y', '6');
        
        $response = $client->request('POST')->getBody();
        
        $Q = strpos($response, "?q=");
        $Q = substr($response, $Q);
        $Q = substr($Q, 0, strpos($Q, '"'));
        $Q = substr($Q, 3);
        $this->_q = $Q;
    }    

    protected function _getData($usuario, $serverNumber, $domain) {
        $client2 = new Zend_Http_Client();
        $client2->setUri('http://s'.$serverNumber.'.'.$domain.'/vendetta/highscore.php?q='.$this->_q);
        /*$client2->setParameterPost('q', $this->_q);
        $client2->setParameterPost('o', '');
        $client2->setParameterPost('s', 's');
        $client2->setParameterPost('a', '1');*/
        $response = $client2->request("GET")->getBody();

        $posName = strpos($response, $usuario."</a>");
        $post = substr($response, $posName);
        $close = strpos($post, "</tr>");
        
        $data = substr($post, 0, $close);
        $data = trim(strip_tags(str_replace(array("<th", "."), array(" <th", ""), $data)));
        
        $data = explode(" ", $data);
       
        if (sizeof($data) == 6) {
            list($name, $entrenamientos, $edificios, $tropas, $total, $cantEdificios) = $data;
        } else {
            @list($name, $familia, $entrenamientos, $edificios, $tropas, $total, $cantEdificios) = $data;
        }
        
        return array("edificios" => $edificios, 
        "entrenamientos" => $entrenamientos, 
        "tropas" => $tropas, 
        "total" => $total);
    }
}