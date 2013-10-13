<?php

class Mob_Validator_Destinatarios extends Zend_Validate_Abstract {

    const DESTINATARIO_INVALIDO = 'DESTINATARIO_INVALIDO';
    
    protected $_messageTemplates = array(
        self::DESTINATARIO_INVALIDO => '%value% no es un destinatario valido.'
    );
    
    public function isValid($value, $context = null) {
        $value = (string) $value;
        $this->_setValue($value);

        $error = false;

        $destinatarios = explode(",", $value);
        
        foreach ($destinatarios as $dest) {
            if (!Mob_Loader::getModel("Usuarios")->existe(trim($dest))) {
                $error = true;
                $this->_error(self::DESTINATARIO_INVALIDO, trim($dest));
                break;
            }
        } 

        return !$error;
    }
}

