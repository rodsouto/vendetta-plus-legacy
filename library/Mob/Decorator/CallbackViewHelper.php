<?php

class Mob_Decorator_CallbackViewHelper extends Zend_Form_Decorator_Abstract {

    public function render($content) {
    
        $viewHelper = $this->getOption("viewHelper");
        $method = $this->getOption("method");
        $params = $this->getOption("params");

        if ($params !== NULL && !is_array($params)) $params = array($params);
        
        $html = "";
        
        $view = $this->getElement()->getView();
        
        if ($method == NULL) {
            if ($params == NULL) {
                $html = $view->{$viewHelper}();
            } else {
                $html = call_user_func_array(array($view, $viewHelper), $params);
            }
        } else {
            if ($params == null) {
                $html = $view->{$viewHelper}()->$method();
            } else {
                $html = call_user_func_array(array($view->{$viewHelper}(), $method), $params);
            }
        }
        
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