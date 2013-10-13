<?php

class Mob_Form_Familia_Fundar extends Zend_Form {

    protected $_idFamilia;

    public function init() {
        $this->setAction("/mob/familias/fundar");
        $this->addElement("text", "etiqueta", array("label" => "Etiqueta (2..8 caracteres)", 
                        "required" => true,
                        "validators" => array(
                        array("StringLength", false, array(2, 8)),
                        array("InfoFamilia", false, array("etiqueta"))
                        )));
        $this->addElement("text", "nombre", array("label" => "Nombre (2..35 caracteres)", "required" => true, 
                        "required" => true,
                        "validators" => array(
                        array("StringLength", false, array(2, 35)),
                        array("InfoFamilia", false, array("nombre"))
                        )));
        
        $this->addElementPrefixPath('Mob_Validator', 'Mob/Validator/', 'validate');
        
        $this->addElement("submit", "fundar", array("label" => "Fundar", "ignore" => true));
    }
    
    public function build($idFamilia) {
        $this->setAction("/mob/familias/cambiar/nombre/$idFamilia");
        $this->_idFamilia = $idFamilia;
        $data = Mob_Loader::getModel("Familias")->getFamilia($idFamilia);
        
        $this->etiqueta->setValue($data["etiqueta"])->getValidator("InfoFamilia")->setIdFamilia($idFamilia);
        $this->nombre->setValue($data["nombre"])->getValidator("InfoFamilia")->setIdFamilia($idFamilia);;
    }
    
    public function save($idUsuario) {
    
        if (!empty($this->_idFamilia)) {
            return Mob_Loader::getModel("Familias")->update($this->getValues(), "id_familia = ".(int)$this->_idFamilia);        
        }
    
        $idFamilia = Mob_Loader::getModel("Familias")->insert($this->getValues());
        
        Mob_Loader::getModel("Familias_Rangos")->crearRangosBasicos($idFamilia);
        
        Mob_Loader::getModel("Familias_Miembros")->agregarMiembro($idFamilia, $idUsuario, "capo");
        
        return $idFamilia;
    }

}