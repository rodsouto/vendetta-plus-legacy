<?php

class Mob_Form_Mensajes_Listado extends Zend_Form {

    protected $_idUsuario;

    public function build($idUsuario, $idCarpeta, $page = 1, $count = 20) {
        $this->setAction("/mob/mensajes/listado?c=".Zend_Controller_Front::getInstance()->getRequest()->getParam("c", 0))->setName("frmMensajes");
        $this->_idUsuario = (int)$idUsuario;
        $mensajes = Mob_Loader::getModel("Mensajes")->getMensajes($idUsuario, $idCarpeta, $page, $count);
        
        $descriptionGeneral = "<a href='?all' id='msgSelectAll'>Seleccionar todo</a> - <a href='?invert' id='msgInvert'>Invertir seleccion</a>";
        
        $this->addDecorator("Description", array("id" => "msgChecksAction", "placement" => "prepend", "escape" => false))->setDescription($descriptionGeneral);
                 
        $subFormMensajes = new Zend_Form_SubForm;
        
        $subFormMensajes->setDecorators(array(
        "FormElements",
        array("HtmlTag", array("class" => "wrapperMsg"))
        ));
        
        foreach ($mensajes as $m) {
            $description = "";
            
            if ($m["remitente"] > 0) {
                $m["asunto"] = $this->getView()->escape($m["asunto"]);
                $m["mensaje"] = $this->getView()->escape($m["mensaje"]);
                $label = $m["fecha_enviado"]." <a href='/mob/jugador?id=".$m["remitente"]."'>".$this->getView()->escape(Mob_Loader::getModel("Usuarios")->getUsuario($m["remitente"]))."</a>";
                if (!empty($m["asunto"])) $description .= $this->getView()->t("Asunto").": ".$m["asunto"]."<br /> ";
                $description .= nl2br($m["mensaje"])."<br />";
                $description .= "<a href='/mob/mensajes/nuevo?id_dest=".$m["remitente"]."'>".$this->getView()->t("Contestar")."</a>";
            } else {
                if (!empty($m["asunto"])) $description .= "Asunto: ".$m["asunto"]."<br/><br />";
                $description .= nl2br($m["mensaje"]);
                $label = $m["fecha_enviado"];
            }
            $subFormMensajes->addElement("checkbox", "msg".$m["id_mensaje"], array("Label" => $label, "description" => $description));
        }
        $subFormMensajes->setElementDecorators(array(
        array("Label", array("placement" => "append", "escape" => false)),
        array("Description", array("class" => "msgTxt", "tag" => "div", "escape" => false)),
        array("HtmlTag", array("class" => "msgTxtW")),
        array("ViewHelper", array("placement" => "prepend")),
        array(array("row" => "HtmlTag"), array("class" => "msgRow"))
        ));
        $this->addSubForm($subFormMensajes, "mensajes");
        $acciones = array(0 => "", 1 => "Borrar mensajes marcados", 2 => "Borrar todos los mensajes");
        
        foreach (Mob_Loader::getModel("Mensajes_Carpetas")->getCarpetas($idUsuario) as $c) {
          $acciones["folder_".$c["id_carpeta"]] = "Mover a la carpeta ".$c["nombre"];    
        }        
        
        $this->addElement("select", "acciones", array("multiOptions" => $acciones, "label" => "Accion"));
        
        $this->addElement("submit", "enviar", array("label" => "Enviar", "ignore" => true));
        $this->addElement("hidden", "page", array("value" => $page));
        
    }
    
    public function save() {
        $values = $this->getValues();
        
        $folder = Zend_Controller_Front::getInstance()->getRequest()->getParam("c", 0);
        
        if (empty($values["acciones"])) return;
         
        if (substr($values["acciones"], 0, 7) == "folder_") {
          $idCarpetaMover = substr($values["acciones"], 7);
          // mover a otra carpeta
          foreach($values["mensajes"] as $k => $val) {
              if ($val == 0) continue;
              Mob_Loader::getModel("Mensajes")->update(array("id_carpeta" => $idCarpetaMover), "id_mensaje = ".(int)substr($k, 3)." AND destinatario = ".$this->_idUsuario);
          }
         
          return;          
        }        
        
        if ($values["acciones"] == 2) {
            // borrar todo
            // aca necesito saber en que carpeta estoy
            if ($folder == "alerts") {
              $where = "id_carpeta = 0 AND remitente = 0 AND destinatario = ".$this->_idUsuario;
            } else {
              $where = "id_carpeta = ".$folder." AND destinatario = ".$this->_idUsuario;
            }            
            Mob_Loader::getModel("Mensajes")->update(array("borrado_dest" => 1), $where);
            return;
        }
        
        // borrar marcados
        foreach($values["mensajes"] as $k => $val) {
            if ($val == 0) continue;
            // aca no necesito saber la carpeta, borro segun id_mensaje y id_usuario
            Mob_Loader::getModel("Mensajes")->update(array("borrado_dest" => 1), "id_mensaje = ".(int)substr($k, 3)." AND destinatario = ".$this->_idUsuario);
        }

    }

}