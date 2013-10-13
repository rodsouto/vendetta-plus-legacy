<?php

class Mob_Controller_Plugin_Adsense extends Zend_Controller_Plugin_Abstract {


    public function dispatchLoopStartup() {
        if ($this->getRequest()->getModuleName() != "mob" || 
          ($this->getRequest()->getControllerName() == "visionglobal" && $this->getRequest()->getActionName() != "misiones") ||
          isset($_GET["no_ads"])) return;
        $adsense = '  <script type="text/javascript"><!--
  google_ad_client = "ca-pub-2997712968079155";
  /* Page Top */
  google_ad_slot = "7250320159";
  google_ad_width = 468;
  google_ad_height = 60;
  //-->
  </script>
  <div id="adsenseBanner" style="text-align:center;">
  <script type="text/javascript"
  src="http://pagead2.googlesyndication.com/pagead/show_ads.js">
  </script>
  </div>'; 
        $this->getResponse()->appendBody($adsense);
        
    }

}