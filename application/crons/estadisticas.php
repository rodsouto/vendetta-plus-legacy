#!/usr/bin/php
<?php
 die();
include "base.php";

$file = dirname(__FILE__).DIRECTORY_SEPARATOR."estadisticas.pid";



// si existe el archivo y fue creado hace menos de 120 segundos, cortamos la ejecucion

if (file_exists($file)) {

  $segundos = time() - filemtime($file);

  if ($segundos < 240) {

    echo "Ya habia un proceso ejecutandose\n";

    die();

  }

}

echo "Creo archivo de control...\n";

file_put_contents($file, getmypid());



class CronJob_Updater {

    

    protected $_now;

    protected $_db;

    protected $_pluginUpdate;

    public function start() {

        echo "Con transacciones...\n";

        $this->_db = Zend_Db_Table_Abstract::getDefaultAdapter();    

        $this->_now = date("Y-m-d H:i:s");

        $this->actualizarHabitaciones();

        $this->actualizarEntrenamientos(); 

        $this->actualizarMisiones();

        $this->actualizarTropas();                    

    }



    protected function _getPluginUpdate() {

    

      if ($this->_pluginUpdate == null) $this->_pluginUpdate = new Mob_Controller_Plugin_Update;

      

      return $this->_pluginUpdate;

    }



    /*public function updateRecursos($idUsuario) {

      $this->_getPluginUpdate()->updateRecursos($idUsuario);

    }*/



    protected function _sumarRecursos($idEdificio, $arm = 0, $mun = 0, $dol = 0, $alc = 0) {

        return Mob_Loader::getModel("Edificio")->sumarRecursos($idEdificio, $arm, $mun, $dol, $alc);

    }

    

    public function actualizarHabitaciones() {
        $idUsuariosActualizados = array();
        try {

          $this->_db->beginTransaction();

          foreach (Mob_Loader::getModel("Habitacion_Nueva")->getFinalizadas() as $v) {

              echo "Actualizo habitacion ".$v["habitacion"]." edificio ".$v["id_edificio"]."\n";

              $nuevoNivel = Mob_Loader::getModel("Habitacion")->incrementar($v["id_edificio"], $v["habitacion"]);

              

              Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "habitacion_finalizada", "Habitacion finalizada: ".

                  Mob_Loader::getHabitacion($v["habitacion"])->getNombre().

                  " nivel ".$nuevoNivel." edificio ".$v['coord']);
              $idUsuariosActualizados[$v["id_usuario"]] = 1;

          }

          

          Mob_Loader::getModel("Habitacion_Nueva")->deleteFinalizadas();

          foreach (array_keys($idUsuariosActualizados) as $idUsuario) {
            Mob_Cache_Factory::getInstance("query")->remove('getHabitacionesConstruyendo'.$idUsuario);
          }

          $this->_db->commit();

        } catch (Exception $e) {

          $this->_db->rollBack();

          echo "Transaction error habitaciones: ".$e->getMessage()."\n";

        }        

    }

    

    public function actualizarEntrenamientos() {

        try {

          $this->_db->beginTransaction();

          foreach (Mob_Loader::getModel("Entrenamiento_Nuevo")->getFinalizados() as $v) {

              echo "Actualizo entrenamiento ".$v["entrenamiento"]." edificio ".$v["id_edificio"]."\n";

              $nuevoNivel = Mob_Loader::getModel("Entrenamiento")->incrementar($v["id_usuario"], $v["entrenamiento"]);

              

              Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "entrenamiento_completado", "Entrenamiento completado: ".

              Mob_Loader::getEntrenamiento($v["entrenamiento"])->getNombre()." nivel ".$nuevoNivel);

  

          }

          

          Mob_Loader::getModel("Entrenamiento_Nuevo")->deleteFinalizados();

          $this->_db->commit();

        } catch (Exception $e) {

          $this->_db->rollBack();

          echo "Transaction error entrenamientos: ".$e->getMessage()."\n";

        }        

        

    }

    

    protected function _agregarTropa($id_edificio, $tropa, $cantidad) {

        return Mob_Loader::getModel("Tropa")->sumarTropas($id_edificio, array($tropa => $cantidad));

    }

    

    public function actualizarTropas() {


        $idEdificiosFinalizados = array();
        foreach (Mob_Loader::getModel("Tropa_Nueva")->getEdificiosFinalizados() as $v) {

            // todas las trpas en construccion en ese edificio, hago el query dos veces para procesar

            // edificio por edificio y no tener que controlarlo por PHP

            $tropas = Mob_Loader::getModel("Tropa_Nueva")->getByIdEdificio($v["id_edificio"]);

            

            if (empty($tropas) || strtotime($tropas[0]["fecha_fin"])>time()) continue;

            

            // la fecha fin de la primer tropa, para la tropa siguiente le debo sumar la duracion de dicha tropa

            $timestampFechaFin = strtotime($tropas[0]["fecha_fin"]);

            

            foreach ($tropas as $k => $v) {

                

                // la fecha fin es posterior al momento actual

                if ($timestampFechaFin > time()) {

                    //echo "cambio fecha fin <br>";

                  Mob_Loader::getModel("Tropa_Nueva")->setFechaFin($v["id_tropa_nueva"], date("Y-m-d H:i:s", $timestampFechaFin));               

                } else {

                  // aca entra por lo menos la primera vez 

                  //echo "termine una tropa<br>";

                  try {

                    $this->_db->beginTransaction();
                    $idEdificiosFinalizados[$v["id_edificio"]] = 1;
                    $this->_agregarTropa($v["id_edificio"], $v["tropa"], $v["cantidad"]);

                    

                    Mob_Loader::getModel("Usuarios")->sumarPuntosTropa($v["id_usuario"], $v["cantidad"] * Mob_Loader::getTropa($v["tropa"])->getPuntos());

                    

                    Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "tropa_entrenada", "Unidad completada: ".$v["cantidad"]." ".

                                                              Mob_Loader::getTropa($v["tropa"])->getNombre()." edificio ".Mob_Loader::getModel("Edificio")->getCoord($v["id_edificio"], true));

                    

                    // elimino la tropa que ya fue construida

                    Mob_Loader::getModel("Tropa_Nueva")->delete("id_tropa_nueva = " . $v["id_tropa_nueva"]);

                    $this->_db->commit();

                  } catch (Exception $e) {

                    $this->_db->rollBack();

                    echo "Transaction error habitaciones: ".$e->getMessage()."\n";

                  }        

                  // a la tropa siguiente le pongo la nueva fecha de finalizacion

                  if (isset($res[$k+1])) {

                    

                    $timestampFechaFin += $tropas[$k+1]["duracion"]; 

                    

                    $tropas[$k+1]["fecha_fin"] = date("Y-m-d H:i:s", $timestampFechaFin);

                  } else {

                  //echo "Ultima tropa<br>";

                    // era la ultima tropa, salimos

                    break;

                  }

                }

            }

        }
        
        foreach (array_keys($idEdificiosFinalizados) as $idEdificio) {
            Mob_Cache_Factory::getInstance("html")->remove('tropasVisionGeneral'.$idEdificio);
        }

    }

        

    protected function _regresarTropas($v) {

        Mob_Loader::getModel("Misiones")->regresar($v);

    }

    

    public function _estacionarTropas($v) {

        if (!Mob_Loader::getModel("Edificio")->esCoordenadaMia($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"], $v["id_usuario"])) return false;

        // estaciono tropas

        $idEdificio = Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"]);



        foreach (Zend_Json::decode($v["tropas"]) as $tropa => $cantidad) {

            $this->_agregarTropa($idEdificio, strtolower($tropa), $cantidad);

        }

        

        $this->_sumarRecursos($idEdificio, $v["recursos_arm"], $v["recursos_mun"], $v["recursos_dol"], $v["recursos_alc"]);

                            

        return true;

     }

    

    public function actualizarMisiones() {

    

        $res = Mob_Loader::getModel("Misiones")->getMisionesSimple();



        if (empty($res)) return false;

        $idEdificiosFinalizados = array();
        $idUsuariosFinalizados = array();

        try {

          $this->_db->beginTransaction();

          foreach ($res as $v) {

              echo "Mision tipo ".$v["mision"]."\n";

              //1 "Atacar", 2 "Estacionar", 3 "Transportar recursos", 4 "Ocupar edificio"

              $idUsuarioDefensor = Mob_Loader::getModel("Edificio")->getUsuarioByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"], true);

              $idUsuariosFinalizados[$v["id_usuario"]] = 1;
              if ($idUsuarioDefensor != null) $idUsuariosFinalizados[$idUsuarioDefensor] = 1;

              //if ($idUsuarioDefensor != null) $this->updateRecursos($idUsuarioDefensor);

               

              switch($v["mision"]) {

                  case 1:

                      // Atacar

                      // ataco...                      

                        $idEdificioAtacante = Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_orig_1"], $v["coord_orig_2"], $v["coord_orig_3"]);

                        

                        if ($idEdificioAtacante == null) continue;

                                   

                        if ($idUsuarioDefensor === null) {

                          // el edificio no es de nadie

                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "edificio_no_existe", "El edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]." no existe.");

                        } elseif ($idUsuarioDefensor == $v["id_usuario"]) {

                          // no puede atacarse a si mismo

                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "ataque_a_ti_mismo", "No puedes atacarte a ti mismo.");

                        } else {

                          

                          $combatManager = new Mob_Combat_Manager($v);

                          $htmlBatalla = $combatManager->getHtml();

  

                          $idEdificioDefensor = $combatManager->getIdEdificioDefensor();

                          $idBatalla = Mob_Loader::getModel("Batallas")->insert(array("html" => $htmlBatalla, "atacante" => $v["id_usuario"], "defensor" => $idUsuarioDefensor));

                          

                          $mensajeBatalla = "<a href='/mob/batallas/ver?id=$idBatalla'>Unidades involucradas en la pelea (".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"].")</a>";

                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "unidades_involucradas_pelea", $mensajeBatalla);

                          

                          $mensajeBatalla = "<a href='/mob/batallas/ver?id=$idBatalla'>Tu edificio ha sido atacado (".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"].")</a>";

                          Mob_Loader::getModel("Mensajes")->aviso($idUsuarioDefensor, "unidades_involucradas_pelea", $mensajeBatalla);                                          

                          

                          $v["tropas"] = Zend_Json::encode($combatManager->getTropasRestantesAtacante());

                          

                          $robo = $combatManager->getRobo();

                          $v["recursos_arm"] = $robo["arm"];

                          $v["recursos_mun"] = $robo["mun"];

                          $v["recursos_dol"] = $robo["dol"];

                          $v["recursos_alc"] = $robo["alc"];

                          

                          $this->_sumarRecursos($idEdificioDefensor, -1*$robo["arm"], -1*$robo["mun"], -1*$robo["dol"], -1*$robo["alc"]);

                      }

                      

                      $this->_regresarTropas($v);

                  break;

                  case 2:

                      // Estacionar

                      if ($this->_estacionarTropas($v)) {
                          $idEdificiosFinalizados[Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_orig_1"], $v["coord_orig_2"], $v["coord_orig_3"])] = 1;
                          $idEdificiosFinalizados[Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"])] = 1;
                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "tropas_estacionadas", "Tropas estacionadas en el edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]);                    

                      } else {

                          // regreso

                          $this->_regresarTropas($v);

                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "imposible_estacionar", "No puedes estacionar tropas en un edificio que no es tuyo");

                      }

                  break;

                  case 3:

                      // Transportar

                      

                      if ($idUsuarioDefensor != null) {

                        // envio recursos a algun edificio existente                    

                        $this->_sumarRecursos(

                            Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"]), 

                            $v["recursos_arm"],

                            $v["recursos_mun"],

                            $v["recursos_dol"],

                            $v["recursos_alc"]);

                        

                        if ($idUsuarioDefensor == $v["id_usuario"]) {

                            // me envie recursos a mi mismo

                            Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "recursos_recibidos", "Recursos recibidos en el edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"].": Armas: ".$v["recursos_arm"]." Municion: ".$v["recursos_mun"]." Alcohol: ".$v["recursos_alc"]." Dolar: ".$v["recursos_dol"]);

                        } else {

                            // envie recursos a otra persona

                            Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "recursos_entregados", "Recursos entregados a <a href='/mob/jugador?id=$idUsuarioDefensor'>".Mob_Loader::getModel("Usuarios")->getUsuario($idUsuarioDefensor)."</a> en el edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]." Armas: ".$v["recursos_arm"]." Municion: ".$v["recursos_mun"]." Alcohol: ".$v["recursos_alc"]." Dolar: ".$v["recursos_dol"]);

                            Mob_Loader::getModel("Mensajes")->aviso($idUsuarioDefensor, "recursos_recibidos", "Recursos recibidos de <a href='/mob/jugador?id={$v['id_usuario']}'>".Mob_Loader::getModel("Usuarios")->getUsuario($v["id_usuario"])."</a> en el edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]." Armas: ".$v["recursos_arm"]." Municion: ".$v["recursos_mun"]." Alcohol: ".$v["recursos_alc"]." Dolar: ".$v["recursos_dol"]);

                        }

                      } else {

                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "recursos_entregados", "Recursos entregados al edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"].": Armas: ".$v["recursos_arm"]." Municion: ".$v["recursos_mun"]." Alcohol: ".$v["recursos_alc"]." Dolar: ".$v["recursos_dol"]);

                      }

                      

                      $v["recursos_arm"] = $v["recursos_mun"] = $v["recursos_dol"] = $v["recursos_alc"] = 0;                    

                      $this->_regresarTropas($v);

                  break;

                  case 4:

                      // Ocupar

                      if (Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"]) == 0) {

                          // no esta ocupado

                                                    

                          $v["tropas"] = Zend_Json::decode($v["tropas"]);

                          if (isset($v["tropas"]["Ocupacion"])) {

                              Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "edificio_ocupado", "Nuevo edificio ocupado ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]);

                              // ocupo el edificio con los recursos transportados y estaciono las tropas

                              $v["tropas"]["Ocupacion"]--;

                              Mob_Loader::getModel("Edificio")->ocupar($v["id_usuario"], 

                                  array($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"])

                              );
                              
                              Mob_Cache_Factory::getInstance("query")->remove('getEdificios'.$v["id_usuario"]);
                              Mob_Cache_Factory::getInstance("query")->remove('getTodosEdificios'.$v["id_usuario"]);
                              Mob_Cache_Factory::getInstance("query")->remove('getTotalEdificios'.$v["id_usuario"]);

                          } else {

                              Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "ocupacion_sin_tropa", "Para ocupar el edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]." necesitas enviar una Tropa de Ocupacion");

                              // quiso ocupar pero no mando una tropa de ocupacion...

                          }

                          

                          

                      } else {

                          // esta ocupado

                          Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "edificio_ya_ocupado", "El edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]." ya esta ocupado");

                      }

                      

                      $this->_regresarTropas($v);

                  break;

                  case 5:

                      /// Regresar

                      $txtRecursos = "";

                      if ($v["recursos_arm"] > 0 || $v["recursos_mun"] > 0 || $v["recursos_alc"] > 0 || $v["recursos_dol"] > 0) {

                          $txtRecursos = " Armas: ".$v["recursos_arm"]." Municion: ".$v["recursos_mun"]." Alcohol: ".$v["recursos_alc"]." Dolar: ".$v["recursos_dol"];

                      }

                      

                      Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "tropa_regreso", "La tropa ha regresado (edificio ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"].")".$txtRecursos);
                      $idEdificiosFinalizados[Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_orig_1"], $v["coord_orig_2"], $v["coord_orig_3"])] = 1;
                      $this->_estacionarTropas($v);

                  break;

              }

          }

          Mob_Loader::getModel("Misiones")->deleteFinalizadas();

          $this->_db->commit();

        } catch (Exception $e) {

          $this->_db->rollBack();

          echo "Transaction error habitaciones: ".$e->getMessage()."\n";

        }     

        foreach (array_keys($idEdificiosFinalizados) as $idEdificio) {
            Mob_Cache_Factory::getInstance("html")->remove('tropasVisionGeneral'.$idEdificio);
        }
        
        foreach (array_keys($idUsuariosFinalizados) as $idUsuario) {
            Mob_Cache_Factory::getInstance("query")->remove('getMisiones'.$idUsuario);
        }
        unset($res);
        $this->actualizarMisiones();      
    }

    

    public function actualizarPuntos($id_usuario = 0) {

        /* 

        if (!empty($id_usuario)) {

          $jugadores = Mob_Loader::getModel("Usuarios")->find($id_usuario);

        } else {

          set_time_limit(0);

          $jugadores = Mob_Loader::getModel("Usuarios")->fetchAll();

        }

        

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

        

        foreach ($jugadores as $jug) {

        

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



            $jug->puntos_edificios = $totalPuntosHabitaciones;

            $jug->puntos_tropas = $totalPuntosTropas;            

            $jug->save(); 



        }*/

    }



}



error_reporting(E_ALL);

ini_set("display_errors", true);

//Zend_Db_Table_Abstract::getDefaultAdapter()->getProfiler()->setEnabled(true);

try {

$cron = new CronJob_Updater;

$cron->start();

} catch (Exception $e) {

  var_dump($e->getMessage(), $e->getTraceAsString());

}

unlink($file);

echo "END... ".date("Y-m-d H:i:s");


/*
$db = Zend_Db_Table_Abstract::getDefaultAdapter();

$profiler = $db->getProfiler();
                              

$totalTime    = $profiler->getTotalElapsedSecs();

$queryCount   = $profiler->getTotalNumQueries();

$longestQuery = array();

$allQuerys = array();

foreach ($profiler->getQueryProfiles() as $query) {

  if (!isset($longestQuery[$query->getQueryType()])) $longestQuery[$query->getQueryType()] = array(0, null);

  if ($query->getElapsedSecs() > $longestQuery[$query->getQueryType()][0]) {

      $longestQuery[$query->getQueryType()] = array($query->getElapsedSecs(), $query->getQuery());

  }

  $allQuerys[] = $query->getQuery();

}

$txt = 'Executed ' . $queryCount . ' queries in ' . $totalTime ." seconds\n\n";

$txt .= 'Average query length: ' . $totalTime / $queryCount ." seconds\n\n";

$txt .= 'Queries per second: ' . $queryCount / $totalTime . "\n\n";

//$txt .= "Longest query: " . $longestQuery . "\n";



$txt .= "Longest querys: \n";

foreach ($longestQuery as $q) $txt .= ($q[1]. "\n\n");

$txt .= "\nAll querys:\n " . implode("\n\n", $allQuerys) . "\n";



echo $txt; */