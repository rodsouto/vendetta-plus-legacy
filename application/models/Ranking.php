<?php

class Mob_Model_Ranking extends Zend_Db_Table_Abstract {

    protected $_name = "mob_ranking";
    protected $_primary = "id_ranking";
    
    public function getRanking($idUsuario, $tipo = 1) {
        return (int)$this->_db->fetchOne("SELECT rank FROM {$this->_name} WHERE 
            id_usuario = ".(int)$idUsuario." AND tipo = ".(int)$tipo." LIMIT 1");
    }
    
}