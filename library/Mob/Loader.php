<?php

class Mob_Loader {

  protected function _load($class) {
  if (!Zend_Registry::isRegistered($class)) {
      if (!class_exists($class)) throw new Exception("Invalid class $class");
      Zend_Registry::set($class, new $class);  
    }
    
    return Zend_Registry::get($class);  
  }

  public function getModel($model) {
    return self::_load("Mob_Model_$model");  
  
  }

  public function getClass($class) {
    return self::_load("Mob_$class");  
  }
  
  public function getClassHabitacion($habitacion) {
    return "Mob_Habitacion_".ucwords(Mob_Server::getGameType())."_".ucwords($habitacion);
  }
  
  public function getHabitacion($class) {
    return self::_load(self::getClassHabitacion($class));  
  }

  public function getClassEntrenamiento($entrenamiento) {
    return "Mob_Entrenamiento_".ucwords(Mob_Server::getGameType())."_".ucwords($entrenamiento);
  }
  
  public function getEntrenamiento($class) {
    return self::_load(self::getClassEntrenamiento($class));  
  }
  
  public function getEntrenamientos() {
    return array_map(create_function('$ent', 'return Mob_Loader::getEntrenamiento($ent);'), Mob_Data::getEntrenamientos());
  }
  
  public function getHabitaciones() {
    return array_map(create_function('$hab', 'return Mob_Loader::getHabitacion($hab);'), Mob_Data::getHabitaciones());
  }
  
  public function getTropas($tipo = null) {
    return array_map(create_function('$tropa', 'return Mob_Loader::getTropa($tropa);'), Mob_Data::getTropas($tipo));
  }

  public function getClassTropa($tropa) {
      return "Mob_Tropa_".ucwords(Mob_Server::getGameType())."_".ucwords(Mob_Data::getTipoTropa($tropa))."_".ucwords($tropa);
  }
  
  public function getTropa($tropa) {
      return self::_load(self::getClassTropa($tropa));
  }

}