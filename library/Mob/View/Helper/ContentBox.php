<?php                                   

class Mob_View_Helper_ContentBox extends Zend_View_Helper_Abstract {

  public function contentBox() {
    return $this;
  }
  
  public function open($titulo = null) {
    return "<div class='content_box'>".($titulo === null ? "" : "<h2>".$this->view->t($titulo)."</h2>")."<div class='content_box_text'>";
  }
  
  public function close() {
    return "</div></div>";
  } 

}