<?php
/*
CREATE TABLE `mob_mercado` (
`id_mercado` INT NOT NULL AUTO_INCREMENT PRIMARY KEY ,
`recurso` VARCHAR( 3 ) NOT NULL ,
`cantidad` INT NOT NULL ,
`compra_arm` INT NOT NULL ,
`compra_mun` INT NOT NULL ,
`compra_dol` INT NOT NULL ,
`id_vendedor` INT NOT NULL ,
`id_comprador` INT NOT NULL ,
INDEX (  `recurso` ,  `id_vendedor` ,  `id_comprador` )
) ENGINE = MYISAM ;

ALTER TABLE  `mob_mercado` ADD  `cantidad_dev` INT NOT NULL ,
ADD  `compra_arm_dev` INT NOT NULL ,
ADD  `compra_mun_dev` INT NOT NULL ,
ADD  `compra_dol_dev` INT NOT NULL;

ALTER TABLE  `mob_mercado` ADD  `fecha_inicio` DATETIME NOT NULL;
ALTER TABLE  `mob_mercado` ADD  `fecha_fin` DATETIME NOT NULL;

ALTER TABLE  `mob_mercado` ADD  `aceptada` BOOL NOT NULL;

*/
class Mob_Model_Mercado extends Zend_Db_Table_Abstract {

    protected $_name = "mob_mercado";
    protected $_primary = "id_mercado";
    // 10 dias
    protected $_duracionComercio = 10;        
    public function getEnCurso($idUsuario) {
        /*$query = $this->select()->where("(id_vendedor = :idUsuario AND cantidad - cantidad_dev > 0) OR 
       (id_comprador = :idUsuario AND (compra_arm - compra_arm_dev > 0 OR
                                compra_mun - compra_mun_dev > 0 OR
                                compra_dol - compra_dol_dev > 0))")
                                ->where("aceptada = 1")
                                ->where("fecha_fin > ?", date("Y-m-d H:i:s"));*/
        $query = $this->select()->where("(id_vendedor = :idUsuario OR id_comprador = :idUsuario) AND 
        ((cantidad - cantidad_dev > 0) OR 
       (compra_arm - compra_arm_dev > 0 OR compra_mun - compra_mun_dev > 0 OR compra_dol - compra_dol_dev > 0))")
                                ->where("aceptada = 1")
                                ->where("fecha_fin > ?", date("Y-m-d H:i:s"));
        return $this->_db->fetchAll($query, array("idUsuario" => (int)$idUsuario));
    }
    
    public function getPendientes($idUsuario) {
        $query = $this->select()->where("id_vendedor = :idUsuario OR id_comprador = :idUsuario")
                                ->where("aceptada = 0");
        return $this->_db->fetchAll($query, array("idUsuario" => (int)$idUsuario));
    }
    
    public function aceptar($idUsuario, $idMercado) {
        return $this->update(array(
                                "fecha_inicio" => date("Y-m-d H:i:s"), 
                                "fecha_fin" => date("Y-m-d H:i:s", strtotime("+".$this->_duracionComercio." days")),
                                "aceptada" => 1), "aceptada = 0 AND id_comprador = ".(int)$idUsuario." AND id_mercado = ".(int)$idMercado);
    }
    
    public function cancelar($idUsuario, $idMercado) {
        return $this->delete("(aceptada = 0 AND id_vendedor = ".(int)$idUsuario." OR id_comprador = ".(int)$idUsuario.") AND id_mercado = ".(int)$idMercado);
    }
            
    public function getIdSocio($idMercado, $idUsuario) {
        $data = $this->find((int)$idMercado)->toArray();
        if (empty($data)) return 0;
        return $data[0]["id_comprador"] == $idUsuario ? $data[0]["id_vendedor"] : $data[0]["id_comprador"];
    }
    
    // busca si emisor tiene alguna deuda pendiente con receptor y la salda
    public function saldarTransaccionPendiente($idEmisor, $idReceptor, $arm, $mun, $dol) {
    
        if ($idEmisor == $idReceptor) return false;
    
        // caso 1: emisor es el que vende
        $where1 = "id_vendedor = $idEmisor AND id_comprador = $idReceptor 
                    AND (
                        (recurso = 'arm' AND cantidad - cantidad_dev >= $arm AND $arm != 0)
                        OR
                        (recurso = 'mun' AND cantidad - cantidad_dev >= $mun AND $mun != 0)
                        OR
                        (recurso = 'dol' AND cantidad - cantidad_dev >= $dol AND $dol != 0)
                        )";
    
        // caso 2: emisor es el que compra
        $where2 = "id_comprador = $idEmisor AND id_vendedor = $idReceptor
                    AND (
                        ($arm != 0 AND compra_arm - compra_arm_dev >= $arm) OR
                        ($mun != 0 AND compra_mun - compra_mun_dev >= $mun) OR
                        ($dol != 0 AND compra_dol - compra_dol_dev >= $dol)
                        )";
        
        $query = $this->select()->where("($where1) OR ($where2)")
                                ->where("aceptada = 1")
                                ->where("fecha_fin > ?", date("Y-m-d H:i:s"))
                                ->order("id_mercado ASC")
                                ->limit(1);
        $data = $this->_db->fetchAll($query);
        
        /*if (false) {
            Zend_Debug::dump($query->__toString(), "query");
            Zend_Debug::dump($data, "data");
        }*/
        
        if (empty($data)) return false;
        $data = $data[0];
        $update = array();
        if ($data["id_comprador"] == $idEmisor) {
            // saldo las compras
            // si de algun recurso envie mas de lo que tenia que enviar, es un transporte normal, no se salda el comercio
            
            foreach (array("arm", "mun", "dol") as $v) {
                if ($data["compra_".$v] - $data["compra_".$v."_dev"] < ${$v}) return false;
                
                if (${$v}) $update[] = "compra_".$v."_dev = compra_".$v."_dev + ".(int)${$v};
            }            
        } else {
            // saldo la venta
            $recursoVendido = $data["recurso"];
            $tmpRecursos = array_filter(array("arm" => $arm, "mun" => $mun, "dol" => $dol));
            // el recurso que envie no es el que tengo que saldar, es un transporte normal
            if (sizeof($tmpRecursos) != 1 || empty($tmpRecursos[$recursoVendido])) return false;
            $update = array("cantidad_dev = cantidad_dev + ".(int)${$recursoVendido});
        }
        $queryUpdate = "UPDATE mob_mercado SET %s WHERE id_mercado = ".(int)$data["id_mercado"]." LIMIT 1";
        
        if (empty($update)) return false;
        
        $queryUpdate = sprintf($queryUpdate, implode(", ", $update));
        //if (false) {var_dump($queryUpdate);die();}
           
        $this->_db->query($queryUpdate);

        return $data["id_mercado"];      
    }
}