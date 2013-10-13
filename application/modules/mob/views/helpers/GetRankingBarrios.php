<?php

class Mob_View_Helper_GetRankingBarrios extends Zend_View_Helper_Abstract {

    public function getRankingBarrios($action = null) {
    
        if ($action == "getQuery") return Mob_Loader::getModel("Edificio")->getQueryRanking();
    
        $page = Zend_Controller_Front::getInstance()->getRequest()->getParam("page", 1);
    
        $return = "<table>";
        $ranking = Mob_Loader::getModel("Edificio")->getRanking(isset($_GET["order"]) ? $_GET["order"] : "pts");
        $return .= '
        <tr>
            <td class="c">#</td>
            <td class="c">'.$this->view->t("Posicion").'</td>
            <td class="c"><a href="/mob/index/clasificacion?order=ed&type='.$this->view->escape($_GET["type"]).'" class="ajax">'.$this->view->t("Edificios").'</a></td>
            <td class="c"><a href="/mob/index/clasificacion?order=pts&type='.$this->view->escape($_GET["type"]).'" class="ajax">'.$this->view->t("Puntos").'</a></td>
        </tr>
        ';
        foreach ($ranking as $k => $data) {
            $return .= sprintf("<tr>
                                    <th>%s</th>
                                    <th>%s</th>
                                    <th>%s</th>
                                    <th>%s</th>
                                    </tr>",
                (($page-1)*100)+$k+1,
                $data["coord1"].":".$data["coord2"],
                $this->view->numberFormat($data["edificios"]),
                $this->view->numberFormat($data["total_puntos"]));
        }
        $return .= "</table>";
        return $return;
    }

}