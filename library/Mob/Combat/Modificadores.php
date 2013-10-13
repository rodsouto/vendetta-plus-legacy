<?php

class Mob_Combat_Modificadores extends Mob_Combat_Abstract {
  
    protected function _fight($tropasBatalla) {
        
        $this->_dataBatalla = array();
                                                    
        $ronda = 1;

        $hayTropasAtacante = $hayTropasDefensor = true;

        while ($ronda <= 5 && ($hayTropasAtacante && $hayTropasDefensor)) {
            //echo "<h2>RONDA $ronda</h2>";
            
            $this->_dataBatalla[$ronda] = array("tropas" => array(), "ataquesA" => array(), "ataquesD" => array()); 
                                                   
            $hayTropasAtacante = $hayTropasDefensor = false; 
            
            foreach ($tropasBatalla as $tropa => $data) {
                if (round($data["a"]["total"]) == 0 && round($data["d"]["total"]) == 0) continue;
                
                $this->_dataBatalla[$ronda]["tropas"][$tropa] = 
                  array("a" => $data["a"]["total"], "muertesA" => 0, "d" => $data["d"]["total"], "muertesD" => 0);               
            }

            // ataques del atacante
            //echo "<h3>Atacante</h3>";
            $PAA = $PDA = $PAD = $PDD = 0;
            foreach ($tropasBatalla as $tropa => $data) {
                if (round($data["a"]["total"]) == 0) continue;
                $enemigo = $this->_getRival($tropa, $tropasBatalla, "d");
                if (empty($enemigo)) break;
                $muertes = $this->_fightMod($tropa, $enemigo, $tropasBatalla);
                $PAA += $muertes["PAA"];
                $PDA += $muertes["PDA"];
                $PAD += $muertes["PAD"];
                $PDD += $muertes["PDD"];                  
                //echo "A: $tropa matan {$muertes['d']} $enemigo con xxx Daño<br />";
                $this->_dataBatalla[$ronda]["tropas"][$tropa]["muertesA"] += $muertes["a"];
                $this->_dataBatalla[$ronda]["tropas"][$enemigo]["muertesD"] += $muertes["d"];
                
                $this->_dataBatalla[$ronda]["ataquesA"][] = array($tropa, $enemigo, $muertes['d']);
                
                $tropasBatalla[$tropa]["a"]["total"] -= $muertes["a"];
                $tropasBatalla[$enemigo]["d"]["total"] -= $muertes["d"];
                                
                $hayTropasAtacante = $hayTropasAtacante || round($tropasBatalla[$tropa]["a"]["total"]) > 0;
                $hayTropasDefensor = $hayTropasDefensor || round($tropasBatalla[$enemigo]["d"]["total"]) > 0;
            } 
            //echo "<h3>Defensor</h3>";
            // ataques del defensor           
            foreach ($tropasBatalla as $tropa => $data) {
                if (round($data["d"]["total"]) == 0) continue;
                $enemigo = $this->_getRival($tropa, $tropasBatalla, "a");
                if (empty($enemigo)) break;
                $muertes = $this->_fightMod($enemigo, $tropa, $tropasBatalla);
                $PAA += $muertes["PAA"];
                $PDA += $muertes["PDA"];
                $PAD += $muertes["PAD"];
                $PDD += $muertes["PDD"];                  
                //echo "D: $enemigo matan {$muertes['a']} $tropa con xxx Daño<br />";
                $this->_dataBatalla[$ronda]["tropas"][$enemigo]["muertesA"] += $muertes["a"];
                $this->_dataBatalla[$ronda]["tropas"][$tropa]["muertesD"] += $muertes["d"];
                
                $this->_dataBatalla[$ronda]["ataquesD"][] = array($enemigo, $tropa, $muertes['a']);
                
                $tropasBatalla[$enemigo]["a"]["total"] -= $muertes["a"];
                $tropasBatalla[$tropa]["d"]["total"] -= $muertes["d"];
                                
                $hayTropasAtacante = $hayTropasAtacante || round($tropasBatalla[$enemigo]["a"]["total"]) > 0;
                $hayTropasDefensor = $hayTropasDefensor || round($tropasBatalla[$tropa]["d"]["total"]) > 0;
            }
            /*echo "A: Poder de ataque: $PAA Defensa: $PDA<br />
            D: Poder de ataque: $PAD Defensa: $PDD";*/
            $this->_dataBatalla[$ronda]["PAA"] = round($PAA);
            $this->_dataBatalla[$ronda]["PDA"] = round($PDA);
            $this->_dataBatalla[$ronda]["PAD"] = round($PAD);
            $this->_dataBatalla[$ronda]["PDD"] = round($PDD); 
            $ronda++;
        }  
        
        $lastRonda = sizeof($this->_dataBatalla);
         
        if (sizeof($this->_dataBatalla) != 1 && $this->_dataBatalla[$lastRonda]["ataquesA"] == array() && $this->_dataBatalla[$lastRonda]["ataquesD"] == array()) {
          unset($this->_dataBatalla[$lastRonda]);
        }
        
        $this->_tropasRestantes = $tropasBatalla; 
    }
    
    protected function _fightMod($atacante, $defensor, $tropasBatalla) {
        extract($this->_getPower($tropasBatalla, $atacante, $defensor, true));

        $PAD = $PAD * $this->_pctPoderD / 100;
        $PAA = $PAA * $this->_pctPoderA / 100;
        $PDD = $PDD * $this->_pctPoderD / 100;
        $PDA = $PDA * $this->_pctPoderA / 100;

        extract($this->_getPorcentPerdidas($PAA, $PDA, $PAD, $PDD));

        /* por cada tipo de tropa del atacante necesito saber el resultado 
        de esa tropa vs cada tipo de tropa del defensor */
        
        $at = $tropasBatalla[$atacante]['a']["total"];
        $def = $tropasBatalla[$defensor]['d']["total"];
        
        $muertesA = $at*number_format($PPA, 3);
        $muertesD = $def*number_format($PPD, 3);
                
        //echo "$atacante $at mueren $muertesA vs $defensor $def mueren $muertesD<br/>";
        //echo "PAA $PAA - PDA $PDA - PAD $PAD - PDD $PDD<br />";

        return array("a" => round($muertesA), "d" => round($muertesD), "PAA" => $PAA, "PDA" => $PDA, "PAD" => $PAD, "PDD" => $PDD);
    }
    
    protected function _getRival($tropa, $enemigos, $quien) {
        $maxModif = null;
        $maxTropas = array("trp" => null, "total" => 0);
        foreach ($enemigos as $tropaEnemiga => $data) {
            if (round($data[$quien]["total"]) <= 0) continue;
            $mod = Mob_Loader::getTropa($tropa)->getModificador($tropaEnemiga);
            
            if ($mod > 1) $maxModif = $tropaEnemiga;
            
            if ($data[$quien]["total"] > $maxTropas["total"]) {
                $maxTropas = array("trp" => $tropaEnemiga, "total" => $data[$quien]["total"]);
            }
        } 
        return isset($maxModif) ? $maxModif : $maxTropas["trp"];
    }

}