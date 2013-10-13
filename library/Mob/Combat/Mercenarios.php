<?php

class Mob_Combat_Mercenarios extends Mob_Combat_Abstract {

    protected function _fight($tropasBatalla) {
        
        $this->_dataBatalla = array();
                                                    
        $ronda = 1;

        $hayTropasAtacante = $hayTropasDefensor = true;
        
        while ($ronda <= 5 && ($hayTropasAtacante && $hayTropasDefensor)) {
            
            extract($this->_getPower($tropasBatalla));
        
            $this->_dataBatalla[$ronda] = array("PAD" => $PAD, "PDD" => $PDD, "PDA" => $PDA, "PAA" => $PAA, 
                                                  "pctPoderA" => $this->_pctPoderA, "pctPoderD" => $this->_pctPoderD);
        
            $PAD = $PAD * $this->_pctPoderD / 100;
            $PAA = $PAA * $this->_pctPoderA / 100;
            
            extract($this->_getPorcentPerdidas($PAA, $PDA, $PAD, $PDD));
            
            $hayTropasAtacante = $hayTropasDefensor = false;

            /*$this->_dataBatalla[$ronda]["pctVictoriaA"] = ((pow($PAA, 2) * $PDA) / ( (pow($PAA, 2) * $PDA) + (pow($PAD, 2) * $PDD))) * 100;
            $this->_dataBatalla[$ronda]["pctVictoriaD"] = 100 - $this->_dataBatalla[$ronda]["pctVictoriaA"];*/ 

            $this->_dataBatalla[$ronda]["pctVictoriaA"] = round(($PAA + $PDA)*100/($PAA + $PDA + $PAD + $PDD));
            $this->_dataBatalla[$ronda]["pctVictoriaD"] = 100 - $this->_dataBatalla[$ronda]["pctVictoriaA"];

            foreach ($tropasBatalla as $tropa => $data) {
            
                if (round($data["a"]["total"]) == 0 && round($data["d"]["total"]) == 0) continue;
                
                $at = $data['a']["total"];
                $def = $data['d']["total"];
                
                $muertesA = $at*number_format($PPA, 3);
                $muertesD = $def*number_format($PPD, 3);
                
                $this->_dataBatalla[$ronda]["tropas"][$tropa] = array("a" => round($at), "muertesA" => round($muertesA), "d" => round($def), "muertesD" => round($muertesD));

                $tropasBatalla[$tropa]["a"]["total"] = round($at-$muertesA);
                $tropasBatalla[$tropa]["d"]["total"] = round($def-$muertesD);
                                
                $hayTropasAtacante = $hayTropasAtacante || round($tropasBatalla[$tropa]["a"]["total"]) > 0;
                $hayTropasDefensor = $hayTropasDefensor || round($tropasBatalla[$tropa]["d"]["total"]) > 0;
            }            
            
            $ronda++;
        }        
       
       $this->_tropasRestantes = $tropasBatalla; 
    }

}