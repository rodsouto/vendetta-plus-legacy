<?php

class Zend_View_Helper_TestBar extends Zend_View_Helper_Abstract {

    protected $_form;

  public function testBar ($action = null) { 
    if (Mob_Server::getSubDomain() != "test") return;
    if ($action !== null) return $this->getForm();
 
    $return = "<style>
    #testBar {  background-color: #CCCCCC;
    overflow: hidden;clear: both;}
    #testBar .testSubForm {border: 1px solid black;
    overflow: hidden;
    padding: 5px;display: none;}
    #testBar .testSubForm .elWrapper {float: left;
    padding: 2px;
    width: 170px;}
    #testBar .testSubForm .elWrapper label {  display: block;}
    #testBar .testSubForm .elWrapper input { width: 25px;}
    </style>
    <script>
    $(function(){
    $('.linkTest').click(function(event){
      event.preventDefault();
      $(this).parent().next().toggle('slow');
    });
    });
    </script>
    ";
    $return .= $this->getForm()->render();
    
    return $return;
  }
  
  public function getForm() {
    if ($this->_form !== null) return $this->_form;
    return $this->_form = new Mob_Form_TestBar;
  }

}