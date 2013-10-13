<?php

class Mob_Form_Admin_TraducirAll extends Zend_Form {
    protected $_query;
    protected $_page;
    protected $_count = 50;
    protected $_idioma;
  public function build($idioma, $palabra = null, $page = 1) {
    $this->_idioma = $idioma;
    $this->_page = (int)$page;
    
    $model = Mob_Loader::getModel("Textos");
    
    $this->_query = $model->select()->where("idioma = ?", $idioma)->limitPage($this->_page, $this->_count);
    if ($palabra != null) $this->_query->where("texto LIKE ?", "%".$palabra."%");
    
    foreach (Mob_Loader::getModel("Textos")->fetchAll($this->_query)->toArray() as $t) {
        $type = strpos($t["texto"], "\n") !== false || strlen($t["texto"]) > 100 ? "textarea" : "text";
        $label = strlen($t["texto"]) < 100 ? $t["texto"] : substr($t["texto"], 0, 100)."..."; 
        
        $this->addElement($type, "text_".$t["id_texto"], array("value" => $t["texto"], "style" => "width: 90%;",
        "label" => $label));
    }
    
    $this->addElement("submit", "guardar", array("label" => "Guardar", "ignore" => true));
    $this->addElement("hidden", "palabra", array("value" => $palabra));
    
  }
  
  public function getPaginator() {
    $paginator = Zend_Paginator::factory($this->_query);
    $paginator->setCurrentPageNumber($this->_page)->setItemCountPerPage($this->_count);
    return $paginator;
  }
  
  public function save() {
    $values = $this->getValues();
    
    foreach ($values as $k => $text) {
      $idTexto = end(explode("_", $k));
            
      $error = false;
      
      try {
      
       Mob_Loader::getModel("Textos")->update(
            array("texto" => $text), "id_texto = $idTexto AND idioma = '".$this->_idioma."'");
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