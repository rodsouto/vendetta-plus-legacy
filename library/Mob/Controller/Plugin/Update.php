<?php

class Mob_Controller_Plugin_Update extends Zend_Controller_Plugin_Abstract {
    
    protected $_now;
    protected $_misiones = 1;
    protected $_debug = false;
    
    public function __construct() {
        //echo "Con transacciones...\n";

        $this->_db = Zend_Db_Table_Abstract::getDefaultAdapter();    

        $this->_now = date("Y-m-d H:i:s");
        $this->_nowTime = time();              
    }
    
    public function setDebug($flag) {
      $this->_debug = (bool)$flag;
      return $this;
    }
    
    public function routeShutdown(Zend_Controller_Request_Abstract $request) {
        
        if (!Zend_Auth::getInstance()->hasIdentity()) return;        
                               
        $idUsuario = Zend_Auth::getInstance()->getIdentity()->id_usuario; 
        
        $namespaceEdificio = new Zend_Session_Namespace("edificio");             
        $this->updateRecursos($namespaceEdificio->edificio);
        $this->actualizarEntrenamientos($idUsuario);
        $this->actualizarHabitaciones($idUsuario);
        $this->actualizarMisiones($idUsuario);
        $this->actualizarTropas($idUsuario);
        Mob_Loader::getModel("Usuarios")->update(array("last_online" => date("Y-m-d H:i:s")), "id_usuario = $idUsuario");        
    }
    
    public function postDispatch(Zend_Controller_Request_Abstract $request) {

        if ($request->getParam("updatePuntos") != null) {
          $this->actualizarPuntos($request->getParam("updatePuntos"));  
        }
        
    }    

    public function updateRecursos($idEdificio = array()) {
        if (!is_array($idEdificio)) $idEdificio = array($idEdificio);
        
        /* ahora voy edificio por edificio actualizando */        
        foreach (Mob_Loader::getModel("Edificio")->find($idEdificio) as $v) {
            /* diferencia de tiempo */
            $dif = $this->_nowTime-strtotime($v["last_update"]);

            $habs = Mob_Loader::getModel("Habitacion")->getByIdEdificio($v["id_edificio"]);

            $produccion = Mob_Habitacion_Manager::getProduccion($habs[Mob_Server::getNameHabRecurso(1)], 
                                                                  $habs[Mob_Server::getNameHabRecurso(2)],
                                                                  $habs[Mob_Server::getNameHabRecurso(3)],
                                                                  $habs[Mob_Server::getNameHabRecurso(4)],
                                                                  $habs[Mob_Server::getNameHabRecurso(5)],
                                                                  $v["id_edificio"]);      
             
            $this->_sumarRecursos($v["id_edificio"],
                                    (int)ceil($produccion["arm"]/3600*$dif),
                                    (int)ceil($produccion["mun"]/3600*$dif),
                                    (int)ceil($produccion["dol"]/3600*$dif),
                                    (int)ceil($produccion["alc"]/3600*$dif) 
                                    );
                                    
          /* actualizo la fecha de ultima actualizacion */
          $v->last_update = $this->_now;
          $v->save();
        } 
        
        
    }
    
    public function actualizarHabitaciones($idUsuario = null) {
        $this->procesarCola($idUsuario, Mob_Loader::getModel("Habitacion_Nueva"));    
    }

    public function actualizarTropas($idUsuario = null) {
      $this->procesarCola($idUsuario, Mob_Loader::getModel("Tropa_Nueva"));
    }
    
    public function actualizarEntrenamientos($idUsuario = null) {
        $this->procesarCola($idUsuario, Mob_Loader::getModel("Entrenamiento_Nuevo"));        
    }    
    
    public function procesarCola($idUsuario = null, $modelCola) {
        $idEdificiosFinalizados = array();
        $primary = $modelCola->getPrimaryKey();
        //$this->_debug = true;
        $lastFinalizacion = $idEdificioActual = 0;
        
        foreach ($modelCola->getByUsuario($idUsuario) as $k => $v) {
            try {
              $this->_db->beginTransaction();
              
              if (empty($idEdificiosFinalizados[$v["id_edificio"]])) {
                if (!$this->_debug) $this->updateRecursos($v["id_edificio"]);
              }
              
              if ($modelCola->getTipoCola() == 1) {
                // estos los puede construir siempre
                $modelCola->processQueue($v, strtotime($v["fecha_fin"]));
              } else {
                // estos los puede construir si tiene recursos o si es el primero de la cola
                if ($k == 0) {
                  $idEdificioActual = $v["id_edificio"];
                }
                if ($idEdificioActual != $v["id_edificio"]) {
                    // cambiamos a un edificio nuevo, procesamos el edificio que terminamos
                    $modelCola->procesarNuevaConstruccion($idEdificioActual, $lastFinalizacion, isset($v["tipo"]) ? $v["tipo"] : null);
                    $lastFinalizacion = strtotime($v["fecha_fin"]);
                    $idEdificioActual = $v["id_edificio"];
                }                
                
                if (empty($idEdificiosFinalizados[$v["id_edificio"]])) {
                  if ($this->_debug) echo "construye ".$v["nivel"]." no resto nada es el primero\n";
                  // es la primer habitacion/entrenamiento/tropa no le resto los recursos pues ya fueron restados al momento de ponerla a construir
                  $idEdificiosFinalizados[$v["id_edificio"]] = 1;
                  // la primera vez ponemos como fecha de finalizacion la fecha fin de la primer construccion
                  $lastFinalizacion = strtotime($v["fecha_fin"]);
                  $modelCola->processQueue($v, $lastFinalizacion);                  
                } else {
                  // por todas estas resto los recursos, si es que puede construir
                  $costos = $modelCola->getCostoConstruccion($v);
                   
                  if (!Mob_Loader::getModel("Edificio")->puedeGastar($v["id_edificio"], $costos["arm"], $costos["mun"], $costos["dol"])) {
                    if ($this->_debug) {
                      echo "no puede construir ".$v["nivel"]." ".$v["id_edificio"]." no puede gastar arm: ".$costos["arm"]." mun: ".$costos["mun"]." dol: ".$costos["dol"].", dispone de ".
                            implode(" - ", Mob_Loader::getModel("Edificio")->getRecursos($v["id_edificio"]))." fecha fin ".$v["fecha_fin"]."\n";
                    } 
                    $modelCola->sendMessageNoRecursos($v, $lastFinalizacion);
                  } else {
                    Mob_Loader::getModel("Edificio")->restarRecursos($v["id_edificio"], $costos["arm"], $costos["mun"], $costos["dol"]);
                    if ($this->_debug) {
                      echo "construye ".$v["nivel"]." resto ".$v["nivel"]." arm: ".$costos["arm"]." mun: ".$costos["mun"]." dol: ".$costos["dol"].
                            " edificio ".$v["id_edificio"]." id_usuario ".$v["id_usuario"]." fecha fin ".$v["fecha_fin"]."\n";
                    }
                    $lastFinalizacion += $v["duracion"];
                    $modelCola->processQueue($v, $lastFinalizacion); 
                  }
                }
              }                                                             
              
              $modelCola->delete($primary." = " . $v[$primary]);
              $this->_db->commit();
            } catch (Exception $e) {
              $this->_db->rollBack();
              //echo "Transaction error habitaciones: ".$e->getMessage()."\n";
            }
            
            $idEdificiosFinalizados[$v["id_edificio"]] = 1;
        }
        
        // el ultimo edificio queda sin procesar entonces lo procesamos aca
        if ($idEdificioActual != 0) {
          $modelCola->procesarNuevaConstruccion($idEdificioActual, $lastFinalizacion, isset($v["tipo"]) ? $v["tipo"] : null);
        }       
    }    
    
    public function actualizarPuntos($id_usuario = 0) {
         
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
            
            foreach (Mob_Loader::getModel("Misiones")->fetchAll("id_usuario = ".$jug["id_usuario"]) as $mision) {
              foreach (Zend_Json::decode($mision->tropas) as $tropa => $cantidad) {
                $totalPuntosTropas += $tropas[lcfirst($tropa)] * $cantidad;  
              }
            }

            $jug->puntos_edificios = $totalPuntosHabitaciones;
            $jug->puntos_tropas = $totalPuntosTropas;            
            $jug->save(); 

        }
    }
    
    protected function _sumarRecursos($idEdificio, $arm = 0, $mun = 0, $dol = 0, $alc = 0) {
       return Mob_Loader::getModel("Edificio")->sumarRecursos($idEdificio, $arm, $mun, $dol, $alc);
    }

    protected function _agregarTropa($id_edificio, $tropa, $cantidad) {
        return Mob_Loader::getModel("Tropa")->sumarTropas($id_edificio, array($tropa => $cantidad));
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

    public function actualizarMisiones($idUsuario) {
        $res = Mob_Loader::getModel("Misiones")->getMisionesSimple($idUsuario);
        
        if (empty($res)) return false;

        $idEdificiosFinalizados = array();
        $idUsuariosFinalizados = array();

        try {
          $this->_db->beginTransaction();
          foreach ($res as $v) {
              //echo "Mision tipo ".$v["mision"]."\n";
              //1 "Atacar", 2 "Estacionar", 3 "Transportar recursos", 4 "Ocupar edificio"
              if (@fopen(PUBLIC_PATH."/cacheFiles/misiones/".$v["id_mision"].".lock", "x") === false) {
                Mob_Loader::getModel("Misiones")->delete("id_mision = ".$v["id_mision"]);
                continue;
              }      
              
              $idUsuarioDefensor = Mob_Loader::getModel("Edificio")->getUsuarioByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"], true);
              $idUsuariosFinalizados[$v["id_usuario"]] = 1;
              $idEdificioDefensor = Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"]);
              if ($idUsuarioDefensor != null) $idUsuariosFinalizados[$idUsuarioDefensor] = 1;
              if ($idEdificioDefensor != null) $this->updateRecursos($idEdificioDefensor);

              switch($v["mision"]) {  
                  case 1:
                      // Atacar     
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
                          $idBatalla = $combatManager->getIdBatalla();
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
                          $combatManager->__destruct();
                          $idEdificiosFinalizados[$idEdificioDefensor] = 1;
                      }
                      $this->_regresarTropas($v); 
                  break;
                  case 2:
                      // Estacionar
                      if ($this->_estacionarTropas($v)) {
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
                        
                            $idMercadoSaldado = Mob_Loader::getModel("Mercado")->saldarTransaccionPendiente($v["id_usuario"], $idUsuarioDefensor, 
                                $v["recursos_arm"], $v["recursos_mun"], $v["recursos_dol"]);
                        
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
                          if (isset($v["tropas"][Mob_Server::getNameTrpOcupacion()])) {
                              Mob_Loader::getModel("Mensajes")->aviso($v["id_usuario"], "edificio_ocupado", "Nuevo edificio ocupado ".$v["coord_dest_1"].":".$v["coord_dest_2"].":".$v["coord_dest_3"]);
                              // ocupo el edificio con los recursos transportados y estaciono las tropas
                              $v["tropas"][Mob_Server::getNameTrpOcupacion()]--;
                              Mob_Loader::getModel("Edificio")->ocupar($v["id_usuario"], 
                                  array($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"])
                              );
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
                      $idEdificiosFinalizados[Mob_Loader::getModel("Edificio")->getIdByCoord($v["coord_dest_1"], $v["coord_dest_2"], $v["coord_dest_3"])] = 1;
                      $this->_estacionarTropas($v);
                  break;
              }
              
              Mob_Loader::getModel("Misiones")->delete("id_mision = ".$v["id_mision"]);
          }      
          //Mob_Loader::getModel("Misiones")->deleteFinalizadas($idUsuario);
          $this->_db->commit();
        } catch (Exception $e) {
          $this->_db->rollBack();
          //echo "Transaction error habitaciones: ".$e->getMessage()."\n";
        }     

        foreach (array_keys($idEdificiosFinalizados) as $idEdificio) {
            Mob_Cache_Factory::getInstance("html")->remove('tropasVisionGeneral'.$idEdificio);
        }
        
        foreach (array_keys($idUsuariosFinalizados) as $idUsuario) {
            Mob_Cache_Factory::getInstance("query")->remove('getMisiones'.$idUsuario);
        }
        unset($res);
        $this->actualizarMisiones($idUsuario);      
    }    

}