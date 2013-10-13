<?php

class Mob_View_Helper_GetBatalla extends Zend_View_Helper_Abstract {

    public function getBatalla($idBatalla, $idUsuario = null) {
      
      $data = Mob_Loader::getModel("Batallas")->find($idBatalla)->toArray();
                            
      if ($data == array()) return $this->view->contentBox()->open("Error")."<p>Batalla inexistente</p>".$this->view->contentBox()->close();
      
      $data = $data[0];
                            
      if (!empty($data["html"])) return $data["html"];
      
      $esParticipante = $data["atacante"] == $idUsuario || $data["defensor"] == $idUsuario;
      
      $numberFormat = new Mob_View_Helper_NumberFormat;                      
      $resultado = Zend_Json::decode($data["resultado"]);
       
      $html = $this->view->contentBox()->open();
      
      $nombreAtacante = Mob_Loader::getModel("Usuarios")->getUsuario($data["atacante"]);
      $nombreDefensor = Mob_Loader::getModel("Usuarios")->getUsuario($data["defensor"]);
      
      $titleAddthis = $nombreAtacante." vs. ".$nombreDefensor;
      
      $html .= '<!-- AddThis Button BEGIN -->
<div class="addthis_toolbox addthis_default_style shareBattle">
<a class="addthis_button_facebook_like" fb:like:layout="button_count" addthis:title="'.$titleAddthis.'"></a>
<a class="addthis_button_tweet" addthis:title="'.$titleAddthis.'"></a>
<a class="addthis_counter addthis_pill_style" addthis:title="'.$titleAddthis.'"></a>
</div>
<script type="text/javascript">var addthis_config = {"data_track_clickback":true};</script>
<script type="text/javascript" src="http://s7.addthis.com/js/250/addthis_widget.js#pubid=ra-4dbc75a60ccf7e09"></script>
<!-- AddThis Button END -->';
      $html .= "<script>$(function(){
      $('.switch_report').click(function(event){
      event.preventDefault();
      if ($('#reporte_compactado').css('display') == 'none') {
        $('#reporte_compactado').show();
        $('#reporte_normal').hide();
      } else {
        $('#reporte_compactado').hide();
        $('#reporte_normal').show();
      }
      });
      });</script>";
      $html .= "<table>";
      
      // mostramos siempre atacante y defensor      
      $this->view->pageTitle = $nombreAtacante." vs. ".$nombreDefensor;
      
      if ($esParticipante || 1) {
        $html .= '<tr>
        <td colspan="5" class="c">Informe de batalla 
        '.$resultado["coord_atacante"].' (<a href="/mob/jugador/?id='.$data["atacante"].'" class="ajax">'.$nombreAtacante.'</a>) >>>> 
        '.$resultado["coord_defensor"].' (<a href="/mob/jugador/?id='.$data["defensor"].'" class="ajax">'.$nombreDefensor.'</a> ) </td></tr>
        <tr><th>Fecha</th><th colspan="4">'.Mob_Timer::dateFormat($data["fecha"]).'</th></tr>';
      } else {
        $html .= '<tr>
        <td colspan="5" class="c">Informe de batalla - Atacante <a href="/mob/jugador/?id='.$data["atacante"].'" class="ajax">'.Mob_Loader::getModel("Usuarios")->getUsuario($data["atacante"]).'</a></td></tr>
        <tr><th>Fecha</th><th colspan="4">'.Mob_Timer::dateFormat($data["fecha"]).'</th></tr>';
      }
      $html .= "</table>";
       
       $resultado["trp_atacante"] = Zend_Json::decode($resultado["trp_atacante"]);
       $resultado["trp_rest_atacante"] =  Zend_Json::decode($resultado["trp_rest_atacante"]);
       $resultado["trp_defensor"] = Zend_Json::decode($resultado["trp_defensor"]);
       $resultado["trp_rest_defensor"] =  Zend_Json::decode($resultado["trp_rest_defensor"]);
                
       // compactado
       $html .= "<div id='reporte_compactado' style='display: ".($esParticipante ? "none" : "block").";'><table>";
       $html .= '<tr><td class="c">Tropas</td><td class="c">Cantidad</td><td class="c">Destruido</td><td class="c">Cantidad</td><td class="c">Destruido</td></tr>';
       foreach ($resultado["trp_atacante"] as $tropa => $cantidad) {
        // para mantener compatibilidad entre reportes viejos (en el idioma del atacante) y nuevos (multiidioma)
        try {
          $nombreTropa = @Mob_Loader::getTropa($tropa)->getNombre();
        } catch (Exception $e) {
          $nombreTropa = $tropa;
        } 
        if (!isset($resultado["trp_rest_atacante"][$tropa])) $resultado["trp_rest_atacante"][$tropa] = 0;
        if (!isset($resultado["trp_rest_defensor"][$tropa])) $resultado["trp_rest_defensor"][$tropa] = 0;
        
        $html .= "<tr><th>".$nombreTropa."
					</th><th>".$this->view->numberFormat($cantidad)."</th><th>".$this->view->numberFormat($cantidad-$resultado["trp_rest_atacante"][$tropa])."</th>
					<th>".$this->view->numberFormat($resultado["trp_defensor"][$tropa])."</th><th>".$this->view->numberFormat($resultado["trp_defensor"][$tropa]-$resultado["trp_rest_defensor"][$tropa])."</th></tr>";       
       }
       $html .= "</table>";
       if ($esParticipante) $html .= "<p><a href='#' class='switch_report'>Ver Reporte Normal</a></p>";
       $html .= "</div>";
       
       if ($esParticipante) {
       $html .= "<div id='reporte_normal'><table>";
      $oportunidadVictoriaLast = false; 
      foreach ($resultado["batalla"] as $ronda => $info) {
        $html .= "<tr><td colspan='5' class='c'>Ronda de batalla $ronda</td></tr>";
        $html .= '<tr><td class="c">Tropas</td><td class="c">Cantidad</td><td class="c">Destruido</td><td class="c">Cantidad</td><td class="c">Destruido</td></tr>';
        
        foreach ($info["tropas"] as $tropa => $infoTropa) {
        // para mantener compatibilidad entre reportes viejos (en el idioma del atacante) y nuevos (multiidioma)
        try {
          $nombreTropa = @Mob_Loader::getTropa($tropa)->getNombre();
        } catch (Exception $e) {
          $nombreTropa = $tropa;
        }        
        $html .= "<tr><th>$nombreTropa
					</th><th>".$numberFormat->numberFormat($infoTropa['a'])."</th><th>".$numberFormat->numberFormat($infoTropa['muertesA'])."</th>
					<th>".$numberFormat->numberFormat($infoTropa['d'])."</th><th>".$numberFormat->numberFormat($infoTropa['muertesD'])."</th></tr>";
        }
        if (!Mob_Server::esDeModificadores()) {
          if ($esParticipante) {
            $html .= "<tr><th>Valor de defensa</th><th colspan='2'>".$numberFormat->numberFormat($info['PDA'])."</th><th colspan='2'>".$numberFormat->numberFormat($info['PDD'])."</th></tr>";
            $html .= "<tr>
            <th>Puntuación de ataque</th>
            <th colspan='2'>".$numberFormat->numberFormat($info['PAA'])." x ".$numberFormat->numberFormat($info['pctPoderA'])."% = ".$numberFormat->numberFormat(round($info['PAA']*$info['pctPoderA']/100))."</th>
            <th colspan='2'>".$numberFormat->numberFormat($info['PAD'])." x ".$numberFormat->numberFormat($info['pctPoderD'])."% = ".$numberFormat->numberFormat(round($info['PAD']*$info['pctPoderD']/100))."</th>
            </tr>";
            $html .= '<tr><th>Oportunidad de victoria</th><th colspan="2">'.round($info["pctVictoriaA"]).'%</th><th colspan="2">'.round($info["pctVictoriaD"]).'%</th></tr>';
          }
        }
        // en los servers de modificadires no hay oportunidad de victoria... por ahora
        $oportunidadVictoriaLast = Mob_Server::esDeModificadores() ? true : round($info["pctVictoriaA"]) > round($info["pctVictoriaD"]);
        //$html .= '<tr><th>Oportunidad de espionaje</th><th colspan="2">99.9%</th></tr>';
      }
      $html .= "</table><p><a href='#' class='switch_report'>Ver Reporte Compactado</a></p></div>";
      }
      $html .="<table>";
      
      if ($esParticipante) {
        $txt = array("arm" => "Armas", "mun" => "Munición", "dol" => "Dolar", "alc" => "Alcohol");
        
        $defensorPerdioTodo = $data["pts_defensor"] == $data["pts_perd_defensor"];
        $atacantePerdioTodo = $data["pts_atacante"] == $data["pts_perd_atacante"];
        
        if ($defensorPerdioTodo && !$atacantePerdioTodo) {
          $html .= '<tr><td colspan="5" class="c">Recursos Robados</td></tr>'; 
          foreach ($resultado["robo"] as $rec => $cant) {
           $html .= "<tr>
             <th>".$txt[$rec]."</th>
             <th colspan='4'>".$numberFormat->numberFormat($cant)."</th>
             </tr>";
          }
        }
          
        //$nivelEspionaje = $this->_jugadorAtacante->getEdificioActual()->getEntrenamiento("Espionaje")->getNivel();
         if ($oportunidadVictoriaLast && !$atacantePerdioTodo && (!empty($resultado["trp_rest_atacante"][Mob_Server::getNameTrpEspia()]))) {
          $html .= '<tr><td colspan="5" class="c">Habitaciones</td></tr>';
          foreach($resultado["habitaciones_defensor"] as $hab => $nivel) {
            $html .= "<tr>
            <th>".Mob_Loader::getHabitacion($hab)->getNombre()."</th>
            <th colspan='4'>".$numberFormat->numberFormat($nivel)."</th>
            </tr>";
          }
          
          
          $html .= '<tr><td colspan="5" class="c">Recursos Disponibles</td></tr>';
          foreach ($txt as $kRec => $vRec) {
            $html .= "<tr>
            <th>".$vRec."</th>
            <th colspan='4'>".$numberFormat->numberFormat($resultado["recursos_disponibles"][$kRec])."</th>
            </tr>";
          }  
         }
       }
       
       $html .= "</table>";
       
       $html .= $this->view->contentBox()->close();
       return $html;
    } 

}