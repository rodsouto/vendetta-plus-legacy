<?php

/*
CREATE TABLE  `mob_timeline_mentions` (
`id_mention` INT NOT NULL AUTO_INCREMENT PRIMARY KEY ,
`id_timeline` INT NOT NULL ,
`id_usuario` INT NOT NULL ,
`id_usuario_mention` INT NOT NULL ,
INDEX (  `id_usuario` ,  `id_usuario_mention`, `id_timeline` )
) ENGINE = MYISAM ;
*/

class Mob_Model_Timeline_Mentions extends Zend_Db_Table_Abstract {

    protected $_name = "mob_timeline_mentions";
    protected $_primary = "id_mention";

}