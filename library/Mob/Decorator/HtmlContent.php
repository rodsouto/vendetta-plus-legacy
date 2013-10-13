<?php

class Mob_Decorator_HtmlContent extends Zend_Form_Decorator_Abstract {

    public function render($content) {
    
        $html = $this->getOption("html");
        if ($html === NULL) return $content;
        
        $separator = $this->getSeparator();
        
        switch ($this->getPlacement()) {
            case (self::PREPEND):
                return $html . $separator . $content;
            case (self::APPEND):
            default:
                return $content . $separator . $html;
        }    
        
    }

}