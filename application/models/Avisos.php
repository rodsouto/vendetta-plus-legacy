<?php

class Mob_Model_Avisos extends Zend_Db_Table_Abstract {

    protected $_name = "mob_mensajes_avisos";
    protected $_primary = "id_aviso";
    protected $_lastQuery;
    
    protected $_tiposAvisos = array(
      1 => "edificio_no_existe",
      2 => "ataque_a_ti_mismo",
      3 => "unidades_involucradas_pelea",
      4 => "tropas_estacionadas",
      5 => "imposible_estacionar",
      6 => "recursos_recibidos",
      7 => "recursos_entregados",
      8 => "edificio_ocupado",
      9 => "ocupacion_sin_tropa",
      10 => "edificio_ya_ocupado",
      11 => "tropa_regreso",
    );
    
    public function getLastQuery() {
        return $this->_lastQuery;
    }
    
    public function agregar(array $data) {
      
    }
    
    public function aviso($idUsuario, $tipoAviso, $texto, $fechaEnviado = null) {
        $this->enviar(0, array("id_destinatarios" => $idUsuario, "mensaje" => $texto, "fecha_enviado" => $fechaEnviado));
    }
}