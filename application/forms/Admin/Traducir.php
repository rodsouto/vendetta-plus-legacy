<?php

class Mob_Form_Admin_Traducir extends Zend_Form {

  public function build($idiomas, $ref = null) {
    $populate = $ref != null ? Mob_Loader::getModel("Textos")->getByRef($ref) : array();
    $this->addElement("hidden", "ref_edit", array("value" => $ref));
  
    $this->addElement("text", "ref", array("label" => "Text ref", "required" => true));
    
    $subForm = new Zend_Form_SubForm;
    foreach ($idiomas as $l => $activado) {
      $required = $l == "es" ? true : $ref != null;
      $subForm->addElement("textarea", "lang_".$l, array("label" => $l, "required" => $required));
    }
    
    $this->addSubForm($subForm, "textos");
    
    $this->addElement("submit", "agregar", array("label" => "Send", "ignore" => false));
    $this->populate($populate);
  $this->addDecorator("Errors", array("placement" => "prepend"));
  }
  
  public function save() {
    $values = $this->getValues();
    
    foreach ($values["textos"] as $k => $text) {
      $data = explode("_", $k);
      $text = trim($text);
      
      if ($text === "" && $data[1] != "es") $text = $values["textos"]["lang_es"]; 
      
      $data = array("ref" => $values["ref"], "idioma" => $data[1], "texto" => $text);
      
      $error = false;
      
      try {
        if (!empty($values["ref_edit"])) {
          Mob_Loader::getModel("Textos")->update($data, "ref = '".$data["ref"]."' AND idioma = '".$data["idioma"]."'");
        } else {
          Mob_Loader::getModel("Textos")->insert($data);
        }
        
      } catch (Exception $e) {
        $error = true;
        $this->addError($e->getMessage());
        break;
      }
      
    }
    
    Mob_Loader::getModel("Textos")->export();

    return !$error;
  
  }

}