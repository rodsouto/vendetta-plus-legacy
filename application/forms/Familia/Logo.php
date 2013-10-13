<?php

class Mob_Form_Familia_Logo extends Zend_Form {

    public function build($idFamilia) {
    $this->setAction("/mob/familias/cambiar/logo/$idFamilia");
    if (!file_exists(getcwd()."/img/logos")) mkdir(getcwd()."/img/logos");
    if (!file_exists(getcwd()."/img/logos/".$idFamilia)) mkdir(getcwd()."/img/logos/".$idFamilia);
    
        $this->addElement("file", "logo", array( 
                        "label" => "aviso upload imagen",
"validators" => array(
array("Extension", false, array("gif,jpg,jpeg")),
array("Size", false, array(40960)),
array("ImageSize", false, array("maxwidth" => 500, "maxheight" => 500)),
array("Count", false, array(1))
),
"destination" => getcwd()."/img/logos/$idFamilia")
);
        
        //$this->logo->addFilter("Rename", array("overwrite" => true, "target" => getcwd()."/img/logos/".$idFamilia));
        
        $this->addElement("submit", "subir", array("label" => "Subir", "ignore" => true));
    }
    
    public function save($idFamilia) {
        
        Mob_Loader::getModel("Familias")->update(
            array("logo" => $this->logo->getValue()), "id_familia = ".(int)$idFamilia
        );

        return true;
        
    }

}