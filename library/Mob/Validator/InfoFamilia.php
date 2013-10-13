<?php

class Mob_Validator_InfoFamilia extends Zend_Validate_Abstract {

    protected $_idFamilia = null;
    protected $_infoFamilia = null;
    const DATO_INVALIDO = 'DATO_INVALIDO';
    
    protected $_messageTemplates = array(
        self::DATO_INVALIDO => 'Ya existe una familia con ese nombre o etiqueta'
    );
    
    public function __construct($infoFamilia) {
        $this->_infoFamilia = $infoFamilia;
    }
    
    public function setIdFamilia($idFamilia) {
        $this->_idFamilia = $idFamilia;
        return $this;
    }
    
    public function isValid($value, $context = null) {
        $value = (string) $value;
        $this->_setValue($value);
    

        $familias = Mob_Loader::getModel("Familias");
        $query = $familias->select()->where("{$this->_infoFamilia} = ?", $value)->limit(1);
        $data = $familias->fetchAll($query)->toArray();

        // no hay ninguna familia con los datos que pusimos
        if (empty($data)) return true;
 
        // hay alguna familia con estos datos, es la nuestra??
        if (empty($this->_idFamilia)) {
            // si no hay ningun idFamilia           
            $this->_error(self::DATO_INVALIDO);
            return false;
        }
        
        if ($data[0]["id_familia"] == $this->_idFamilia) return true;
        
        $this->_error(self::DATO_INVALIDO);
        return false;
    }
}

