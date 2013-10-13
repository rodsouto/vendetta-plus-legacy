<?php

class Mob_Form_Familia_Miembros extends Zend_Form {

    public function build($idFamilia) {
        $this->setAction("/mob/familias/administrar");
        $rangosFamilia = Mob_Loader::getModel("Familias_Rangos")->getListaRangos($idFamilia, false);
        
        $idCapo = Mob_Loader::getModel("Familias_Miembros")->getIdCapo($idFamilia);
        
        $idUsuario = Zend_Auth::getInstance()->getIdentity()->id_usuario;

        foreach (Mob_Loader::getModel("Familias_Miembros")->getMiembros($idFamilia) as $m) {
        
            $echar = $idCapo == $idUsuario && $idCapo != $m["id_usuario"] ? " <a href='/mob/familias/administrar?expulsar=".$m["id_usuario"]."'>".$this->getView()->t("Expulsar")."</a>" : "";
        
            $this->addElement("select", "u".$m["id_miembro"], 
                    array("label" => $this->getView()->escape(Mob_Loader::getModel("Usuarios")->getUsuario($m["id_usuario"])).$echar,
                    "required" => true,
                    "multiOptions" => $rangosFamilia,
                    "value" => $m["id_rango"]));
            
            $this->getElement("u".$m["id_miembro"])->getDecorator("Label")->setOption("escape", false);
                    
            if ($idCapo == $m["id_usuario"]) {
                $this->{"u".$m["id_miembro"]}
                    ->setAttrib("disabled", "disabled")
                    ->setRequired(false)
                    ->setIgnore(true)
                    ->setMultiOptions(array(0 => "Capo"));
            }
        
        }
        
        $this->addElement("submit", "guardarRangosMiembros", array("label" => "Guardar", "ignore" => true));
    }
    
    public function save($idFamilia) {
        foreach ($this->getValues() as $idMiembro => $idRango) {
            $idMiembro = (int)substr($idMiembro, 1);
            Mob_Loader::getModel("Familias_Miembros")->setRango($idMiembro, $idRango);
        }
    }

}