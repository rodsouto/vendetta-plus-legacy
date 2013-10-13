<?php

class Mob_Cache_Factory {

  protected static $_instance;

  public function getInstance($type) {
    if (!isset(self::$_instance[$type])) {
      $frontendOptions = array('lifetime' => 600, 'automatic_serialization' => true);

      if ($type == "query") {
        $backendOptions = array('cache_dir' => PUBLIC_PATH.'/cacheFiles/querys');
      } elseif ($type == "html") {
        $backendOptions = array('cache_dir' => PUBLIC_PATH.'/cacheFiles/html');
      }
      self::$_instance[$type] = Zend_Cache::factory('Core', 'File', $frontendOptions,$backendOptions);    
    }
    return self::$_instance[$type];
  }

}