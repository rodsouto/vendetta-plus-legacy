<?php

class Mob_Form_Familia_Rangos_Admin extends Zend_Form {

    public function build($idFamilia) {
        $this->setAction("/mob/familias/administrar");
        $rangosFamilia = Mob_Loader::getModel("Familias_Rangos")->getRangos($idFamilia);
        $permisos = array("leer_mensaje", "escribir_mensaje", "borrar_mensaje", 
                            "aceptar_miembro", "enviar_circular", "recibir_circular");
        
        foreach ($rangosFamilia as $r) {
            
            $subForm = new Zend_Form_SubForm(
                    array(
                        "decorators" => array("FormElements", "Fieldset")
                    )
                );
            $subForm->setElementDecorators(array("ViewHelper", "Label"));
            foreach($permisos as $p) {
                $subForm->addElement("checkbox", $p, 
                            array("label" => $p, 
                                    "value" => $r[$p]));
                if ($r["tipo"] < 4) $subForm->$p->setAttrib("disabled", "disabled")->setUncheckedValue($r[$p]);
            }
            $subForm->setLegend($r["nombre"]);
            $this->addSubform($subForm, "sub_".$r["id_rango"]);
        }

        $this->setDecorators(array("FormElements", "Form"));
        //->setElementsDecorators(array("));

        $this->addElement("submit", "guardarRangosAdmin", array("label" => "Guardar", "ignore" => true));
        


    }
    
    public function save($idFamilia) {
        foreach ($this->getValues() as $idRango => $data) {
            Mob_Loader::getModel("Familias_Rangos")->update($data, "id_rango = ".(int)substr($idRango, 4));
        }
    }

}