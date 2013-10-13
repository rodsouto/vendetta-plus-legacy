<?php

class Mob_View_Helper_GetAnalytics extends Zend_view_Helper_Abstract {

  public function getAnalytics() {
    $code = '<script type="text/javascript">var _gaq = _gaq || [];';
  
    if (Mob_Server::getGameType() == "vendetta") {
      $code .= "_gaq.push(['_setAccount', 'UA-19159365-1']);_gaq.push(['_setDomainName', '.vendetta-plus.com']);";
    } else {
      $code .= "_gaq.push(['_setAccount', 'UA-20576310-1']);_gaq.push(['_setDomainName', '.space4k-plus.com']);";
    }
  
    $code .= "_gaq.push(['_trackPageview']);";
  
    $code .= "(function() {
      var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
      ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
      var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
    })();</script>";    
  
    return $code;
  }

}