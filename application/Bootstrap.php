<?php

class Bootstrap extends Zend_Application_Bootstrap_Bootstrap
{

    protected function _initDoctype()
    {
        $this->bootstrap('view');
        $view = $this->getResource('view');
        $view->doctype('XHTML1_STRICT');
        $view->headMeta()->appendHttpEquiv('Content-Type', 'text/html; charset=utf-8');
        $view->headLink(array('rel' => 'favicon', 'href' => Mob_Server::getStaticUrl().'favicon.ico'),'PREPEND')
                        ->appendStylesheet(Mob_Server::getStaticUrl()."css/styles.css");
        $view->headScript()->appendFile(Mob_Server::getStaticUrl()."js/jquery-1.4.3.min.js");
        $view->setEscape(array($this, "escape"));
    }
    
    public static function escape($val, $html = true) {
        $val = stripslashes($val);
        if (!$html) return $val;
        return htmlspecialchars($val, ENT_QUOTES); 
    }
    
    protected function _initAutoloader() {
        $autoloader = Zend_Loader_Autoloader::getInstance();
        $autoloader->registerNamespace('Mob_');
        $autoloader->setFallbackAutoloader(true);

        $ResourceAutoloader = new Zend_Loader_Autoloader_Resource(
          array(
            'basePath' => APPLICATION_PATH,
            'namespace' => 'Mob',
            'resourceTypes' => array(
              'form' => array('path' => 'forms/', 'namespace' => 'Form'),
              'model' => array('path' => 'models/', 'namespace' => 'Model')
            )
          )
        );
    }
    
    /*protected function _initGameConfig() {
        Zend_Registry::set("gameConfig", include_once("../application/configs/gameconfig.php"));
    }*/
    
    protected function _initDbAdapter() {
        $this->bootstrap('db');
        Zend_Registry::set("dbAdapter", Zend_Db_Table_Abstract::getDefaultAdapter());
    }
    
    protected function _initProfiler() {
    
        $namespace = new Zend_Session_Namespace("profiler");
    
        if (!isset($namespace->profiler)) {
            $namespace->profiler = false;
        } else {
            if (isset($_GET["start_profiler"])) {
                $namespace->profiler = true;    
            } elseif (isset($_GET["stop_profiler"])) {
                $namespace->profiler = false;
            }
        }

        // activamos el profiler para todos y determinamos desde el plugin cuando mostrarlo    
        if (isset($_GET["profiler"]) || $namespace->profiler) {
        
            Zend_Db_Table_Abstract::getDefaultAdapter()->getProfiler()->setEnabled(true);
            //Zend_Controller_Front::getInstance()->registerPlugin(new P4t_Controller_Plugin_Profiler(), 1000);
        }
    
    }
    
    protected function _initMetadataCache() {
        $frontendOptions = array('automatic_serialization' => true);
        $backendOptions  = array('hashed_directory_level' => 2,'cache_dir' => PUBLIC_PATH.'/cacheFiles/metadata');

        $cache = Zend_Cache::factory('Core', 'File', $frontendOptions, $backendOptions);

        Zend_Db_Table_Abstract::setDefaultMetadataCache($cache);
        Zend_Feed_Reader::setCache($cache);
        /*$classFileIncCache = APPLICATION_PATH.'/pluginLoaderCache.php';
        if (file_exists($classFileIncCache)) {
            include_once $classFileIncCache;
        }
        Zend_Loader_PluginLoader::setIncludeFileCache($classFileIncCache);*/
    }
    
    protected function _initSessionHijacking() {
      if (isset($_SESSION['HTTP_USER_AGENT'])) {
          if ($_SESSION['HTTP_USER_AGENT'] != md5($_SERVER['HTTP_USER_AGENT'])) {
              Zend_Session::destroy();
              Header("Location: /");
              exit;
          }
      } else {
          $_SESSION['HTTP_USER_AGENT'] = md5($_SERVER['HTTP_USER_AGENT']);
      }    
    }
    
    protected function _initTranslator() {
      $this->bootstrap('frontController');
      
      $config = $this->getOptions();
      $idiomas = array_filter($config["games"][Mob_Server::getGameType()]["idiomas"]);

      $namespace = new Zend_Session_Namespace("actualLanguage");

      $defaultLanguage = $config["games"][Mob_Server::getGameType()]["default_language"];
      
      if (!isset($namespace->language)) {
        $namespace->language = $defaultLanguage;
        
      	if (isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
      		$langs = explode(',',$_SERVER['HTTP_ACCEPT_LANGUAGE']);
      		foreach ($langs as $value){
      			$choice = substr($value,0,2);
      			if(isset($idiomas[$choice])){
      			   $namespace->language = $choice;
               break;       
      			}
      		}
      	}        
        
        if (Zend_Auth::getInstance()->hasIdentity()) {
          $idiomaUsuario = Mob_Loader::getModel("Usuarios")->getIdioma(Zend_Auth::getInstance()->getIdentity()->id_usuario);
          if (!empty($idiomaUsuario)) $namespace->language = $idiomaUsuario;
        }
      }
      
      if (isset($_GET["lang"]) || isset($_POST["lang"])) $namespace->language = isset($_GET["lang"]) ? $_GET["lang"] : $_POST["lang"];
      
      $this->getResource('view')->language = $namespace->language;
      Zend_Registry::set("language", $namespace->language);
      
      $file = APPLICATION_PATH.'/languages/'.getenv("GAME_TYPE").'/'.$namespace->language.'.php';
      $file = file_exists($file) ? $file : APPLICATION_PATH.'/languages/'.getenv("GAME_TYPE").'/'.$defaultLanguage.'.php';
      
      $translate = new Zend_Translate(
          array(
              'adapter' => 'array',
              'content' => $file,
              'locale'  => $namespace->language
          )
      );
      
      Zend_Registry::set('Zend_Translate', $translate);    
    }
    
    /*
    para ejecutar un cron:
    ?cron=main
    php index.php cron main
    */
    protected function _initCrons() {
      if (!Mob_Server::isCron()) return;
      $front = $this->bootstrap('frontController')->getResource('frontController');
      
      $module = "crons";
      $controller = "index";
      $action = isset($_SERVER['argv'][2]) ? $_SERVER['argv'][2] : $_GET["cron"];
             
      $request = new Zend_Controller_Request_Simple($action, $controller, $module, array());
      $response = new Zend_Controller_Response_Cli();
      $response->setHeader('content-type', 'text/plain');
      
      $front->setRequest($request)
            ->setResponse($response)
            ->setRouter(new Mob_Controller_Router_Cli());
    }
    
    /*protected function _initAuthNamespace() {
      if (Mob_Server::isGameServer()) {
        Zend_Auth::getInstance()->setStorage(new Zend_Auth_Storage_Session(Mob_Server::getSubDomain()));
      }
    }*/

}
