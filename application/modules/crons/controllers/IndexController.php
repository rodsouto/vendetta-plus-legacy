<?php

class Crons_IndexController extends Zend_Controller_Action {

    protected $_db;

    public function init(){

      $this->_helper->viewRenderer->setNoRender(true);
      //$this->_helper->layout->disableLayout(true);

      $this->_db = Zend_Db_Table_Abstract::getDefaultAdapter();
      ini_set("memory_limit","600M");
      error_reporting(E_ALL);
      ini_set("display_errors", true);
      $this->getResponse()->appendBody("DB_NAME: ".$this->_db->fetchOne("select DATABASE();")." - ".date("Y-m-d H:i:s")."\n\n");
    }
    
    public function rearmarcolastropasAction() {
      $page = 1;
      $limit = 50;
      $query = $this->_db->select()->from("mob_tropas_nuevas")->group("id_edificio")->group("tipo")
                                                              ->order("id_edificio ASC")->order("id_tropa_nueva ASC")
                                                              ->limitPage($page, $limit);

      $timeNow = time();
      while(($data = $this->_db->fetchAll($query)) != array()) {
          foreach ($data as $d) {
            if (strtotime($d["fecha_fin"]) > time()+$d["duracion"]) {
              Mob_Loader::getModel("Tropa_Nueva")->processQueue($d, $timeNow);
              Mob_Loader::getModel("Tropa_Nueva")->delete("id_tropa_nueva = ".$d["id_tropa_nueva"]);
              Mob_Loader::getModel("Tropa_Nueva")->rearmarCola($d["id_edificio"], null, $d["tipo"]);
              echo $d["id_tropa_nueva"]." - ".$d["id_usuario"]." - ".$d["id_edificio"]."\n";  
            }
          }
        
        $page++;
        $query->limitPage($page, $limit);
      }
      echo "\n\nfin";      
    }
    
    public function mainAction() {
      $count = 50;
      
       
      
      $config = array(
      "mob_misiones" => "actualizarMisiones", 
      "mob_habitaciones_nuevas" => "actualizarHabitaciones", 
      "mob_tropas_nuevas" => "actualizarTropas"
      );
      
      foreach ($config as $table => $method) {
        
        echo "$table\n";
        $page = 1;
        echo $query = $this->_db->select()->from($table, array("id_usuario"))
                              ->order("id_usuario")
                              ->group("id_usuario")
                              ->where("fecha_fin < ?", date("Y-m-d H:i:s", strtotime("-5 minutes")))
                              ->limitPage($page, $count);
        
        while(($data = $this->_db->fetchAll($query)) != array()) {
          $plugin = new Mob_Controller_Plugin_Update;
          foreach ($data as $user) {
            echo $user["id_usuario"]."\n";
            $plugin->$method($user["id_usuario"]);
          }  
          $page = $page+1;
          $query->limitPage($page, $count);
        }      
      }
      
      echo "\n\nfin\n\n";
    }
    
    public function testcolaAction() {

      /*$idEdificio = 3066;
      $idUsuario = 234;
      Mob_Loader::getModel("Habitacion_Nueva")->delete("id_edificio = $idEdificio");
      $edificio = new Mob_Edificio;
      $edificio->setEdificio($idEdificio);      
      Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, "oficina", 250);
      Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, "escuela", 1);
      Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, true, $edificio, 
              $edificio->getHabitacion("escuela"), true);
        Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, false, $edificio, 
              $edificio->getHabitacion("oficina"), true);
               Zend_Debug::dump(Mob_Loader::getModel("Habitacion_Nueva")->fetchAll("id_edificio = $idEdificio")->toArray(), "CONSTRUCCIONES");
              die();*/
    
      echo date("Y-m-d H:i:s")." ".date("Y-m-d H:i:s", time())."\n";

      $idEdificio = 3063;
      $idUsuario = 234;
      
      $unAñoAtras = time() - 60*60*24*365;
      
      $update = new Mob_Controller_Plugin_Update;
      $update->setDebug(true);      
      $oriNivelInicial = 1;
      // 1: puede construir 0: no puede construir
        // array(config, duracion, nivelConstruyendoAlFinalizar);
      $configConstruccion = array(
          // todos estos estan terminados al momento en que se ejecuta el cron
          /*array(array(1, 1, 1, 1, 1, 1), null, null),
          array(array(1, 1, 1, 1, 1, 0), null, null),
          array(array(1, 1, 1, 1, 0, 0), null, null),
          array(array(1, 1, 1, 0, 0, 0), null, null),
          array(array(1, 1, 0, 0, 0, 0), null, null),
          array(array(1, 0, 0, 0, 0, 0), null, null),
          array(array(0, 0, 0, 0, 0, 0), null, null),
          array(array(0, 1, 0, 0, 0, 0), null, null),
          array(array(0, 1, 1, 0, 0, 0), null, null),
          array(array(0, 1, 1, 1, 0, 0), null, null),
          array(array(0, 1, 1, 1, 1, 0), null, null),
          array(array(0, 1, 1, 1, 0, 1), null, null),*/
          array(array(1, 0, 1, 0, 1, 0), null, null),
          /*array(array(1, 1, 0, 0, 1, 1), null, null),
          array(array(1, 1, 0, 1, 0, 1), null, null),
          array(array(1, 0, 0, 1, 0, 1), null, null),
          array(array(1, 0, 0, 0, 0, 1), null, null),
          array(array(1, 0, 0, 1, 1, 0), null, null),
          array(array(1, 0, 0, 1, 0, 1)),
          // aca, al momento de ejecutar el cron algunos estan terminados y otros no
          array(array(1, 1, 1, 1, 1, 1), 10, $oriNivelInicial+4),
          array(array(1, 0, 0, 0, 0, 0), 10, null),
          array(array(1, 1, 0, 1, 0, 1), 10, $oriNivelInicial+3), 
          array(array(1, 0, 1, 0, 1, 0), 10, $oriNivelInicial+3), 
          array(array(1, 0, 0, 0, 0, 1), 10, $oriNivelInicial+2),
          array(array(1, 0, 0, 0, 0, 0), 10, null),
          array(array(1, 0, 0, 1, 1, 0), 10, $oriNivelInicial+2)*/
          
      );
      
     
      $habitacion = "escuela";
      foreach ($configConstruccion as $k1 => $test) {echo "$k1 ********************************************\n";
        $nivelInicial = $oriNivelInicial;
        Mob_Loader::getModel("Edificio")->update(array("recursos_arm" => 2, "recursos_mun" => 3, "recursos_dol" => 4, "recursos_alc" => 5), "id_edificio = $idEdificio");
        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, "oficina", 50);
        Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, $habitacion, $nivelInicial);
        
        
        $edificio = new Mob_Edificio;
        $edificio->setEdificio($idEdificio);      

        /*Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, true, $edificio, 
              $edificio->getHabitacion("escuela"), true, strtotime("-20 seconds"), 30);
        Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, true, $edificio, 
              $edificio->getHabitacion("escuela"), true, strtotime("-20 seconds"), 30);*/              
        
        $fechaInicio = $unAñoAtras;
        $duracion = null;
        if (isset($test[1])) {
          // $test[2] es la duracion, si esta seteada entonces hago que las primeras 3 esten terminadas al momento actual y las siguientes tres no
          $fechaInicio = time()-3*$test[1]-4;
          echo "real fecha inicio: ".date("Y-m-d H:i:s", $fechaInicio)."\n";
          $duracion = $test[1];
        }
        
        foreach (isset($test[1]) ? array_slice($test[0], 0, 3) : $test[0] as $v) {
          if ($v == 1) {
            $nivelInicial++;
          }
        }
        //var_dump(isset($test[1]) ? array_slice($test[0], 0, 3) : $test[0], $nivelInicial);die();
        //echo "estado recursos Inicial: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($idEdificio))."\n\n";
        foreach ($test[0] as $k => $v) {
         Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, $v == 1, $edificio, 
              $edificio->getHabitacion($v == 0 ? "oficina" : "escuela"), $k != 0, $fechaInicio, $duracion);
              //$edificio->getHabitacion($v == 0 ? "oficina" : "escuela"), isset($test[1]) ? $k != 0 && $k <= 2 : $k != 0, $fechaInicio, $duracion);
        }
        
        //echo "estado recursos: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($idEdificio))."\n\n";
        
        $update->actualizarHabitaciones($idUsuario);
        if (($txt1 = $this->_assertHabitacionNivel($idEdificio, $habitacion, $nivelInicial)) != "") echo $txt1;
        //if (($txt2 = $this->_assertRecursos($idEdificio, 2, 3, 4, 5)) != "") echo $txt2;
        $ultimaEnCola = Mob_Loader::getModel("Habitacion_Nueva")->getConstruccionActual($idEdificio);
        if ((isset($test[2]) && isset($ultimaEnCola["nivel"]) &&  $ultimaEnCola["nivel"] != $test[2]) || (!isset($test[2]) && $ultimaEnCola != array())) echo "error en la habitacion que quedo construyendo: ".
        $ultimaEnCola["habitacion"]." ".$ultimaEnCola["nivel"]." y deberia ser ".(isset($test[2]) ? $test[2] : "ninguna")."<br />";  
        echo "estado recursos: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($idEdificio))."\n\n";
        $delete = Mob_Loader::getModel("Habitacion_Nueva")->delete("id_edificio = $idEdificio");
        break;
      }

      echo "\n\nFIN\n\n";
    }

    public function testcolaentAction() {
      $idEdificio = 3069;
      $idUsuario = 234;
      $jugador = new Mob_Jugador($idUsuario);
      Mob_Loader::getModel("Entrenamiento_Nuevo")->delete("id_edificio = $idEdificio");
      $edificio = $jugador->getEdificioActual();
      $edificio->setEdificio($idEdificio);      
      Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, "honor", 250);
      Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, "rutas", 1);
      Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, "extorsion", 1);
      Mob_Loader::getModel("Entrenamiento_Nuevo")->construirTestCase($idUsuario, true, $edificio, 
              $edificio->getEntrenamiento("rutas"), true, strtotime("-7 seconds"));//
      Mob_Loader::getModel("Entrenamiento_Nuevo")->construirTestCase($idUsuario, false, $edificio, 
              $edificio->getEntrenamiento("extorsion"), true);
      Mob_Loader::getModel("Entrenamiento_Nuevo")->construirTestCase($idUsuario, false, $edificio, 
              $edificio->getEntrenamiento("extorsion"), true);              
               Zend_Debug::dump(Mob_Loader::getModel("Entrenamiento_Nuevo")->fetchAll("id_edificio = $idEdificio")->toArray(), "CONSTRUCCIONES");
              die();
      echo date("Y-m-d H:i:s")." ".date("Y-m-d H:i:s", time())."\n";

      $idEdificio = 3069;
      $idUsuario = 234;
      
      $unAñoAtras = time() - 60*60*24*365;
      
      $update = new Mob_Controller_Plugin_Update;
      $update->setDebug(true);      
      $oriNivelInicial = 1;
      // 1: puede construir 0: no puede construir
        // array(config, duracion, nivelConstruyendoAlFinalizar);
      $configConstruccion = array(
          // todos estos estan terminados al momento en que se ejecuta el cron
          array(array(1, 1, 1, 1, 1, 1), null, null),
          array(array(1, 1, 1, 1, 1, 0), null, null),
          array(array(1, 1, 1, 1, 0, 0), null, null),
          array(array(1, 1, 1, 0, 0, 0), null, null),
          array(array(1, 1, 0, 0, 0, 0), null, null),
          array(array(1, 0, 0, 0, 0, 0), null, null),
          array(array(0, 0, 0, 0, 0, 0), null, null),
          array(array(0, 1, 0, 0, 0, 0), null, null),
          array(array(0, 1, 1, 0, 0, 0), null, null),
          array(array(0, 1, 1, 1, 0, 0), null, null),
          array(array(0, 1, 1, 1, 1, 0), null, null),
          array(array(0, 1, 1, 1, 0, 1), null, null),
          array(array(1, 0, 1, 0, 1, 0), null, null),
          array(array(1, 1, 0, 0, 1, 1), null, null),
          array(array(1, 1, 0, 1, 0, 1), null, null),
          array(array(1, 0, 0, 1, 0, 1), null, null),
          array(array(1, 0, 0, 0, 0, 1), null, null),
          array(array(1, 0, 0, 1, 1, 0), null, null),
          array(array(1, 0, 0, 1, 0, 1)),
          // aca, al momento de ejecutar el cron algunos estan terminados y otros no
          array(array(1, 1, 1, 1, 1, 1), 10, $oriNivelInicial+4),
          array(array(1, 0, 0, 0, 0, 0), 10, null),
          array(array(1, 1, 0, 1, 0, 1), 10, $oriNivelInicial+3), 
          array(array(1, 0, 1, 0, 1, 0), 10, $oriNivelInicial+3), 
          array(array(1, 0, 0, 0, 0, 1), 10, $oriNivelInicial+2),
          array(array(1, 0, 0, 0, 0, 0), 10, null),
          array(array(1, 0, 0, 1, 1, 0), 10, $oriNivelInicial+2)
          
      );
      
     
      $habitacion = "extorsion";
      foreach ($configConstruccion as $k1 => $test) {echo "$k1 ********************************************\n";
        $nivelInicial = $oriNivelInicial;
        Mob_Loader::getModel("Edificio")->update(array("recursos_arm" => 2, "recursos_mun" => 3, "recursos_dol" => 4, "recursos_alc" => 5), "id_edificio = $idEdificio");
        Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, "honor", 50);
        Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, $habitacion, $nivelInicial);
        
        $jugador = new Mob_Jugador($idUsuario);
        Mob_Loader::getModel("Entrenamiento_Nuevo")->delete("id_usuario = $idUsuario");
        $edificio = $jugador->getEdificioActual();
        $edificio->setEdificio($idEdificio);      
        
        /*Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, true, $edificio, 
              $edificio->getHabitacion("escuela"), true, strtotime("-20 seconds"), 30);
        Mob_Loader::getModel("Habitacion_Nueva")->construirTestCase($idUsuario, true, $edificio, 
              $edificio->getHabitacion("escuela"), true, strtotime("-20 seconds"), 30);*/              
        
        $fechaInicio = $unAñoAtras;
        $duracion = null;
        if (isset($test[1])) {
          // $test[2] es la duracion, si esta seteada entonces hago que las primeras 3 esten terminadas al momento actual y las siguientes tres no
          $fechaInicio = time()-3*$test[1]-4;
          var_dump(array_slice($test[0], 0, 3));
          //$fechaInicio = time()-array_sum(array_slice($test[0], 0, 3))*$test[1]-4;
          echo "real fecha inicio: ".date("Y-m-d H:i:s", $fechaInicio)."\n";
          $duracion = $test[1];
        }
        
        foreach (isset($test[1]) ? array_slice($test[0], 0, 3) : $test[0] as $v) {
          if ($v == 1) {
            $nivelInicial++;
          }
        }
        //var_dump(isset($test[1]) ? array_slice($test[0], 0, 3) : $test[0], $nivelInicial);die();
        //echo "estado recursos Inicial: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($idEdificio))."\n\n";
        foreach ($test[0] as $k => $v) {
         Mob_Loader::getModel("Entrenamiento_Nuevo")->construirTestCase($idUsuario, $v == 1, $edificio, 
              $edificio->getEntrenamiento($v == 0 ? "honor" : "extorsion"), $k != 0, $fechaInicio, $duracion);
              //$edificio->getHabitacion($v == 0 ? "oficina" : "escuela"), isset($test[1]) ? $k != 0 && $k <= 2 : $k != 0, $fechaInicio, $duracion);
        }
        
        //echo "estado recursos: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($idEdificio))."\n\n";

        $update->actualizarEntrenamientos($idUsuario);
        if (($txt1 = $this->_assertEntrenamientoNivel($idUsuario, $habitacion, $nivelInicial)) != "") echo $txt1;
        //if (($txt2 = $this->_assertRecursos($idEdificio, 2, 3, 4, 5)) != "") echo $txt2;
        $ultimaEnCola = Mob_Loader::getModel("Entrenamiento_Nuevo")->getConstruccionActual($idEdificio);
        if ((isset($test[2]) && isset($ultimaEnCola["nivel"]) &&  $ultimaEnCola["nivel"] != $test[2]) || (!isset($test[2]) && $ultimaEnCola != array())) echo "error en la habitacion que quedo construyendo: ".
        $ultimaEnCola["entrenamiento"]." ".$ultimaEnCola["nivel"]." y deberia ser ".(isset($test[2]) ? $test[2] : "ninguna")."<br />";  
        echo "estado recursos: ".implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($idEdificio))."\n\n";
        $delete = Mob_Loader::getModel("Habitacion_Nueva")->delete("id_edificio = $idEdificio");
      }

      echo "\n\nFIN\n\n";
    }
    
    protected function _assertEntrenamientoNivel($idUsuario, $habitacion, $nivel) {
      $level = Mob_Loader::getModel("Entrenamiento")->getNivel($idUsuario, $habitacion);
      return $level == $nivel ? "" : "Error nivel final entrenamiento: es $level y debe ser $nivel\n";
    }
    
    protected function _assertHabitacionNivel($idEdificio, $habitacion, $nivel) {
      $level = Mob_Loader::getModel("Habitacion")->getNivel($idEdificio, $habitacion);
      return $level == $nivel ? "" : "Error nivel final habitacion: es $level y debe ser $nivel\n";
    }    
    
    protected function _assertRecursos($idEdificio, $arm, $mun, $alc, $dol) {
      $rec = Mob_Loader::getModel("Edificio")->getRecursos($idEdificio);
      $ret = "";
      if($rec["recursos_arm"] != $arm) $ret .= "Armas error: ".$rec["recursos_arm"]."\n";
      if($rec["recursos_mun"] != $mun) $ret .= "Municion error: ".$rec["recursos_mun"]."\n";
      if($rec["recursos_dol"] != $alc) $ret .= "Dolar error: ".$rec["recursos_dol"]."\n";
      if($rec["recursos_alc"] != $dol) $ret .= "Alcohol error: ".$rec["recursos_alc"]."\n";
      return $ret;
    }    
    
    public function restaurartropasAction() {
    
      $from = "mob_tropasDelDupl";
      $to = "mob_tropas";
      
      $page = 1;
      $count = 1000;
      $query = $this->_db->select()->from($from)->limitPage($page, $count)->order("id_tropa ASC");
      
      /*$query = "SELECT $from .* FROM $from 
      LEFT JOIN mob_edificios e ON $from .id_edificio = e.id_edificio WHERE e.id_usuario = 171";*/
      
      
      while (($data = $this->_db->fetchAll($query)) != array()) {
      
        foreach ($data as $d) {
          $id = $d["id_tropa"];
          echo "$id\n";
          unset($d["id_tropa"]);
          $this->_db->update($to, $d, "id_tropa = $id");
        }
        
        if (!is_object($query)) break;
        $page = $page +1;
        
        $query->limitPage($page, $count);
      }    
    
      echo "\n\ntropas restauradas\n\n";
    }
    
    public function cleancacheAction() {
      Mob_Cache_Factory::getInstance("query")->clean(Zend_Cache::CLEANING_MODE_ALL);
      Mob_Cache_Factory::getInstance("html")->clean(Zend_Cache::CLEANING_MODE_ALL);
      Zend_Db_Table_Abstract::getDefaultMetadataCache()->clean(Zend_Cache::CLEANING_MODE_ALL);
      echo "\n\nFIN\n\n";
    }
    
    public function updatepuntosAction() {
    
      $entrenamientos = array();
      foreach (Mob_Data::getEntrenamientos() as $e) {
          $e = Mob_Loader::getEntrenamiento($e);
          $entrenamientos[$e->getNombreBdd()] = $e->getPuntos();
      }
      
      $habitaciones = array();
      foreach (Mob_Data::getHabitaciones() as $h) {
          $h = Mob_Loader::getHabitacion($h);
          $habitaciones[$h->getNombreBdd()] = $h->getPuntos();
      }
           
      $tropas = array();
      foreach (Mob_Data::getTropas() as $t) {
          $t = Mob_Loader::getTropa($t);
          $tropas[$t->getNombreBdd()] = $t->getPuntos();
      }
      
      $model = Mob_Loader::getModel("Usuarios");
      
      $page = 1;
      $count = 300;
      $query = $model->select()->order("id_usuario ASC")->limitPage($page, $count);
      
      $jugadores = $model->fetchAll($query);
      
      while ($jugadores->current() != null) {
        
        foreach ($jugadores as $jug) {
            echo $jug["id_usuario"]."\n";
            $totalPuntosEntrenamientos = $totalPuntosHabitaciones = $totalPuntosTropas = 0;        
            foreach (Mob_Loader::getModel("Entrenamiento")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $dataEnt) {
              foreach ($entrenamientos as $ent => $pts) {
                  $totalPuntosEntrenamientos += $dataEnt[$ent] * $pts;
              }  
            }
        
            $jug->puntos_entrenamientos = $totalPuntosEntrenamientos;
        
            foreach (Mob_Loader::getModel("Edificio")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $edi) {
                foreach (Mob_Loader::getModel("Habitacion")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataHab) {
                  $totalPuntosEdificio = 0;
                  foreach ($habitaciones as $hab => $pts) {
                      $totalPuntosEdificio += $dataHab[$hab] * $pts;
                  }
                }
        
                $edi->puntos = $totalPuntosEdificio;
                $totalPuntosHabitaciones += $totalPuntosEdificio;
                $edi->save();
        
                foreach (Mob_Loader::getModel("Tropa")->fetchAll("id_edificio = ".$edi["id_edificio"]) as $dataTropa) {
                  foreach ($tropas as $tropa => $pts) {
                      $totalPuntosTropas += $dataTropa[$tropa] * $pts;
                  }
                }
            }
            
            foreach (Mob_Loader::getModel("Misiones")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $mision) {
              foreach (Zend_Json::decode($mision->tropas) as $tropa => $cantidad) {
                $totalPuntosTropas += $cantidad * $tropas[lcfirst($tropa)];  
              }
            }    
        
            $jug->puntos_edificios = $totalPuntosHabitaciones;
            $jug->puntos_tropas = $totalPuntosTropas;            
            $jug->save(); 
        }
        unset($jugadores);
        $page = $page +1;
        $query->limitPage($page, $count);
        $jugadores = $model->fetchAll($query);
      }
      
      echo "\n\nFIN\n\n";    
    
    }
    
    public function rankingAction() {
        $querys = array("TRUNCATE TABLE mob_ranking;","set @rank := 0;",
"insert into mob_ranking(id_usuario, tipo, rank)
select id_usuario, 1,@rank := @rank + 1 
from mob_usuarios order by puntos_entrenamientos+puntos_tropas+puntos_edificios desc;",
"set @rank := 0;",
"insert into mob_ranking(id_usuario, tipo, rank)
select id_usuario, 2,@rank := @rank + 1 
from mob_usuarios order by puntos_tropas desc;",
"set @rank := 0;",
"insert into mob_ranking(id_usuario, tipo, rank)
select id_usuario, 3,@rank := @rank + 1 
from mob_usuarios order by puntos_entrenamientos desc;",
"set @rank := 0;",
"insert into mob_ranking(id_usuario, tipo, rank)
select id_usuario, 4,@rank := @rank + 1 
from mob_usuarios order by puntos_edificios desc;");

        foreach ($querys as $q) $this->_db->query($q);
    }
    
    public function puntosAction() {      
      $ranking = array();
      $pos = 1;
      $page = 1;
      while (($data = Mob_Loader::getModel("Usuarios")->getRanking("to", $page)) != array()) {
        foreach ($data as $d) {
          $ranking[$d["id_usuario"]] = $pos;
          $pos++;  
        }
        $page++;  
      }
      
      $count = 200;
      $page = 1;
      $query = $this->_db->select()->from("mob_usuarios")->limitPage($page, $count)->order("id_usuario ASC");
      $date = date("Y-m-d");
      
      while (($data = $this->_db->fetchAll($query)) != array()) {
      
        foreach ($data as $d) {
          $insert = array(
                        "fecha" => $date, 
                        "id_usuario" => $d["id_usuario"], 
                        "puntos_edificios" => $d["puntos_edificios"],
                        "puntos_tropas" => $d["puntos_tropas"], 
                        "puntos_entrenamientos" => $d["puntos_entrenamientos"], 
                        "puntos_total" => $d["puntos_tropas"]+$d["puntos_entrenamientos"]+$d["puntos_edificios"],
                        "pos_ranking" => isset($ranking[$d["id_usuario"]]) ? $ranking[$d["id_usuario"]] : 0
                    );
          $this->_db->insert("mob_puntos", $insert);
        }
        
        $page = $page +1;
        
        $query->limitPage($page, $count);
      }
    
      echo "\n\nFIN\n\n";
    }
    
    public function nuevoataqueAction() {
      // sergo vs el_rubio
      Mob_Loader::getModel("Tropa")->update(array("maton" => 722724 , "portero" => 2125023, "acuchillador" => 88163, "pistolero" => 33372, 
      "espia" => 285, "transportista" => 3308, "tactico" => 126510, "francotirador" => 26579, "asesino" => 967, "ninja" => 1903, "demoliciones" => 33466), "id_edificio = 38350");
      Mob_Loader::getModel("Misiones")->insert(array(
        "id_usuario" => 144,
        "tropas" => Zend_Json::encode(array("maton" => 1, "portero" => 1493720, "pistolero" => 6453, "ocupacion" => 6, "espia" => 3760 , "cia" => 14495,
        "transportista" => 860, "tactico" => 36348, "francotirador" => 49268, "asesino" => 21743, "ninja" => 34, "demoliciones" => 47224)),
        "cantidad" => 100,
        "coord_dest_1" => 4,
        "coord_dest_2" => 4,
        "coord_dest_3" => 108,
        "coord_orig_1" => 4,
        "coord_orig_2" => 9, 
        "coord_orig_3" => 128, 
        "mision" => 1,
        "recursos_arm" => 0,
        "recursos_mun" => 0, 
        "recursos_alc" => 0, 
        "recursos_dol" => 0, 
        "fecha_inicio" => date("Y-m-d H:i:s"),
        "fecha_fin" =>  date("Y-m-d H:i:s"),
        "duracion" => 100
      ));
    }
    
    public function cuentasspaceAction() {
    $r1 = array("á", "é", "í", "ó", "ú");
    $r2 = array("a", "e", "i", "o", "u");
$ents = explode("\n", str_replace($r1, $r2, "Motor de combustión
Motor iónico
Propulsión espacio-temporal
Tecnología de colonización
Capacidad de carga mejorada
Tecnología de espionaje
Propulsión multidimensional
Tecnología de detección
Tecnología de camuflaje
Blindaje mejorado
Tecnología de defensa
Focalización energética
Ionización
Proyectiles explosivos
Proyectiles de plasma
Diplomacia"));

$entsEnglish = explode("\n","Combustion engine 
Ion engine
Space-curvature propulsion
Colonization tech 
Enhanced cargo capacity 
Espionage technology 
Space-folding propulsion
Sensor technology
Camouflage technology
Enhanced plating 
Shield technology 
Energy focalization
Ionization 
Explosive projectiles 
Plasma projectiles 
Diplomacy");

$entsFrances = explode("\n","Propulsion à combustion interne
Propulsion à ions
Propulsion hyperespace
Technique de colonisation
Capacité de charge augmentee
Technique d`espionnage
Propulsion Spatio-Temporelle
Technique de capteur
Technique de camouflage
Blindage elargi du vaisseau
Technique de bouclier
Alignement d`energie
Ionisation
Projectiles explosifs
Projectile de plasma
Diplomatie");

$entsItaliano = explode("\n","Propulsione a combustione interna
Propulsione a ioni
Propulsione Iperspaziale
Tecnica di colonizzazione
Aumento capacità di carico
Tecnica di spionaggio
Propulsione Iperspaziale avanzata
Tecnologia dei Sensori
Tecnica di camuffamento
Protezione delle navi
Tecnologia di schermatura
Sistemi elettrici
Ionizzatore
Proiettili esplosivi
Armi al plasma
Diplomazia");

$habs = explode("\n", str_replace($r1, $r2, "Centro de operaciones
Centro de investigación
Mina de hierro
Refinería de lutino
Plataforma de perforación
Planta química
Planta química mejorada
Almacén de hierro
Depósito de lutino
Tanques de agua
Tanque de hidrógeno
Hangar
Estación de defensa orbital
Escudo planetario
Central energética de fusión nuclear"));

$habsEnglish = explode("\n","Headquarter 
Research Lab 
Iron Mine 
Lutinum Refinery 
Drilling Rig 
Chemical Plant 
Enhanced chemical plant 
Iron storage 
Lutinum storage 
Water tank 
Hydrogen tank 
Shipyard 
Orbital defense station 
Planetary shield 
Fusion Powerplant");

$habsFrances = explode("\n","Centre de commandement 
Laboratoire 
Collecteur de fer 
Raffinerie de lutinium 
Tour de forage 
Usine Chimique 
Usine chimique avancee 
Reservoir de fer 
Reservoir de Lutinium 
Reservoir d`eau 
Reservoir d`hydrogène 
Chantier spatial 
Station de defense orbitale 
Bouclier planetaire 
Reacteur à fusion");

$habsItaliano = explode("\n","Comando centrale
Laboratorio di ricerca
Miniera di Ferro
Raffineria di Lutino
Piattaforma di perforazione
Fabbrica chimica
Impianto chimico avanzato
Deposito di Ferro
Deposito di Lutino
Serbatoio d`acqua
Serbatorio d`Idrogeno
Cantiere navale
Stazione orbitale di difesa
Schermo planetario
Reattore a fusione");

$entsEnglish = array_map("trim", $entsEnglish);
$habsEnglish = array_map("trim", $habsEnglish);
$entsFrances = array_map("trim", $entsFrances);
$habsFrances = array_map("trim", $habsFrances); 
$ents = array_map("trim", $ents);
$habs = array_map("trim", $habs);
$entsItaliano = array_map("trim", $entsItaliano);
$habsItaliano = array_map("trim", $habsItaliano);

$keyHabs = array("centroOperaciones", "centroInvestigacion", "minaHierro", "refineriaLutino", "plataformaPerforacion", "plQuimica", "plQuimicaMejorada", "almacenHierro", "depositoLutino",
"tanqueAgua", "tanqueHidrogeno", "hangar", "estacionDefensa", "escudoPlanetario", "centralEnergetica");

$keyEnts = array("motorCombustion", "motorIonico", "propulsionEspacio", "tecColonizacion", "capCargaMejorada", "tecEspionaje", "propMultidimensional", "tecDeteccion",
"tecCamuflaje", "blindajeMejorado", "tecDefensa", "focalizacionEnerg", "ionizacion", "proyExplosivos", "proyPlasma", "diplomacia");
   
      $jugadores = array();
    
      foreach (new DirectoryIterator(PUBLIC_PATH.'/cuentasOriginales/nuevas') as $fileInfo) {
        if("coltruman.txt" != $fileInfo->getFileName()) continue;
        if($fileInfo->isDot()) continue;
        $infoTxt = str_replace($r1, $r2, utf8_encode(file_get_contents($fileInfo->getPathname())));
        $infoTxt = str_replace($habsEnglish, $habs, $infoTxt);
        $infoTxt = str_replace($entsEnglish, $ents, $infoTxt);
        $infoTxt = str_replace($habsFrances, $habs, $infoTxt);
        $infoTxt = str_replace($entsFrances, $ents, $infoTxt);
        $infoTxt = str_replace($entsItaliano, $ents, $infoTxt);
        $infoTxt = str_replace($habsItaliano, $habs, $infoTxt);
        //echo $infoTxt;die();
        $infoTxt = explode("\n", $infoTxt);
        
        
        $jugadores[$fileInfo->getFileName()] = array("investigaciones" => array(), "edificios" => array(), "login" => "", "email" => "");
        
        // busco edificios
        foreach ($habs as $h) {//echo "BUSCO $h\n";
          foreach ($infoTxt as $k => $line) {
            //echo "LINE $line\n";
            if (strpos($line, $h) !== false) {
              $data = explode(" ", str_replace(array("-", "\t"), array(0, " "), $line));
              foreach ($data as $k1 => $v) {
                if (!is_numeric(trim($v))) unset($data[$k1]);
              }
              array_pop($data);
              //array_shift($data);
              $jugadores[$fileInfo->getFileName()]["edificios"][$h] = array_values($data);
              break;  
            }  
          }          
        }
        
        // busco investigaciones
        foreach ($ents as $e) {
          foreach ($infoTxt as $k => $line) {
            if (strpos($line, $e) !== false) {
              $jugadores[$fileInfo->getFileName()]["investigaciones"][$e] = ereg_replace("[^0-9]", "", $line);
              break;  
            }  
          }          
        }

        // busco email / nombre usuario /coordenadas
          foreach ($infoTxt as $k => $line) {
            if (strpos($line, "@") !== false) {
              preg_match_all("/[\._a-zA-Z0-9-]+@[\._a-zA-Z0-9-]+/i", $line, $matches);
              if (isset($matches[0][0])) $jugadores[$fileInfo->getFileName()]["email"] = $matches[0][0];
            }
            if (strpos($line, "login") !== false || strpos($line, "Login") !== false) {
              $login = trim(array_pop(explode(" ", trim($line))));
              $jugadores[$fileInfo->getFileName()]["login"] = $login;  
            }
            if (strpos($line, "Coordenadas") !== false) {
              $coordenadas = explode("\t", trim(substr($line, 11)));
              $jugadores[$fileInfo->getFileName()]["coordenadas"] = $coordenadas;  
            }              
          }                
      }

      $totalEdificios = 0;
      
      $barrios = array();
      $barrio = 1;
      
      /*
      20 25		
      21 25	  22 25	  22 26
      23 24	  23 25	  23 26
      24 24	  24 25	  24 26 
      25 24	  25 25 	25 26
      26 24	  26 25	  26 26 
      27 24	  27 25	  27 26
      */
      
      
      $barrios2 = array(1 => "22-25", "22-26", "23-24", "23-25", "23-26", "24-24", "24-25", "24-26", "25-24", "25-25", "25-26",
      "26-24", "26-25", "26-26", "27-24", "27-25", "27-26");
      
      // demo va al 20-25 y 21-25
      foreach ($jugadores as $jugador => $data) {
        if (empty($data["email"])) echo "$jugador no tiene email\n";
        if (empty($data["login"])) echo "$jugador no tiene login\n";
        
        if (empty($data["investigaciones"])) echo "$jugador no tiene investigaciones\n";
        else {
          foreach ($data["investigaciones"] as $k => $v) {
            if (empty($v)) echo "investigacion vacia $jugador: $k\n";
          }
        }
        //echo "Jugador $jugador ".sizeof($data["edificios"]["Mina de hierro"])." edificios \n";
        $edisJugador = sizeof($data["edificios"]["Mina de hierro"]);
        if ($edisJugador > 255) {
          echo "El jugador $jugador tiene mas de 255 edificios\n";
          continue;
        }
        if ($totalEdificios + $edisJugador > 255) {
          $barrio++;
          $totalEdificios = 0;  
        }
        $totalEdificios += $edisJugador; 
        $barrios[$barrio][] = $jugador;
        $edificiosJug = 0;
        if (empty($data["edificios"]["Mina de hierro"])) echo "$jugador no tiene edificios\n";
        else {
          if (sizeof($data["edificios"]) != 15) {
            echo "al jugador $jugador le faltan edificios\n";
          } else {
            foreach ($data["edificios"] as $k => $v) {
              if ($edificiosJug == 0) $edificiosJug = sizeof($v);
              elseif ($edificiosJug != sizeof($v)) echo "error cantidad edificios jugador $jugador\n";
              if (empty($v)) echo "edificios vacio $jugador: $k\n";
            }
          }
        }
      }
      
      //var_dump($jugadores);return;
      $habs = array_combine($habs, $keyHabs);
      $ents = array_combine($ents, $keyEnts);
        
        foreach ($jugadores as $k => $j) {
          $totalEdificios = sizeof(reset($j["edificios"]));
          // creo el jugador
          $idUsuario = Mob_Loader::getModel("Usuarios")->insert(
                            array("usuario" => $j["login"], "email" => $j["email"], "pass" => damePassword()));
                            //var_dump($idUsuario, $j["investigaciones"]);die();
          // le seteo los entrenamientos
          foreach ($j["investigaciones"] as $inv => $val) {
            Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, $ents[$inv], $val);
          }
          
          //le agrego los edificios
          foreach (range(0, $totalEdificios-1) as $numeroEdificio) {
            $coords = explode(":", $j["coordenadas"][$numeroEdificio]);
            try {
            $idEdificio = Mob_Loader::getModel("Edificio")->ocupar($idUsuario, array($coords[0], $coords[1], $coords[2]), 50000, 50000, 50000, 50000);
            } catch (Exception $e) {
              var_dump($e->getTraceAsString());
              die();
            }
            if ($idEdificio == false) die("ERROR $idUsuario edificio numero $numeroEdificio ".$coords[0].":".$coords[1].":".$coords[2]);
            //var_dump($idEdificio);return;
            Mob_Loader::getModel("Edificio")->update(array("last_update" => date("Y-m-d H:i:s")), "id_edificio = ".(int)$idEdificio);
            foreach ($habs as $key => $kay2) {
              try {
              Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, $kay2, $j["edificios"][$key][$numeroEdificio]);
              } catch (Exception $e) {
                echo "ERROR jugador $jugador edificio $idEdificio habitacion $kay2 valor ".$j["edificios"][$key][$numeroEdificio]."\n";
                die();
              }
            }
          }
          //return;
          $totalReal = Mob_Loader::getModel("Edificio")->getTotalEdificios($idUsuario);
          if ($totalReal != $totalEdificios) die("Faltan edificios $k, tiene $totalReal y deberia tener $totalEdificios");
        }      
      
       //var_dump($jugadores);
       return;
      /*$habs = array_combine($habs, $keyHabs);
      $ents = array_combine($ents, $keyEnts);
      
      foreach ($barrios as $k => $jugs) {
        $numeroPlaneta = 1;
        $coords = explode("-", $barrios2[$k]);
        //if ($coords[0] != 26 || $coords[1] != 25) continue;
        foreach ($jugs as $j) {
          $totalEdificios = sizeof($jugadores[$j]["edificios"]["Centro de operaciones"]);
          // creo el jugador
          $idUsuario = Mob_Loader::getModel("Usuarios")->insert(
                            array("usuario" => $jugadores[$j]["login"], "email" => $jugadores[$j]["email"], "pass" => damePassword()));
          // le seteo los entrenamientos
          foreach ($jugadores[$j]["investigaciones"] as $inv => $val) {
            Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, $ents[$inv], $val);
          }
          
          //le agrego los edificios
          foreach (range(0, $totalEdificios-1) as $numeroEdificio) {
            $idEdificio = Mob_Loader::getModel("Edificio")->ocupar($idUsuario, array($coords[0], $coords[1], $numeroPlaneta), 50000, 50000, 50000, 50000);
            if ($idEdificio == false) die("ERROR $idUsuario edificio numero $numeroEdificio ".$coords[0].":".$coords[1].":".$numeroPlaneta);
            //var_dump($idEdificio);return;
            foreach ($habs as $key => $kay2) {
              try {
              Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, $kay2, $jugadores[$j]["edificios"][$key][$numeroEdificio]);
              } catch (Exception $e) {
                echo "ERROR jugador $jugador edificio $idEdificio habitacion $kay2 valor ".$jugadores[$j]["edificios"][$key][$numeroEdificio]."\n";
                die();
              }
            }
            $numeroPlaneta++;
          }
          //return;
          $totalReal = Mob_Loader::getModel("Edificio")->getTotalEdificios($idUsuario);
          if ($totalReal != $totalEdificios) die("Faltan edificios $j, tiene $totalReal y deberia tener $totalEdificios");
        }
      }*/
      
      // ahora exporto a Demo que tiene 300 edificios
      /*$j = "Demo.txt";
      $idUsuario = Mob_Loader::getModel("Usuarios")->insert(
                            array("usuario" => $jugadores[$j]["login"], "email" => $jugadores[$j]["email"], "pass" => damePassword()));
        // le seteo los entrenamientos
          foreach ($jugadores[$j]["investigaciones"] as $inv => $val) {
            Mob_Loader::getModel("Entrenamiento")->setEntrenamiento($idUsuario, $ents[$inv], $val);
          }
          $totalEdificios = sizeof($jugadores[$j]["edificios"]["Centro de operaciones"]);    
          foreach (range(0, $totalEdificios-1) as $numeroEdificio) {
            $numeroPlaneta = $numeroEdificio+1 <= 255 ? $numeroEdificio+1 : $numeroEdificio+1-255;
            $coord1 = $numeroEdificio+1 <= 255 ? 20 : 21;
            $coord2 = 25;
            $idEdificio = Mob_Loader::getModel("Edificio")->ocupar($idUsuario, array($coord1, $coord2, $numeroPlaneta), 50000, 50000, 50000, 50000);
            //var_dump($idEdificio);return;
            foreach ($habs as $key => $kay2) {
              try {
              Mob_Loader::getModel("Habitacion")->setHabitacion($idEdificio, $kay2, $jugadores[$j]["edificios"][$key][$numeroEdificio]);
              } catch (Exception $e) {
                echo "ERROR jugador $jugador edificio $idEdificio habitacion $kay2 valor ".$jugadores[$j]["edificios"][$key][$numeroEdificio]."\n";
              }
            }
          }*/
      

    }
    
    public function enviaremailspaceAction() { die();
          $usuarios = Mob_Loader::getModel("Usuarios")->fetchAll()->toArray();
          $cabeceras  = 'MIME-Version: 1.0' . "\r\n";
          $cabeceras .= 'From: Space4k-Plus <support@space4k-plus.com>' . "\r\n";
          
          $aviso = "Hola! Space4k-Plus es un clon de space4k con muchas mejoras respecto del original, 
          actualmente faltan ajustar unos ultimos detalles pero esta casi terminado y 100% funcional.
          
          Te enviamos este mail porque mas de 120 cuentas fueron salvadas del juego original y la tuya es una de esas.
          
          Si quieres acceder a ella, el usuario es: #1 y el password es: #2. 
          
          Te esperamos en el juego y en el foro para que space vuelva a ser lo que fue y mucho mas!
          
          http://www.space4k-plus.com
          http://board.space4k-plus.com
          ";

          foreach ($usuarios as $u) {
            echo "email enviado a ".$u["email"]."<br />\n";
            mail($u["email"], "Space4k-Plus: datos de tu cuenta", str_replace(array("#1", "#2"), array($u["usuario"], $u["pass"]), $aviso), $cabeceras);
          }    
    }
    
    public function copiartextosAction() {
      echo "Copiar textos \n";
      if (!isset($_SERVER["argv"][3])) die("DEBES INDICAR EL CODIGO ISO DEL NUEVO IDIOMA");
      
      $textos = Mob_Loader::getModel("Textos");
      
      $page = 1;
      $count = 200;
      $query = $textos->select()->where("idioma = 'es'")->order("id_texto ASC")->limitPage($page, $count); 
      
      while (($data = $textos->fetchAll($query)->toArray()) != array()) {
      
        foreach ($data as $d) {
          unset($d["id_texto"]);
          $d["idioma"] = $_SERVER["argv"][3];
          $textos->insert($d);   
        }
      
        unset($data);
        $page = $page+1;
        $query->limitPage($page, $count);
      }
      
      echo "\n\nTEXTOS CREADOS CORRECTAMENTE\n\n";
    }
    
    public function exportartextosAction() {      
      Mob_Loader::getModel("Textos")->export();
      echo "\n\nTEXTOS EXPORTADOS CORRECTAMENTE\n\n";
    }
    
    public function exporthammondAction() {
      $usuarios = Mob_Loader::getModel("Usuarios");
      $entrenamientos = Mob_Loader::getModel("Entrenamiento");
      $queryUsuarios = $usuarios->select()->order("usuario ASC");   var_dump(getcwd());
      $queryHabitaciones = "SELECT h.* FROM mob_edificios e LEFT JOIN mob_habitaciones h ON h.id_edificio = e.id_edificio WHERE e.id_usuario = %s";
      foreach ($usuarios->fetchAll($queryUsuarios) as $u) {
        $return = "Habitaciones\n";
        foreach ($this->_db->fetchAll(sprintf($queryHabitaciones, $u["id_usuario"])) as $k => $h) {
          unset($h["id_habitacion"], $h["id_edificio"], $h["id_usuario"]);
          if ($k == 0) $return .= implode("\t", array_keys($h))."\n";
          $return .= implode("\t", $h)."\n";
        }
        
        $ent = $entrenamientos->fetchAll("id_usuario = ".$u["id_usuario"])->toArray();
        $return .= "Entrenamientos\n";
        if (empty($ent[0])) {
          echo "El usuario ".$u["id_usuario"]." no tiene entrenamientos\n";
          continue;
        }
        unset($ent[0]["id_entrenamiento"], $ent[0]["id_usuario"]);
        $return .= implode("\t", array_keys($ent[0]))."\n";
        $return .= implode("\t", $ent[0])."\n";
        
        file_put_contents("hammond/".md5("holacomova".$u["id_usuario"]).".txt", $return);
        
      }
      
    }     
    
    public function restaurarcuentaAction() {
      $idUsuario = 2478;
      
      $dbName = "vendetta_plus_031811precambios";
      
      // usuarios
      $query = $this->_db->select()->from("$dbName.mob_usuarios")->where("id_usuario = ?", $idUsuario)->limit(1);
      
      $data = $this->_db->fetchAll($query);
      echo armarInsert("mob_usuarios", $data[0])."\n\n";
      
      $control = array();
      $control[] = "SELECT COUNT(*) FROM mob_usuarios WHERE id_usuario = $idUsuario;";
      
      // entrenamientos
      $query = $this->_db->select()->from("$dbName.mob_entrenamientos")->where("id_usuario = ?", $idUsuario)->limit(1);
      $data = $this->_db->fetchAll($query);
      echo armarInsert("mob_entrenamientos", $data[0])."\n\n";
      $control[] = "SELECT COUNT(*) FROM mob_entrenamientos WHERE id_entrenamiento = ".$data[0]["id_entrenamiento"].";";
      // edificios
      $query = $this->_db->select()->from("$dbName.mob_edificios")->where("id_usuario = ?", $idUsuario);
      $ids = array("edificios" => array(), "coordenadas" => array(), "tropas" => array(), "habitaciones" => array());
      foreach ($this->_db->fetchAll($query) as $d) {
        echo armarInsert("mob_edificios", $d)."\n\n";
        $ids["edificios"][] = $d["id_edificio"];
        $ids["coordenadas"][] = "(coord1 = ".$d["coord1"]." AND coord2 = ".$d["coord2"]." AND coord3 = ".$d["coord3"].")";
        // habitaciones
        $queryHab = $this->_db->select()->from("$dbName.mob_habitaciones")->where("id_edificio = ?", $d["id_edificio"])->limit(1);
        $dataHab = $this->_db->fetchAll($queryHab);
        echo armarInsert("mob_habitaciones", $dataHab[0])."\n\n";
        $ids["habitaciones"][] = $dataHab[0]["id_habitacion"];
        // tropas
        $queryTro = $this->_db->select()->from("$dbName.mob_tropas")->where("id_edificio = ?", $d["id_edificio"])->limit(1);
        $dataTro = $this->_db->fetchAll($queryTro);
        //echo armarInsert("mob_tropas", $dataTro[0])."\n\n";
        $ids["tropas"][] = $dataTro[0]["id_tropa"];
      }
      
      $control[] = "SELECT COUNT(*) FROM mob_edificios WHERE id_edificio IN (".implode(", ", $ids["edificios"]).");";
      $control[] = "SELECT COUNT(*) FROM mob_tropas WHERE id_tropa IN (".implode(", ", $ids["tropas"]).");";
      $control[] = "SELECT COUNT(*) FROM mob_habitaciones WHERE id_habitacion IN (".implode(", ", $ids["habitaciones"]).");";
      $control[] = "SELECT COUNT(*) FROM mob_edificios WHERE (".implode(" OR ", $ids["coordenadas"]).");";
      
     echo implode($control, "\n");   
    }

}      

function damePassword() {
  $str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890";
  $cad = "";
  for($i=0;$i<12;$i++) {
  $cad .= substr($str,rand(0,62),1);
  }
  return $cad;
}

function armarInsert($tabla, $data) {
  $sql = "INSERT INTO $tabla (%s) VALUES (%s);\n";
  $campos = $values = array();
  foreach ($data as $k => $v) {
    $campos[] = $k;
    $values[] = "'".addslashes($v)."'";
  }
  return sprintf($sql, implode(", ", $campos), implode(", ", $values));
}