<?php

/*
CREATE TABLE  `mob_timeline` (
`id_timeline` INT NOT NULL AUTO_INCREMENT PRIMARY KEY ,
`id_usuario` INT NOT NULL ,
`mensaje` VARCHAR( 140 ) NOT NULL ,
`fecha` DATETIME NOT NULL ,
INDEX (  `id_usuario` )
) ENGINE = MYISAM ;
*/

class Mob_Model_Timeline extends Zend_Db_Table_Abstract {

    protected $_name = "mob_timeline";
    protected $_primary = "id_timeline";
    
    public function getFirmasRecibidas($idUsuario, $pagina = 1, $cantidad = 10) {
    
        echo $query = $this->select()->from(array("t" => $this->_name), array("mensje", "fecha", "id_timeline"))
        ->setIntegrityCheck(false)
        ->joinLeft(array("m" => "mob_timeline_mentions"), "m.id_timeline = t.id_timeline", 
        array("id_emisor" => "id_usuario", "id_receptor" => "id_usuario_timeline"))
        ->where("m.id_usuario_mention = ?", (int)$idUsuario)
        ->order("t.id_timeline DESC")
        ->limitPage($pagina, $cantidad);
    
        $query = "SELECT t.mensaje, t.fecha, m.id_usuario as id_emisor, m.id_usuario_mention as id_receptor FROM {$this->_name} t 
        LEFT JOIN mob_timeline_mentions m ON t.id_timeline = m.id_timeline
        WHERE m.id_usuario_mention = ".(int)$idUsuario." ORDER BY t.id_timeline DESC";
    
        
    }

}