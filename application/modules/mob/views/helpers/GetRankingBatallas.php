<?php

class Mob_View_Helper_GetRankingBatallas extends Zend_View_Helper_Abstract {

    public function getRankingBatallas($action = null) {

      $return = "";
    
      $type = isset($_GET["type"]) ? (int)$_GET["type"] : 0;

      $frontendOptions = array('automatic_serialization' => true);
      $backendOptions  = array('hashed_directory_level' => 2,'cache_dir' => PUBLIC_PATH.'/cacheFiles/metadata');

      $cache = Zend_Cache::factory('Core', 'File', $frontendOptions, $backendOptions);
      
      $cacheId = "getRankingBatallas".$type;
      if(($result = $cache->load($cacheId)) !== false) return $result;

      if ($type == 0) {
        // ultimas batallas
        $data = Mob_Loader::getModel("Batallas")->getBatallas();
      } elseif ($type == 1) {
        // historico
        $data = Mob_Loader::getModel("Batallas")->getBatallas("total");
      } elseif (in_array($type, array(2, 3, 4))) {
        // ranking semana mes año
        $data = Mob_Loader::getModel("Batallas")->getBatallas("total", array("rango" => $type));
      } else {
        $data = Mob_Loader::getModel("Batallas")->getGranjeos($type);
      }
       
      
      $return .= "<table>";
      if ($type == 0 || $type == 1 || $type == 2 || $type == 3 || $type == 4) {
        $return .=  '<tr>
                  <td class="c">#</td>
                  <td class="c">&nbsp;</td>
                  <td class="c">'.$this->view->t("Perdidas atacante").'</td>
                  <td class="c">'.$this->view->t("Perdidas defensor").'</td>
                  <td class="c">'.$this->view->t("Total Perdidas").'</td>
                  <td class="c">&nbsp;</td>
              </tr>';
      } else {
        //if ($type == 8 || $type == 9 || $type == 10) {
          $return .=  '<tr>
                  <td class="c">#</td>
                  <td class="c">'.$this->view->t("Jugador").'</td>
                  <td class="c">'.$this->view->t("Armas").'</td>
                  <td class="c">'.$this->view->t("Municion").'</td>
                  <td class="c">'.$this->view->t("Dolares").'</td>
                  <td class="c">'.$this->view->t("Total Ataques").'</td>
              </tr>';        
      }
      
      foreach ($data as $k => $b) {
      
        if ($type == 0 || $type == 1 || $type == 2 || $type == 3 || $type == 4) {
          $return .= "<tr><td>".($k+1)."</td>
          <td><a href='/mob/jugador?id=".$b["atacante"]."' class='ajax'>".$this->view->escape(Mob_Loader::getModel("Usuarios")->getUsuario($b["atacante"]))."</a> vs.
          <a href='/mob/jugador?id=".$b["defensor"]."' class='ajax'>".$this->view->escape(Mob_Loader::getModel("Usuarios")->getUsuario($b["defensor"]))."</a></td>
          <td>".$this->view->numberFormat($b["pts_perd_atacante"])."</td>
          <td>".$this->view->numberFormat($b["pts_perd_defensor"])."</td>
          <td>".$this->view->numberFormat($b["pts_perd_atacante"]+$b["pts_perd_defensor"])."</td>
          <td><a href='/mob/batallas/ver?id=".$b["id_batalla"]."' class='ajax'>".$this->view->t("Ver")."</a></td></tr>";
        } else {
            //if ($type == 8 || $type == 9 || $type == 10) {
          $return .= "<tr><td>".($k+1)."</td>
          <td><a href='/mob/jugador?id=".$b["usuario"]."' class='ajax'>".$this->view->escape(Mob_Loader::getModel("Usuarios")->getUsuario($b["usuario"]))."</a></td>
          <td>".$this->view->numberFormat($b["arm"])."</td>
          <td>".$this->view->numberFormat($b["mun"])."</td>
          <td>".$this->view->numberFormat($b["dol"])."</td>
          <td>".$this->view->numberFormat($b["total"])."</td>";
        }
      }        
                
      $return .= "</table>";
      
      $cache->save($return, $cacheId);
      
      return $return;
        
    }

}