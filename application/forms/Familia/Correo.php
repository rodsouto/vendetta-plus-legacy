<?php

class Mob_Form_Familia_Correo extends Zend_Form {

    public function build($idFamilia) {
        $this->setAction("/mob/familias/correo");
        $multiOptions = array();
        foreach (Mob_Loader::getModel("Familias_Miembros")->getMiembros($idFamilia) as $m) {
            if (Mob_Loader::getModel("Familias_Rangos")->puede($m["id_rango"], "recibir_circular")) {
                $multiOptions[$m["id_usuario"]] = $this->getView()->escape(Mob_Loader::getModel("Usuarios")->getUsuario($m["id_usuario"]));
            }        
        }
        
        $this->addElement("multiCheckbox", "id_destinatarios", array(
                "multiOptions" => $multiOptions, "value" => array_keys($multiOptions), "label" => "Destinatarios", "required" => true));
        $this->addElement("textarea", "mensaje", array("label" => "Texto", "required" => true));
        $this->addElement("submit", "enviarCircular", array("label" => "Enviar", "ignore" => true));
    }
    
    public function save($idUsuario) {  
      $data = $this->getValues();
      $data["asunto"] = sprintf($this->getView()->t("Mensaje de tu familia enviado por x"), $this->getView()->escape(Mob_Loader::getModel("Usuarios")->getUsuario($idUsuario)));
      Mob_Loader::getModel("Mensajes")->enviar($idUsuario, $data);
    }

}