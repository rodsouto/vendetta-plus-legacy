<?php

class Zend_View_Helper_T extends Zend_View_Helper_Abstract {

  protected $_bbcode;
  
  public function __construct() {
    $this->_bbcode = Zend_Markup::factory('Bbcode');
    
    $this->_bbcode->addMarkup(
        'link',
        Zend_Markup_Renderer_RendererAbstract::TYPE_CALLBACK,
        array(
            'callback' => new Mob_Markup_Renderer_Html_Link(),
            'group'    => 'inline'
        )
    );
  }

  public function t($messageid = null) {
    $args = func_get_args();
    
    if (!empty($args)) {
        array_shift($args);
    }
    
    if (empty($args)) {
        return $this->_bbcode->render($this->view->escape($this->view->translate($messageid), false));
    } 
    
    try {
        return $this->_bbcode->render($this->view->escape(vsprintf($this->view->translate($messageid), $args), false));
    } catch (Exception $e) {
        return $this->_bbcode->render($this->view->escape($this->view->translate($messageid), false));
    }
  }

}