<?php

class Mob_Form_Guestbook extends Zend_Form {

  public function init() {
    
    $this->addElement("textarea", "mensaje", array("label" => "Mensaje (max 140 caracteres)", "required" => true, 
        "validators" => array(
          array("StringLength", false, array(1, 140))
        )
      ));
    
    $this->addElement("submit", "enviar", array("label" => "Enviar", "ignore" => true));
  }
  
  public function save($idEmisor, $idReceptor) {
    $timeline = $this->getValues();
    $timeline["id_usuario"] = (int)$idEmisor;
    $timeline["fecha"] = date("Y-m-d H:i:s");
    
    $idTimeline = Mob_Loader::getModel("Timeline")->insert($timeline);
    
    if ($idTimeline) {
        $mention = array("id_usuario" => (int)$idEmisor, "id_usuario_mention" => (int)$idReceptor, "id_timeline" => $idTimeline);
        return (bool)Mob_Loader::getModel("Timeline_Mentions")->insert($mention);
    } 
    
    return false;
  }
  
}