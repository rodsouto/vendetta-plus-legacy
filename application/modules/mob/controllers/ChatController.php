<?php

class Mob_ChatController extends Mob_Controller_Action {

  protected $_model;
  protected $_username;
  
  /*
  
  openChatBoxes = array(idUsuario => timestampUltimoMensaje, ...);
  chatHistory = array(idUsuario => array(infoMensaje), ...);
  */
  
  public function indexAction() {
    $this->_helper->viewRenderer->setNoRender(true);
    $this->_helper->layout->disableLayout(true);
  
    $this->_model = Mob_Loader::getModel("Chat");
    $this->_username = Mob_Loader::getModel("Usuarios")->getUsuario($this->idUsuario);
    
    if ($_GET['action'] == "chatheartbeat") { $this->_chatHeartbeat(); } 
    if ($_GET['action'] == "sendchat") { $this->_sendChat(); } 
    if ($_GET['action'] == "closechat") { $this->_closeChat(); } 
    if ($_GET['action'] == "startchatsession") { $this->_startChatSession(); } 
    
    if (!isset($_SESSION['chatHistory'])) {
    	$_SESSION['chatHistory'] = array();	
    }
    
    if (!isset($_SESSION['openChatBoxes'])) {
    	$_SESSION['openChatBoxes'] = array();	
    }
    die();
  }

  protected function _chatHeartbeat() {
    // recd = 0 son los que no fueron leidos
  	$query = $this->_model->select()->where("id_to = ?", $this->idUsuario)->where("recd = 0")->order("id ASC");
  	
  	$items = array();
  
  	$chatBoxes = array();
  
    foreach ($this->_model->fetchAll($query) as $chat) {
  
  		if (!isset($_SESSION['openChatBoxes'][$chat['id_from']]) && isset($_SESSION['chatHistory'][$chat['id_from']])) {
  			$items = $_SESSION['chatHistory'][$chat['id_from']];
  		}
  
  		$chat['message'] = $this->_sanitize($chat['message']);
      $newItem = array("s" => 0, "i" => $chat['id_from'], "f" => Mob_Loader::getModel("Usuarios")->getUsuario($chat['id_from']), "m" => $chat['message']);
      $items[] = $newItem;
  
    	if (!isset($_SESSION['chatHistory'][$chat['id_from']])) {
    		$_SESSION['chatHistory'][$chat['id_from']] = array();
    	}
  
      $_SESSION['chatHistory'][$chat['id_from']][] = $newItem;
  		
  		unset($_SESSION['tsChatBoxes'][$chat['id_from']]);
  		$_SESSION['openChatBoxes'][$chat['id_from']] = $chat['sent'];
  	}
  
  	if (!empty($_SESSION['openChatBoxes'])) {
    	foreach ($_SESSION['openChatBoxes'] as $chatbox => $time) {
    		if (!isset($_SESSION['tsChatBoxes'][$chatbox])) {
    			$now = time()-strtotime($time);
    			$time = date('g:iA M dS', strtotime($time));
    
    			$message = "Sent at $time";
    			if ($now > 180) {
    			  $newItem = array("s" => 2, "f" => Mob_Loader::getModel("Usuarios")->getUsuario($chatbox), "i" => $chatbox, "m" => $message);
            $items[] = $newItem;
    
          	if (!isset($_SESSION['chatHistory'][$chatbox])) {
          		$_SESSION['chatHistory'][$chatbox] = array();
          	}

            $_SESSION['chatHistory'][$chatbox][] = $newItem;
      			$_SESSION['tsChatBoxes'][$chatbox] = 1;
    		  }
    	 }
      }
    }
  
                                                                            
  	$this->_model->update(array("recd" => 1), "id_to = '".$this->idUsuario."' AND recd = 0");    
  
    echo Zend_Json::encode(array("items" => $items)); 
  }

  protected function _chatBoxSession($chatbox) {
  	
  	$items = array();
  	
  	if (isset($_SESSION['chatHistory'][$chatbox])) {
  		$items = $_SESSION['chatHistory'][$chatbox];
  	}
  
  	return $items;
  }
  
  protected function _startChatSession() {//Zend_Debug::dump($_SESSION);
  	$items = array();
  	if (!empty($_SESSION['openChatBoxes'])) {
  		foreach ($_SESSION['openChatBoxes'] as $chatbox => $void) {
  			$items = array_merge($items, $this->_chatBoxSession($chatbox));
  		}
  	}
  
    echo Zend_Json::encode(array("username" => $this->_username, "items" => $items));  
  }

  protected function _sendChat() {
  	$from = $this->_username;
  	$to = $_POST['to'];
  	$message = $_POST['message'];
  
  	$_SESSION['openChatBoxes'][$_POST['id_to']] = date('Y-m-d H:i:s', time());
  	
  	$messagesan = $this->_sanitize($message);
  
  	if (!isset($_SESSION['chatHistory'][$_POST['id_to']])) {
  		$_SESSION['chatHistory'][$_POST['id_to']] = array();
  	}
  
  	$_SESSION['chatHistory'][$_POST['id_to']][] = array("s" => 1, "f" => $to, "i" => $_POST['id_to'], "m" => $messagesan);
  
  
  	unset($_SESSION['tsChatBoxes'][$_POST['id_to']]);
  
    $insert = array("from" => $from, "id_from" => $this->idUsuario, "to" => $to, "id_to" => $_POST["id_to"], "message" => $message, "sent" => date("Y-m-d H:i:s"));

    $this->_model->insert($insert);
  	echo "1";
  }

  protected function _closeChat() {
  
  	unset($_SESSION['openChatBoxes'][$_POST['chatbox']]);
  	
  	echo "1";
  }

  protected function _sanitize($text) {
  	$text = htmlspecialchars($text, ENT_QUOTES);
  	$text = str_replace("\n\r","\n",$text);
  	$text = str_replace("\r\n","\n",$text);
  	$text = str_replace("\n","<br>",$text);
  	return $text;
  }

}