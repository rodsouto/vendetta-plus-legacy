<?php

class Mob_View_Helper_GetRankingJugadores extends Zend_View_Helper_Abstract {

    public function getRankingJugadores($action = null) {
        
        if ($action == "getQuery") return Mob_Loader::getModel("Usuarios")->getQueryRanking();
        
        $request = Zend_Controller_Front::getInstance()->getRequest();
        $order = $request->getParam("order", "to");
        
        if ($action == "home") {
          $page = $request->getParam("page", 1);
        } else {
          if (!empty($this->view->idUsuario) && $order == "to") {
            $posicionRanking =  Mob_Loader::getModel("Usuarios")->getPosicionRanking($this->view->idUsuario);
            $page = $request->getParam("page", ceil($posicionRanking/100));
          } else $page = $request->getParam("page", 1); 
        }
    
        $return = "<table>";
        
        $ranking = Mob_Loader::getModel("Usuarios")->getRanking($order, $page);
        $return .= '
        <tr>
            <td class="c">#</td>';
            //if ($order == "to") $return .= '<td class="c">&nbsp;</td>';
            $return .= '<td class="c">'.$this->view->t("Nombre").'</td>
            <td class="c"><a href="/mob/clasificacion?order=en" class="ajax">'.$this->view->t("Puntos Entrenamientos").'</a></td>
            <td class="c"><a href="/mob/clasificacion?order=ed" class="ajax">'.$this->view->t("Puntos Edificios").'</a></td>
            <td class="c"><a href="/mob/clasificacion?order=tr" class="ajax">'.$this->view->t("Puntos Tropas").'</a></td>
            <td class="c"><a href="/mob/clasificacion?order=to" class="ajax">'.$this->view->t("Puntos Totales").'</a></td>
            <td class="c">'.$this->view->t("Cantidad Edificios").'</td>
        </tr>
        ';
        
        foreach ($ranking as $k => $data) {
            
            if ($action == "home" && $k == 10) {
              break;
            }
        
            //$posRankingUltima = Mob_Loader::getModel("Puntos")->getUltimoRanking($data["id_usuario"]);
            $posRankingActual = (($page-1)*100)+$k+1;
        
            if ($data["id_usuario"] == $this->view->idUsuario) $return = "<p>".$this->view->t("Estas en la posicion")." ".(($page-1)*100+($k+1))."</p>".$return;
            $return .= sprintf("<tr%s><th>%s</th>%s<th><a href='/mob/jugador?id=%s' class='ajax'>%s</a>%s</th><th>%s</th><th>%s</th><th>%s</th><th>%s</th><th>%s</th></tr>",
                $data["id_usuario"] == $this->view->idUsuario ? " class='highlightrank'" : "",
                $posRankingActual,
                /*$order == "to" ? 
                "<th>".($posRankingUltima == $posRankingActual ? "=" 
                                    : ($posRankingUltima > $posRankingActual ? "<span class='positive'>+".($posRankingUltima-$posRankingActual)."</span>" 
                                                                              : "<span class='negative'>-".($posRankingActual-$posRankingUltima)."</span>"))."</th>"
                                : ""*/
                                "",
                $data["id_usuario"],
                $data["baneado"] ? "<span style='text-decoration:line-through;'>".$this->view->escape($data["usuario"])."</span>" : $this->view->escape($data["usuario"]),
                $data["id_familia"] > 0 ? " <a href='/mob/familias/ver?idf=".$data["id_familia"]."' class='ajax'>[".$this->view->escape(Mob_Loader::getModel("Familias")->getEtiqueta($data["id_familia"]))."]</a>" : "",
                $this->view->numberFormat($data["puntos_entrenamientos"]),
                $this->view->numberFormat($data["puntos_edificios"]),
                $this->view->numberFormat($data["puntos_tropas"]),
                $this->view->numberFormat($data["total"]),
                $this->view->numberFormat($data["total_edificios"]));
        }
        $return .= "</table>";
        return $return;
    }

}