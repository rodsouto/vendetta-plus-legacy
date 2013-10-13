<?php

class Mob_Db_Table_Abstract extends Zend_Db_Table_Abstract {

  protected $_cache;

  public function init() {
    $this->_cache = Mob_Cache_Factory::getInstance("query");    
  }

}