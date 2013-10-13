<?php

class Mob_Model_Textos extends Zend_Db_Table_Abstract {

    protected $_name = "mob_textos";
    protected $_primary = "id_texto";
    
    public function _setupDatabaseAdapter() {
      $config = self::getDefaultAdapter()->getConfig();
      $config["dbname"] = getenv("GAME_TYPE")."_plus";
      $this->_db = Zend_Db::factory("pdo_mysql", $config);
    }    

    public function export() {
      $idiomas = $this->_db->fetchAll("SELECT DISTINCT(idioma) FROM mob_textos");
      
      foreach ($idiomas as $idioma) {
        $query = $this->_db->select()->from($this->_name, array("ref", "texto"))->where("idioma = ?", $idioma["idioma"]);
        $data = $this->_db->fetchPairs($query);
        
        $file = APPLICATION_PATH . "/languages/".getenv("GAME_TYPE")."/".$idioma["idioma"].".php";
        if (!file_exists(APPLICATION_PATH . "/languages/".getenv("GAME_TYPE")."/backups")) {
            mkdir(APPLICATION_PATH . "/languages/".getenv("GAME_TYPE")."/backups");
        }
        
        if (!file_exists(APPLICATION_PATH . "/languages/".getenv("GAME_TYPE")."/backups/".date("Ymd"))) {
            mkdir(APPLICATION_PATH . "/languages/".getenv("GAME_TYPE")."/backups/".date("Ymd"));
        }
        
        $idUsuario = Zend_Auth::getInstance()->getIdentity()->id_usuario;
        
        if (file_exists($file)) {
            copy($file, 
            APPLICATION_PATH."/languages/".getenv("GAME_TYPE")."/backups/".date("Ymd")."/".$idUsuario."_".$idioma["idioma"].date("His").".php");
        }
        
        file_put_contents($file, "<"."?"."php return ".var_export($data, true).";");    
      }
    }
    
    public function exportHtmlTable() {
      $idiomas = $this->_db->fetchAll("SELECT DISTINCT(idioma) FROM mob_textos");
      
      foreach ($idiomas as $idioma) {
        $html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">

<head>

    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" /></head><body><table>';
        $query = $this->_db->select()->from($this->_name, array("id_texto", "texto"))->where("idioma = ?", $idioma["idioma"]);
        foreach ($this->_db->fetchAll($query) as $data) {
          $html .= "<tr><td>".$data["id_texto"]."</td><td>".$data["texto"]."</td></tr>";
        }
        $html .= "</table></body></html>";
        file_put_contents(APPLICATION_PATH . "/languages/".$idioma["idioma"].".html", $html);    
      }
    }    
    
    public function getByRef($ref) {
    
      if (empty($ref)) return array();
      $query = $this->select()->where("ref = ?", $ref);
      $return = array("ref" => $ref);
      foreach($this->_db->fetchAll($query) as $d) {
        $return["textos"]["lang_".$d["idioma"]] = $d["texto"];
      }
      
      return $return;
    }
}