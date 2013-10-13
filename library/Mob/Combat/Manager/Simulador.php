<?php

class Mob_Combat_Manager_Simulador {

    protected $_data;
    protected $_jugadorDefensor;
    protected $_combat;
    protected $_robo;
    protected $_numberFormat;
    protected $_combatSystemClass;
    public function __construct(array $dataMisiones = null, array $options = array()) {
        $this->_numberFormat = new Mob_View_Helper_NumberFormat;
        $this->_data = $dataMisiones;
        $tropasBatalla = array();

        if (isset($options["combatSystemClass"])) {
            $this->_combatSystemClass = $options["combatSystemClass"];
        }

        
        /*$this->_jugadorAtacante = new Mob_Jugador($this->_data["id_atacante"]);
        $idEdificioAtacante = Mob_Loader::getModel("Edificio")->getPrincipal($this->_data["id_atacante"]);
        $this->_jugadorAtacante->setEdificio($idEdificioAtacante);*/

        $edAtacante = new Mob_Edificio;
        $edAtacante->load();
        foreach ($dataMisiones["entrenamientos_atacante"] as $ent => $nivel) {
          $edAtacante->getEntrenamiento($ent)->setNivel($nivel);  
        }
        
        $edDefensor = new Mob_Edificio;
        $edDefensor->load();
        foreach ($dataMisiones["entrenamientos_defensor"] as $ent => $nivel) {
          $edDefensor->getEntrenamiento($ent)->setNivel($nivel);  
        }        

        foreach ($this->_data["tropas_atacante"] as $tropa => $cantidad) {
            $tropasBatalla[$tropa]["a"] = array("total" => $cantidad, 
                    "ataque" => $edAtacante->getTropa($tropa)->getAtaque(),
                    "defensa" => $edAtacante->getTropa($tropa)->getDefensa());
            $tropasBatalla[$tropa]["d"] = array("total" => 0, "ataque" => 0, "defensa" => 0);    
        }
        
        foreach ($this->_data["tropas_defensor"] as $tropa => $cantidad) {
            if (!isset($tropasBatalla[$tropa]["a"])) {
              $tropasBatalla[$tropa]["a"] = array("total" => 0, "ataque" => 0, "defensa" => 0);
            }
            $tropasBatalla[$tropa]["d"] = array("total" => $cantidad, 
                    "ataque" => $edDefensor->getTropa($tropa)->getAtaque(),
                    "defensa" => $edDefensor->getTropa($tropa)->getDefensa());    
        }
        
        $extra = array(
          "pctPoderA" => Mob_Jugador::calcPoderAtaque($dataMisiones["cant_edificios_at"], $dataMisiones["entrenamientos_atacante"][Mob_Server::getNameEntPoderAtaque()]),
          "pctPoderD" => Mob_Jugador::calcPoderAtaque($dataMisiones["cant_edificios_def"], $dataMisiones["entrenamientos_defensor"][Mob_Server::getNameEntPoderAtaque()])
        );
        
        if ($this->_combatSystemClass == null) $this->_combatSystemClass = Mob_Server::getCombatSystemClass();
        $this->_combat = new $this->_combatSystemClass($tropasBatalla, $extra);             
    }
    
    public function getHtml() {
        $numberFormat = new Mob_View_Helper_NumberFormat;
       $html = "<table>";
       
       foreach ($this->_combat->getData() as $ronda => $info) {
          $html .= "<tr><td colspan='5' class='c'>Ronda de batalla $ronda</td></tr>";
          $html .= '<tr><td class="c">Tropas</td><td class="c">Cantidad</td><td class="c">Destruido</td><td class="c">Cantidad</td><td class="c">Destruido</td></tr>';
          
          foreach ($info["tropas"] as $tropa => $infoTropa) {
          // para mantener compatibilidad entre reportes viejos (en el idioma del atacante) y nuevos (multiidioma)
          try {
            $nombreTropa = @Mob_Loader::getTropa($tropa)->getNombre();
          } catch (Exception $e) {
            $nombreTropa = $tropa;
          }        
          $html .= "<tr><th>$nombreTropa
  					</th><th>".$numberFormat->numberFormat($infoTropa['a'])."</th><th>".$numberFormat->numberFormat($infoTropa['muertesA'])."</th>
  					<th>".$numberFormat->numberFormat($infoTropa['d'])."</th><th>".$numberFormat->numberFormat($infoTropa['muertesD'])."</th></tr>";
          }
          if (!Mob_Server::esDeModificadores()) {
              $html .= "<tr><th>Valor de defensa</th><th colspan='2'>".$numberFormat->numberFormat($info['PDA'])."</th><th colspan='2'>".$numberFormat->numberFormat($info['PDD'])."</th></tr>";
              $html .= "<tr>
              <th>Puntuación de ataque</th>
              <th colspan='2'>".$numberFormat->numberFormat($info['PAA'])." x ".$numberFormat->numberFormat($info['pctPoderA'])."% = ".$numberFormat->numberFormat(round($info['PAA']*$info['pctPoderA']/100))."</th>
              <th colspan='2'>".$numberFormat->numberFormat($info['PAD'])." x ".$numberFormat->numberFormat($info['pctPoderD'])."% = ".$numberFormat->numberFormat(round($info['PAD']*$info['pctPoderD']/100))."</th>
              </tr>";
              //$html .= '<tr><th>Oportunidad de victoria</th><th colspan="2">'.round($info["pctVictoriaA"]).'%</th><th colspan="2">'.round($info["pctVictoriaD"]).'%</th></tr>';
          }
      }
      
      return $html .= "</table>";              
    }    
    
}
