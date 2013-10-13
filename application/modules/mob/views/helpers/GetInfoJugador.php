<?php

class Mob_View_Helper_GetInfoJugador extends Zend_View_Helper_Abstract {

    public function getInfoJugador($idUsuario, $idUsuarioOnline, $contentBox = true) {

      if ($idUsuario == $idUsuarioOnline) {
          $jugador = $this->view->getJugador();
      } else {
          $jugador = new Mob_Jugador($idUsuario);
          $jugador->setEdificio(Mob_Loader::getModel("Edificio")->getPrincipal($idUsuario));
      }
      
      $return = "";
      
      if ($contentBox) $return = $this->view->contentBox()->open("Puntos");
      $return .=  "<table>";
      $txt = array("totalEdificios" => $this->view->t("Cantidad Edificios"), "puntosEdificios" => $this->view->t("Puntos Edificios"), 
              "puntosEntrenamientos" => $this->view->t("Puntos Entrenamientos"), "puntosTropas" => $this->view->t("Puntos Tropas"), 
              "totalPuntos" => "=", "poderAtaque" => $this->view->t("Poder de ataque"),
              "idFamilia" => $this->view->t("Familia"));
        foreach ($jugador->getInfo() as $k => $v) {
          if ($k == "poderAtaque") {
              $v .= "%";
              if ($idUsuario == $idUsuarioOnline) $v .= "(<a href='/mob/visiongeneral/poderataque' class='ajax'>".$this->view->t("Detalles")."</a>)";
          } elseif ($k == "idFamilia") {
            if (empty($v)) continue;
            $v = "<a href='/mob/familias/ver?idf=$v'>".Mob_Loader::getModel("Familias")->getNombre($v)."</a>";
          } else {
              $v = $this->view->numberFormat($v);
          }
          $return .= "<tr><td>".$txt[$k]."</td><td>".$v."</td></p>";
        }
        if ($idUsuario == $idUsuarioOnline) $return .= "<tr><td colspan='2'><a href='/mob/visionglobal' target='_blank'>".$this->view->t("Visión Global")."</a></td></tr>";
      $return .=  "</table>";
      if ($contentBox) $return .= $this->view->contentBox()->close();
      return $return;
        
    }

}