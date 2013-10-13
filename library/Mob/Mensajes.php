<?php

class Vendetta_Mensajes {

    protected $mensajes;

    public function __construct($id_usuario) {
        $this->_id_usuario = $id_usuario;
    }

    public function insert($para, $asunto, $mensaje, $fecha_enviado="", $de=false) {
        $data = array(
            "remitente" => $de===false ? $this->_id_usuario : $de,
            "destinatario" => $para,
            "mensaje" => $mensaje,
            "asunto" => $asunto,
            "fecha_enviado" => empty($fecha_enviado) ? date("Y-m-d H:i:s") : $fecha_enviado
        );

        return Zend_Registry::get("dbAdapter")->insert("vendetta_mensajes", $data);
    }
    
    public function getMensajes($tipo) {
        /* $tipo = enviados, recibidos */
        $t = array("enviados" => "remitente", "recibidos" => "destinatario");
        $v = array("enviados" => "borrado_rem", "recibidos" => "borrado_dest");
        $q = sprintf("SELECT * FROM vendetta_mensajes WHERE %s = %s AND %s=0 ORDER BY fecha_enviado DESC", $t[$tipo], $this->_id_usuario, $v[$tipo]);

        return Zend_Registry::get("dbAdapter")->fetchAll($q);
    }
    
    public function getTipo($id) {
        /* para saber si un mensaje fue enviado o recibido */
        $q = "SELECT remitente, destinatario FROM vendetta_mensajes WHERE id=$id";
        $res = Zend_Registry::get("dbAdapter")->fetchAll($q);
        
        if ($res[0]["destinatario"]==$this->_id_usuario) return "destinatario";
        if ($res[0]["remitente"]==$this->_id_usuario) return "remitente";
        return false;
    }
    
    public function borrar($id) {

        $tipo = $this->getTipo($id);
        if ($tipo===false) return false;

        $campo = sprintf("borrado_%s", $tipo=="destinatario" ? "dest" : "rem");
        $update = array($campo => 1);
        return Zend_Registry::get("dbAdapter")->update("vendetta_mensajes", $update, "id=$id");
    }

}