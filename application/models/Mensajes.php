<?php

class Mob_Model_Mensajes extends Zend_Db_Table_Abstract {

    protected $_name = "mob_mensajes";
    protected $_primary = "id_mensaje";
    protected $_lastQuery;
    
    public function getLastQuery() {
        return $this->_lastQuery;
    }

    public function enviar($idRemitente, $data) {
        if (isset($data["destinatarios"])) {
            $destinatarios = explode(",", trim($data["destinatarios"], ","));
            foreach ($destinatarios as $k => $dest) {
                $destinatarios[$k] = Mob_Loader::getModel("Usuarios")->getIdByNombre($dest);
            }
            
        } else {
            $destinatarios = is_array($data["id_destinatarios"]) 
                                            ? $data["id_destinatarios"] 
                                            : array($data["id_destinatarios"]);
            unset($data["id_destinatarios"]);
        }
        $insert = $data;
        unset($insert["destinatarios"]);
        
        $insert["remitente"] = $idRemitente;
        $insert["fecha_enviado"] = isset($data["fecha_enviado"]) ? $data["fecha_enviado"] : date("Y-m-d H:i:s");
        
        $ok = true;
        
        foreach ($destinatarios as $dest) {
            $insert["destinatario"] = $dest;
            $ok = $this->insert($insert) && $ok;    
        }
        
        return $ok;
    }
    
    public function getTotalCarpeta($idUsuario, $idCarpeta) {
        $query = $this->select()->from($this->_name, "(COUNT(*))")
                                ->where("destinatario = ?", $idUsuario)
                                ->where("borrado_dest = 0")
                                ->where("id_carpeta = ?", (int)$idCarpeta)
                                ->where("remitente != 0");
        return $this->_db->fetchOne($query);
    }
    
    public function getTotalAlertas($idUsuario) {
        $query = $this->select()->from($this->_name, "(COUNT(*))")
                                ->where("destinatario = ?", $idUsuario)
                                ->where("borrado_dest = 0")
                                ->where("remitente = 0")
                                ->where("id_carpeta = 0");
        return $this->_db->fetchOne($query);
    }
    
    public function getMensajes($idUsuario, $idCarpeta, $page = 1, $count = 20) {
        $query = $this->_lastQuery = $this->select()->where("destinatario = ?", $idUsuario)
                                ->where("borrado_dest = 0")
                                ->order("fecha_enviado DESC")
                                ->order("id_mensaje DESC")
                                ->limitPage($page, $count);
                                
        if ($idCarpeta == "alerts") {
            // en la carpeta alerts solo muestro alertas que no hayan sido movidas a otra carpeta
            $query->where("remitente = 0")->where("id_carpeta = 0");
        } else {
            $query->where("id_carpeta = ?", $idCarpeta);
            if ($idCarpeta == 0) {
              // en la bandeja de entrada solo muestro mensajes de otros usuarios, en otra carpeta puedo tener cualquier tipo de mensaje
              $query->where("remitente != 0");
            }
        }
        
        return $this->fetchAll($query)->toArray();
    }
    
    public function tieneMensajesNuevos($idUsuario) {
        return Mob_Loader::getModel("Mensajes_NoLeidos")->tieneMensajes($idUsuario);
    }

    public function tieneAlertasNuevas($idUsuario) {
        return Mob_Loader::getModel("Mensajes_NoLeidos")->tieneAlertas($idUsuario);
    }
    
    public function marcarLeido($idUsuario, $idCarpeta) {
        if ($idCarpeta == "alerts") {
            $this->update(array("leido" => 1), "destinatario = ".(int)$idUsuario." AND remitente = 0");
            Mob_Loader::getModel("Mensajes_NoLeidos")->marcarLeido($idUsuario, 0);
        } else {
            $this->update(array("leido" => 1), "remitente != 0 AND destinatario = ".(int)$idUsuario." AND id_carpeta = ".(int)$idCarpeta);
            Mob_Loader::getModel("Mensajes_NoLeidos")->marcarLeido($idUsuario, 1);
        }
    }
    
    public function aviso($idUsuario, $tipoAviso, $texto, $fechaEnviado = null) {
        $this->enviar(0, array("id_destinatarios" => $idUsuario, "mensaje" => $texto, "fecha_enviado" => $fechaEnviado));
    }

    public function insert(array $data) {
        try {
            Mob_Loader::getModel("Mensajes_NoLeidos")->insert(array("id_usuario" => (int)$data["destinatario"], 
                "remitente" => $data["remitente"] == 0 ? 0 : 1));
        } catch (Exception $e) {}     

        return parent::insert($data);
    }
}
