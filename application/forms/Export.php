<?php

function noPuntos($str) {
  return str_replace(".", "", $str);
}

class Mob_Form_Export extends Zend_Form {

    public function init() {
    
        $this->addDecorator('FormElements')
         ->addDecorator('HtmlTag', array('tag' => 'dl', 'class' => 'zend_form'))
         ->addDecorator('Form');
         //->addDecorator("Errors", array("placement" => "prepend", "escape" => false));
    
        //$this->addElement("text", "servidor", array("label" => "Servidor de Vendeta.es (1-12)", "filters" => array("Int"), "required" => true));
        
        $servers = array(
          "vendetta.es:1" => "Vendetta.es s1",
          "vendetta.es:2" => "Vendetta.es s2",
          "vendetta.es:3" => "Vendetta.es s3",
          "vendetta.es:4" => "Vendetta.es s4",
          "vendetta.es:5" => "Vendetta.es s5",
          "vendetta.es:6" => "Vendetta.es s6",
          "vendetta.es:7" => "Vendetta.es s7",
          "vendetta.es:8" => "Vendetta.es s8",
          "vendetta.es:9" => "Vendetta.es s9",
          "vendetta.es:10" => "Vendetta.es s10",
          "vendetta.es:11" => "Vendetta.es s11",
          "vendetta.es:12" => "Vendetta.es s12", 
          "vendetta.fr:1" => "Vendetta.fr s1",
          "vendetta.fr:2" => "Vendetta.fr s2",
          "vendetta.fr:3" => "Vendetta.fr s3",
          "vendetta.fr:4" => "Vendetta.fr s4",
          "vendetta.fr:5" => "Vendetta.fr s5",
          "vendetta.fr:6" => "Vendetta.fr s6",
          "vendetta.fr:7" => "Vendetta.fr s7",
          "vendetta.fr:8" => "Vendetta.fr s8",
          "vendetta.fr:9" => "Vendetta.fr s9",
          "vendetta.com.pt:1" => "Vendetta.com.pt s1",
          "vendetta.com.pt:2" => "Vendetta.com.pt s2",
          "vendetta.com.pt:3" => "Vendetta.com.pt s3",
          "vendetta1923.it:1" => "Vendetta1923.it s1",
          "vendetta1923.it:2" => "Vendetta1923.it s2",
          "vendetta1923.it:3" => "Vendetta1923.it s3",
          "vendetta1923.it:4" => "Vendetta1923.it s4",
          "vendetta1923.it:5" => "Vendetta1923.it s5",
          "vendetta1923.it:6" => "Vendetta1923.it s6",
          "vendetta1923.com:1" => "Vendetta1923.com s1",
          "vendetta1923.com:2" => "Vendetta1923.com s2",
          "vendetta1923.com:3" => "Vendetta1923.com s3",
          "vendetta.de:1" => "Vendetta.de s1",
          "vendetta.de:2" => "Vendetta.de s2",
          "vendetta.de:3" => "Vendetta.de s3",
          "vendetta.de:4" => "Vendetta.de s4",
          "vendetta.de:5" => "Vendetta.de s5",
          "vendetta.de:6" => "Vendetta.de s6",
          "vendetta.de:7" => "Vendetta.de s7",
          "vendetta.de:8" => "Vendetta.de s8", 
          "vendetta.pl:1" => "Vendetta.pl s1",
          "vendetta.pl:2" => "Vendetta.pl s2",
          "vendetta.pl:3" => "Vendetta.pl s3",
          "vendetta.pl:4" => "Vendetta.pl s4",
          "vendetta.pl:5" => "Vendetta.pl s5",
          "vendetta.pl:6" => "Vendetta.pl s6",
          "vendetta.pl:7" => "Vendetta.pl s7",
          "vendetta.pl:8" => "Vendetta.pl s8",
          "vendetta.pl:9" => "Vendetta.pl s9",
          "vendetta.pl:10" => "Vendetta.pl s10",
          "vendetta1923.nl:1" => "Vendetta1923.nl s1",
          "vendetta1923.nl:2" => "Vendetta1923.nl s2",
          "vendetta1920.net:1" => "Vendetta1920.net s1",
          "vendetta1920.net:2" => "Vendetta1920.net s2",
          "vendetta1920.net:3" => "Vendetta1920.net s3"
          );
        $this->addElement("select", "servidor", array("label" => "Vendetta", "multiOptions" => $servers, "required" => true));
        
        $this->addElement("text", "user", array("label" => "Login en Vendetta", "required" => true));
        $this->addElement("text", "pass", array("label" => "Password en Vendetta", "required" => true));
        
        $this->addElement("text", "nombre", array("label" => "Nombre de usuario (escribelo exactamente igual como aparece en el ranking)", "filters" => array("StringTrim"), "required" => true));
    
        $this->addElement("textarea", "vision_global", 
                    array("label" => "Copia aca la vision global. Si tienes algun plugin/script que modifique la vision global, deshabilitalo.", "required" => true));
                    //<br /> <img src='/img/export/visionglobal.jpg' />
        //$this->vision_global->getDecorator("Label")->setOption("escape", false);            

        $filterNoPuntos = new Zend_Filter_Callback("noPuntos");

        $entrenamientos = array("Rutas", "Encargos", "Extorsion", "Administracion", "Contrabando", 
                                "Espionaje", "Seguridad", "Proteccion", "Combate", "Armas", "Tiro", 
                                "Explosivos", "Guerrilla", "Psicologico", "Quimico", "Honor");
                                
        $subFormEntrenamiento = new Zend_Form_SubForm;
        $subFormEntrenamiento->setLegend("Completa los entrenamientos.");
        foreach ($entrenamientos as $entrenamiento) {
            $class = sprintf("Mob_Entrenamiento_%s", $entrenamiento);
            $object = new $class();
            $subFormEntrenamiento->addElement("text", $entrenamiento, array("label" => $object->getNombre(), "filters" => array($filterNoPuntos, "Int")));
        }
        $this->addSubForm($subFormEntrenamiento, "entrenamientos");
        
        
        $subFormTropas = new Zend_Form_SubForm;
        $subFormTropas->setDescription("Completa la cantidad total de cada tropa que tienes entre todos los edificios, incluyendo las que esten en mision. Puedes usar esta <a href='/mob/index/sumartropas' target='_blank'>herramienta para sumar las tropas</a> mas facilmente.");
        $tropas = array("Maton", "Portero", "Acuchillador", "Pistolero", "Ocupacion", "Espia", 
        "Porteador", "Cia", "Fbi", "Transportista", "Tactico", "Francotirador", "Asesino", 
        "Ninja", "Demoliciones", "Mercenario");
        $subFormTropas->addDecorator("Description", array("placement" => "prepend", "escape" => false));
        
        foreach ($tropas as $tropa) {
            $class = sprintf("Mob_Tropa_Ataque_%s", $tropa);
            $object = new $class();
            $subFormTropas->addElement("text", $tropa, array("label" => $object->getNombre(), "filters" => array($filterNoPuntos, "Int")));
        }

        $tropas = array("Ilegal", "Centinela", "Policia", "Guardaespaldas", "Guardia");
        foreach ($tropas as $tropa) {
            $class = sprintf("Mob_Tropa_Defensa_%s", $tropa);
            $object = new $class();
            $subFormTropas->addElement("text", $tropa, array("label" => $object->getNombre(), "filters" => array($filterNoPuntos, "Int")));
        }
        
        $this->addSubForm($subFormTropas, "tropas");
        
        $this->addElement("submit", "pasoExportar", array("label" => "Enviar"));
        
        return $this;
    }
    
}