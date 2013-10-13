<?php

class Mob_Controller_Plugin_Profiler extends Zend_Controller_Plugin_Abstract {


    public function dispatchLoopShutdown() {
    
        $namespace = new Zend_Session_Namespace("profiler");
        if (!isset($_GET["profiler"]) && !$namespace->profiler) return;

        $db = Zend_Db_Table_Abstract::getDefaultAdapter();
        $profiler = $db->getProfiler();
        $profiler->setFilterElapsedSecs(1);

        $profiler->setFilterQueryType(Zend_Db_Profiler::SELECT |
                                      Zend_Db_Profiler::INSERT |
                                      Zend_Db_Profiler::UPDATE |
                                      Zend_Db_Profiler::DELETE);
                                      
        $totalTime    = $profiler->getTotalElapsedSecs();
        $queryCount   = $profiler->getTotalNumQueries();
        $longestTime  = 0;
        $longestQuery = null;
        
        $allQuerys = array();
        
        foreach ($profiler->getQueryProfiles(Zend_Db_Profiler::SELECT |
                                      Zend_Db_Profiler::INSERT |
                                      Zend_Db_Profiler::UPDATE |
                                      Zend_Db_Profiler::DELETE | Zend_Db_Profiler::TRANSACTION) as $query) {
          if ($query->getElapsedSecs() > $longestTime) {
              $longestTime  = $query->getElapsedSecs();
              $longestQuery = $query;
          }
          
          $allQuerys[] = $query->getQuery(); 
        }
        $txt = 'Executed ' . $queryCount . ' queries in ' . $totalTime .
           ' seconds<br />';
        $txt .= 'Average query length: ' . $totalTime / $queryCount .
           ' seconds<br />';
        $txt .= 'Queries per second: ' . $queryCount / $totalTime . "<br />";
        $txt .= 'Longest query length: ' . $longestTime . "<br />";
        $txt .= "Longest query: " . $longestQuery->getQuery() . "<br />";
        
        if ($longestQuery->getQueryType() == Zend_Db_Profiler::SELECT) {
          $stmt = $db->query('explain '.$longestQuery->getQuery());
          $txt .= "Longest query explain: ".nl2br(var_export($stmt->fetchAll(), 1))."<br>";
        } else {
          $txt .= "Longest query explain: ".nl2br($longestQuery->getQuery())."<br>";
        }
        
        $txt .= "All querys: ".implode("<br /><br />", $allQuerys);
        
        
        $txt = "<div style='background-color: white;border: 2px solid red;clear:both;'>$txt</div>";
        
        $this->getResponse()->appendBody($txt);
        
    }

}