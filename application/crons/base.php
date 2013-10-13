<?php

  echo "base ".date("Y-m-d H:i:s")."\n";

    

  if(getcwd() == "/home/vendetta/application/crons") { 

    echo "PRODUCTION\n";

    $_APPLICATION_ENV = "production";

  } else {

    echo "TESTING\n";

    $_APPLICATION_ENV = "testing";

  }

  if (!function_exists("lcfirst")) {

    function lcfirst($string) {

        $string[0] = strtolower($string[0]);

        return $string;

    }

  }

  

//$application->bootstrap("db");



defined('APPLICATION_ENV')

    || define('APPLICATION_ENV', $_APPLICATION_ENV);

    

if ($_APPLICATION_ENV == "testing") {

  $_APPLICATION_PATH = "/home3/mobgame/dev/application/";

} else {

  $_APPLICATION_PATH = "/home/vendetta/application/";

}

    

// Define path to application directory

defined('APPLICATION_PATH')

    || define('APPLICATION_PATH', $_APPLICATION_PATH);     



$rootPath = dirname(__FILE__)."/../..";



  set_include_path($rootPath . '/application/models' . PATH_SEPARATOR . $rootPath . '/library');



  include_once "Zend/Loader/Autoloader.php"; 

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

  

/** Zend_Application */

require_once 'Zend/Application.php';



// Create application, bootstrap, and run

$application = new Zend_Application(

    APPLICATION_ENV,

    APPLICATION_PATH . '/configs/application.ini'

);





$options = $application->getOptions();

echo "DBNAME: ".$options["resources"]["db"]["params"]["dbname"]."\n";

  $translate = new Zend_Translate(
          array(
              'adapter' => 'array',
              'content' => APPLICATION_PATH.'/languages/es.php',
              'locale'  => "es"
          )
      );
        Zend_Registry::set('Zend_Translate', $translate);  

$application->bootstrap("db");