<?php

class Mob_Form_Familia_Capo extends Zend_Form {
    
    protected $_idFamilia;
    
    public function build($idFamilia) {
        $this->_idFamilia = $idFamilia;
        $this->setAction("/mob/familias/administrar");
        
        $idCapo = Mob_Loader::getModel("Familias_Miembros")->getIdCapo($idFamilia);

        $miembros = array();
        foreach (Mob_Loader::getModel("Familias_Miembros")->getMiembros($idFamilia) as $m) {
            if ($idCapo == $m["id_usuario"]) continue;
            $miembros[$m["id_miembro"]] = $this->getView()->escape(Mob_Loader::getModel("Usuarios")->getUsuario($m["id_usuario"]));
        }

        $this->addElement("select", "id_nuevo_capo", array("multiOptions" => $miembros, "required" => true));
        $this->addElement("submit", "guardarCapo", array("label" => "Guardar", "ignore" => true));
    }
    
    // el nuevo usuario es capo y yo paso a ser subcapo
    public function save($idUsuario) {
        $miIdMiembro = Mob_Loader::getModel("Familias_Miembros")->getIdByIdUsuario($idUsuario);
        Mob_Loader::getModel("Familias_Miembros")->setRango($miIdMiembro, Mob_Loader::getModel("Familias_Rangos")->getIdSubCapo($this->_idFamilia));
        Mob_Loader::getModel("Familias_Miembros")->setRango($this->id_nuevo_capo->getValue(), Mob_Loader::getModel("Familias_Rangos")->getIdCapo($this->_idFamilia));
    }

}