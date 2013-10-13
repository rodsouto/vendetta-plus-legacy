<?php

class Mob_View_Helper_BarraRecursos extends Zend_View_Helper_Abstract {

    public function barraRecursos() {
     
     if ($this->view->getJugador() === null || $this->view->getJugador()->getEdificioActual()->getId() == null) return;
     
     $edificio = $this->view->getJugador()->getEdificioActual()->setData();

     return "<table id='barraRecursos'>
     <tr id='recursosTitulo'>
        <th>".$this->view->t("recursos_arm").":</th>
        <th>".$this->view->t("recursos_mun").":</th>
        <th>".$this->view->t("recursos_alc").":</th>
        <th>".$this->view->t("recursos_dol").":</th>
    </tr>
     <tr>
        <td>".$this->view->numberFormat($edificio->getTotalRecurso("arm"))." <img src='".Mob_Server::getImgRecurso(1)."'></td>
        <td>".$this->view->numberFormat($edificio->getTotalRecurso("mun"))." <img src='".Mob_Server::getImgRecurso(2)."'></td>
        <td>".$this->view->numberFormat($edificio->getTotalRecurso("alc"))." <img src='".Mob_Server::getImgRecurso(4)."'></td>
        <td>".$this->view->numberFormat($edificio->getTotalRecurso("dol"))." <img src='".Mob_Server::getImgRecurso(3)."'></td>
     </tr>
     </table><br />";
    }
}