<?php

abstract class Mob_Combat_Abstract {

    protected $_tropasBatalla;
    protected $_tropasRestantes;
    protected $_dataBatalla;
    protected $_pctPoderA = 100;
    protected $_pctPoderD = 100;
    
    public function __construct(array $tropasBatalla, array $extra = array()) {
        if (isset($extra["pctPoderA"])) $this->_pctPoderA = $extra["pctPoderA"];
        if (isset($extra["pctPoderD"])) $this->_pctPoderD = $extra["pctPoderD"];
        $this->_tropasBatalla = $tropasBatalla;        
        return $this->_fight($tropasBatalla);
    }
    
    protected function _getPower(array $tropasBatalla, $trpAt = null, $trpDef = null, $modificadores = false) {
        $PAD = $PDD = $PAA = $PDA = 0;
        
        foreach ($tropasBatalla as $tropa => $data) {
              if ($trpAt === null || $trpAt == $tropa) {
                $PDA += $data["a"]["total"] * $data["a"]["defensa"];
                $PAA += $data["a"]["total"] * $data["a"]["ataque"];
              }
              
              if ($trpDef === null || $trpDef == $tropa) {
                $PDD += $data["d"]["total"] * $data["d"]["defensa"];
                $PAD += $data["d"]["total"] * $data["d"]["ataque"];
              }        
        }
        
        if ($modificadores) {
          $modAt = Mob_Loader::getTropa($trpAt)->getModificador($trpDef);
          $PAA *= $modAt;
          $PDA *= $modAt;
          
          $modDef = Mob_Loader::getTropa($trpDef)->getModificador($trpAt);
          $PAD *= $modDef;
          $PDD *= $modDef;
        }
        
        return array("PDA" => $PDA, "PAA" => $PAA, "PDD" => $PDD, "PAD" => $PAD);    
    }
    
    abstract protected function _fight($tropasBatalla);

/**
   * @return value of units remain by agressor
   * # units remain by defender = 1 - value of return
   * # attack value of $values of attacker are the accumulated values of all Units of attacker
   * # defence value of $values of attacker are the accumulated values of all Units of attacker
   * # attack value of $values of defender are the accumulated values of all Units of defender
   * # defence value of $values of defender are the accumulated values of all Units of defender
   * # formula is needed once per Round.
   */
  public function scrap_calc($values){

    //-> agressor
      $aaw = $values["PAA"]; //attack 
      $avw = $values["PDA"]; //defence
    //<- end
    
    //-> defender
      $vaw = $values["PAD"]; //attack
      $vvw = $values["PDD"]; //defence
    //<- end
    
    if ($vaw == 0 || $vvw == 0) return 1;
    
    $a = log($aaw / $vaw);
    $b = log($avw / $vvw);
    $c = pow($aaw, '1.5') / (pow($aaw, '1.5') + pow($vaw, '1.5'));
    $d = pow($avw, '1.5') / (pow($avw, '1.5') + pow($vvw, '1.5'));

    $e = $c + $d;
    $f = pow($e, '1.13') / '2.144';
    
    if ($f < 0.2){
      $remains = $f;
    }
    else{
      $g = '-0.7675' * ('1.019865' * ($a + $b));
      $h = '1' + pow('2.718', $g);
      $remains = '1' / pow($h, '1.10661');
    }
    
    return $remains;
  } 

    protected function _getPorcentPerdidas($PAA, $PDA, $PAD, $PDD) {
    
    /*$PPA = $this->scrap_calc(array("PAA" => $PAA, "PDA" => $PDA, "PAD" => $PAD, "PDD" => $PDD));
    Zend_Debug::dump(array("PAA" => $PAA, "PDA" => $PDA, "PAD" => $PAD, "PDD" => $PDD));*/
    
        if (($PAD+$PDD) > ($PAA+$PDA) * 10) {
          $PPD = 0;
          $PPA = 1;
        } elseif (($PAA+$PDA) > ($PAD+$PDD) * 10) {
          $PPA = 0;  
          $PPD = 1;       
        } else {
        
          $PPA = ($PAD + $PDD) / ($PAD + $PDD + ($PAA +$PDA)*2);
          $PPD = ($PAA + $PDA) / ($PAA + $PDA + ($PAD +$PDD)*2);
          
          $totalDef = $PAD + $PDD;
          $totalAt = $PAA +$PDA;
          if ($totalAt > $totalDef) {
            $kAt = (($totalAt*100/$totalDef)-100)/10;
            $kDef = 0;
          } else {
            $kAt = 0;
            $kDef = (($totalDef*100/$totalAt)-100)/10;
          }
          
          $kAt /= 2;
          $kDef /= 2;
          
          $PPA = $PPA - $PPA*$kAt/100;
          $PPD = $PPD - $PPD*$kDef/100; 
        }
        return array("PPA" => $PPA, "PPD" => $PPD);
        //return array("PPA" => 1-$PPA, "PPD" => $PPA);
    }
    
    public function getPuntosPerdidos($quien) {
        $ptos = 0;
        
        foreach ($this->getTropasRestantes($quien) as $tropa => $total) {
          $ptos += Mob_Loader::getTropa($tropa)->getPuntos() * $total;
        }
        return $this->getPuntosTotales($quien) - $ptos;
    }
    
    public function getTropasRestantes($quien) {
        $return = array();
        $quien = $quien == "atacante" ? "a" : "d";
        foreach ($this->_tropasRestantes as $tropa => $c) {
            if ((int)$c[$quien]["total"] > 0) $return[$tropa] = (int)$c[$quien]["total"];
        }

        return $return;
    }
    
    public function getTropas($quien) {
        $return = array();
        $quien = $quien == "atacante" ? "a" : "d";
        foreach ($this->_tropasBatalla as $tropa => $data) {
          $return[$tropa] = $data[$quien]["total"];
        }            
        return $return;
    }
    
    public function getPuntosTotales($quien) {
        $quien = $quien == "atacante" ? "a" : "d";
        $puntos = 0;
        foreach ($this->_tropasBatalla as $tropa => $data) {
            $puntos += Mob_Loader::getTropa($tropa)->getPuntos() * $data[$quien]["total"];
        }
        return $puntos;
    }
    
    public function getData() {
        return $this->_dataBatalla;
    }

}