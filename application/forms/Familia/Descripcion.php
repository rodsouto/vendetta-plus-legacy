<?php

class Mob_Form_Familia_Descripcion extends Zend_Form {

    public function build($idFamilia) {
        $this->setAction("/mob/familias/cambiar/descripcion/$idFamilia");
    
        $this->addElement("textarea", "descripcion", array( 
                        "label" => "Descripción (10000 caracteres)",
                        "description" => nl2br($this->getView()->t("aviso descripcion familia", "http://en.wikipedia.org/wiki/BBCode"))
        ));
        
        $this->descripcion->setValue(stripslashes(Mob_Loader::getModel("Familias")->getDescripcion($idFamilia)))
                            ->addPrefixPath('Mob_Filter', 'Mob/Filter/', 'filter')
                            ->getDecorator("Description")->setOption("escape", false);
        
        $this->addElement("submit", "guardar", array("label" => "Guardar", "ignore" => true));
    }
    
    public function save($idFamilia) {
        
        Mob_Loader::getModel("Familias")->update(
            array("descripcion" => $this->descripcion->getValue()), "id_familia = ".(int)$idFamilia
        );
        
        return true;
        
    }

}