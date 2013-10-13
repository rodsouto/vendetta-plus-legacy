<?php

class Mob_Form_Familia_Solicitud extends Zend_Form {

    public function init() {
        $this->addElement("textarea", "descripcion", array( 
                        "label" => "Texto",
                        "required" => true
        ));
        
        $this->addElement("submit", "solicitar", array("label" => "Enviar", "ignore" => true));
    }
    
    public function setIdFamilia($idFamilia) {
      return $this->setAction("/mob/familias/solicitud/enviar/$idFamilia");
    }
    
    public function save($idFamilia, $idUsuario) {
        
        return Mob_Loader::getModel("Familias_Solicitudes")->insert(
            array(
              "texto" => $this->descripcion->getValue(),
              "id_familia" => (int)$idFamilia,
              "id_usuario" => (int)$idUsuario,
              "fecha" => date("Y-m-d H:i:s")
            )
        );
        
    }

}