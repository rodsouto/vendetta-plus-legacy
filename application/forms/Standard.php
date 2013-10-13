<?php

class Mob_Form_Standard extends Zend_Form {

  public function __construct($options = null)
  {
      if (is_array($options)) {
          $this->setOptions($options);
      } elseif ($options instanceof Zend_Config) {
          $this->setConfig($options);
      }

      // Extensions...
      $this->init();

      $this->setElementFilters(array("StringTrim", "StripTags"));

      $this->loadDefaultDecorators();
  }

  public function loadDefaultDecorators() {
    $this->addDecorator('FormElements')
                 ->addDecorator('HtmlTag', array('tag' => 'div'))
                 ->addDecorator('Form');
  }

}