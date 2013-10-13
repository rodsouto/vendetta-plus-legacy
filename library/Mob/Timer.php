<?php

class Mob_Timer {
	
	public static function timeFormat($time){
	   $ret = "";             
		if ($time>(60*60*24)) {
			$dias=floor($time/(60*60*24));
			$ret=sprintf(Zend_Registry::get("Zend_Translate")->_("x dias"), $dias).", ";
			$segundos_restantes=$time%(60*60*24);
		} else $segundos_restantes=$time;
        
		$horas=$segundos_restantes/(60*60);
		$horas=floor($horas);
		if (strlen($horas) == 1) $horas = "0".$horas;
		$ret.="$horas:";
		$minutos=$segundos_restantes%(60*60);
		$minutos=floor($minutos/60);
		if (strlen($minutos) == 1) $minutos = "0".$minutos;
		$ret.="$minutos:";
		$segundos=floor($segundos_restantes%60);
		if (strlen($segundos) == 1) $segundos = "0".$segundos;
		$ret.=$segundos;
		return $ret;
	}
	
	public function dateFormat($time) {
	  if (!is_numeric($time)) $time = strtotime($time);
    return date("D, m.d.Y -  H:i:s", $time);
  }
	
}