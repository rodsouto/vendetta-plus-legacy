<?php

class Mob_View_Helper_GetRankingFamilias extends Zend_View_Helper_Abstract {

    public function getRankingFamilias($action = null) {
                           
        if ($action == "getQuery") return Mob_Loader::getModel("Familias")->getQueryRanking();

        $page = Zend_Controller_Front::getInstance()->getRequest()->getParam("page", 1);
    
        $return = "<table>";
        $ranking = Mob_Loader::getModel("Familias")->getRanking(isset($_GET["order"]) ? $_GET["order"] : "pts");
        $return .= '
        <tr>
            <td class="c">#</td>
            <td class="c">'.$this->view->t("Nombre").'</td>
            <td class="c"><a class="ajax" href="/mob/clasificacion?order=pts&type='.$this->view->escape($_GET["type"]).'">'.$this->view->t("Puntos").'</a></td>
            <td class="c"><a class="ajax" href="/mob/clasificacion?order=me&type='.$this->view->escape($_GET["type"]).'">'.$this->view->t("Miembros").'</a></td>
            <td class="c"><a class="ajax" href="/mob/clasificacion?order=ptsm&type='.$this->view->escape($_GET["type"]).'">'.$this->view->t("Puntos/Miembro (mín. 2+ Miembros)").'</a></td>
        </tr>
        ';
        
        $idFamilia = $this->view->getJugador() != null ? (int)$this->view->getJugador()->getIdFamilia() : 0;
        
        foreach ($ranking as $k => $data) {
            if ($data["id_familia"] == $idFamilia) $return = "<p>".$this->view->t("Tu familia esta en la posicion")." ".(($page-1)*100+($k+1))."</p>".$return;
            $return .= sprintf("<tr%s>
                <th>%s</th>
                <th><a href='/mob/familias/ver?idf=%s' class='ajax'>%s [%s]</a></th>
                <th>%s</th>
                <th>%s</th>
                <th>%s</th>
                </tr>",
                $data["id_familia"] == $idFamilia ? " class='highlightrank'" : "",
                (($page-1)*100)+$k+1,
                $data["id_familia"],
                $this->view->escape($data["nombre"]),
                $this->view->escape($data["etiqueta"]),
                $this->view->numberFormat($data["puntos"]),
                $this->view->numberFormat($data["miembros"]),
                $data["miembros"] > 2 ? $this->view->numberFormat($data["puntos"]/$data["miembros"]) : 0
            );

        }
        $return .= "</table>";
        return $return;
    }

}