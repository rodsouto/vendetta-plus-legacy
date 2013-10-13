/*

Copyright (c) 2009 Anant Garg (anantgarg.com | inscripts.com)

This script may be used for non-commercial purposes only. For any
commercial purposes, please contact the author at 
anant.garg@inscripts.com

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

*/

var windowFocus = true;
var username;
var chatHeartbeatCount = 0;
var minChatHeartbeat = 1000;
var maxChatHeartbeat = 33000;
var chatHeartbeatTime = minChatHeartbeat;
var originalTitle;
var blinkOrder = 0;

var chatboxFocus = new Array();
var newMessages = new Array();
var newMessagesWin = new Array();
var chatBoxes = new Array();
var rightBase;
$(document).ready(function(){

  if ($("#openChat").lenfth == 0) return;

	originalTitle = document.title;
	startChatSession();

	$([window, document]).blur(function(){
		windowFocus = false;
	}).focus(function(){
		windowFocus = true;
		document.title = originalTitle;
	});
});

function restructureChatBoxes() {
	align = 0;
	for (x in chatBoxes) {
		idchatuser = chatBoxes[x];

		if ($("#chatbox_"+idchatuser).css('display') != 'none') {
			if (align == 0) {
				$("#chatbox_"+idchatuser).css('right', rightBase+'px');
			} else {
				width = (align)*(225+7)+rightBase;
				$("#chatbox_"+idchatuser).css('right', width+'px');
			}
			align++;
		}
	}
}

function chatWith(chatuser, idchatuser) {
	createChatBox(chatuser, idchatuser);
	$("#chatbox_"+chatuser+" .chatboxtextarea").focus();
}

function createChatBox(chatboxtitle,idchatuser,minimizeChatBox) {
	if ($("#chatbox_"+idchatuser).length > 0) {
		if ($("#chatbox_"+idchatuser).css('display') == 'none') {
			$("#chatbox_"+idchatuser).css('display','block');
			restructureChatBoxes();
		}
		$("#chatbox_"+idchatuser+" .chatboxtextarea").focus();
		return;
	}
  
	$(" <div />" ).attr("id","chatbox_"+idchatuser)
	.addClass("chatbox")
	.html('<div class="chatboxhead"><div class="chatboxtitle"><a href="javascript:void(0)" onclick="javascript:toggleChatBoxGrowth(\''+idchatuser+'\')">'+chatboxtitle+'</a></div><div class="chatboxoptions"><a href="javascript:void(0)" onclick="javascript:closeChatBox(\''+chatboxtitle+'\', \''+idchatuser+'\')">X</a></div><br clear="all"/></div><div class="chatboxcontent"></div><div class="chatboxinput"><textarea class="chatboxtextarea" onkeydown="javascript:return checkChatBoxInputKey(event,this,\''+chatboxtitle+'\', \''+idchatuser+'\');"></textarea></div>')
	.appendTo($( "body" ));
			   
	$("#chatbox_"+idchatuser).css('bottom', '0px');
	
	chatBoxeslength = 0;

	for (x in chatBoxes) {
		if ($("#chatbox_"+chatBoxes[x]).css('display') != 'none') {
			chatBoxeslength++;
		}
	}

  rightBase = $(window).width()-$("#chatBar").position().left+10;

	if (chatBoxeslength == 0) {
		$("#chatbox_"+idchatuser).css('right', rightBase+'px');
	} else {
		width = (chatBoxeslength)*(225+7)+rightBase;
		$("#chatbox_"+idchatuser).css('right', width+'px');
	}
	
	chatBoxes.push(idchatuser);

	if (minimizeChatBox == 1) {
		minimizedChatBoxes = new Array();

		if ($.cookie('chatbox_minimized')) {
			minimizedChatBoxes = $.cookie('chatbox_minimized').split(/\|/);
		}
		minimize = 0;
		for (j=0;j<minimizedChatBoxes.length;j++) {
			if (minimizedChatBoxes[j] == idchatuser) {
				minimize = 1;
			}
		}

		if (minimize == 1) {
			$('#chatbox_'+idchatuser+' .chatboxcontent').css('display','none');
			$('#chatbox_'+idchatuser+' .chatboxinput').css('display','none');
		}
	}

	chatboxFocus[idchatuser] = false;

	$("#chatbox_"+idchatuser+" .chatboxtextarea").blur(function(){
		chatboxFocus[idchatuser] = false;
		$("#chatbox_"+idchatuser+" .chatboxtextarea").removeClass('chatboxtextareaselected');
	}).focus(function(){
		chatboxFocus[idchatuser] = true;
		newMessages[idchatuser] = false;
		$('#chatbox_'+idchatuser+' .chatboxhead').removeClass('chatboxblink');
		$("#chatbox_"+idchatuser+" .chatboxtextarea").addClass('chatboxtextareaselected');
	});

	$("#chatbox_"+idchatuser).click(function() {
		if ($('#chatbox_'+idchatuser+' .chatboxcontent').css('display') != 'none') {
			$("#chatbox_"+idchatuser+" .chatboxtextarea").focus();
		}
	});

	$("#chatbox_"+idchatuser).show();
}


function chatHeartbeat(){

	var itemsfound = 0;
	
	if (windowFocus == false) {
 
		var blinkNumber = 0;
		var titleChanged = 0;
		for (x in newMessagesWin) {
			if (newMessagesWin[x] == true) {
				++blinkNumber;
				if (blinkNumber >= blinkOrder) {
					document.title = x+' says...';
					titleChanged = 1;
					break;	
				}
			}
		}
		
		if (titleChanged == 0) {
			document.title = originalTitle;
			blinkOrder = 0;
		} else {
			++blinkOrder;
		}

	} else {
		for (x in newMessagesWin) {
			newMessagesWin[x] = false;
		}
	}
  
	for (x in newMessages) {
		if (newMessages[x] == true) {
			if (chatboxFocus[x] == false) {
				//FIXME: add toggle all or none policy, otherwise it looks funny
				$('#chatbox_'+x+' .chatboxhead').toggleClass('chatboxblink');
			}
		}
	}
	
	$.ajax({
	  url: "/mob/chat?action=chatheartbeat",
	  cache: false,
	  dataType: "json",
	  success: function(data) {

		$.each(data.items, function(i,item){
			if (item)	{ // fix strange ie bug

				chatboxtitle = item.f;
        idchatuser = item.i;
				if ($("#chatbox_"+idchatuser).length <= 0) {
					createChatBox(chatboxtitle, item.i);
				}
				if ($("#chatbox_"+idchatuser).css('display') == 'none') {
					$("#chatbox_"+idchatuser).css('display','block');
					restructureChatBoxes();
				}
				
				if (item.s == 1) {
					item.f = username;
				}

				if (item.s == 2) {
					$("#chatbox_"+idchatuser+" .chatboxcontent").append('<div class="chatboxmessage"><span class="chatboxinfo">'+item.m+'</span></div>');
				} else {
					newMessages[idchatuser] = true;
					newMessagesWin[idchatuser] = true;
					$("#chatbox_"+idchatuser+" .chatboxcontent").append('<div class="chatboxmessage"><span class="chatboxmessagefrom">'+item.f+':&nbsp;&nbsp;</span><span class="chatboxmessagecontent">'+item.m+'</span></div>');
				}

				$("#chatbox_"+idchatuser+" .chatboxcontent").scrollTop($("#chatbox_"+idchatuser+" .chatboxcontent")[0].scrollHeight);
				itemsfound += 1;
			}
		});

		chatHeartbeatCount++;

		if (itemsfound > 0) {
			chatHeartbeatTime = minChatHeartbeat;
			chatHeartbeatCount = 1;
		} else if (chatHeartbeatCount >= 10) {
			chatHeartbeatTime *= 2;
			chatHeartbeatCount = 1;
			if (chatHeartbeatTime > maxChatHeartbeat) {
				chatHeartbeatTime = maxChatHeartbeat;
			}
		}
		
		setTimeout('chatHeartbeat();',chatHeartbeatTime);
	}});
}

function closeChatBox(chatboxtitle, idchatuser) {
	$('#chatbox_'+idchatuser).css('display','none');
	restructureChatBoxes();

	$.post("/mob/chat?action=closechat", { chatbox: idchatuser} , function(data){	
	});

}

function toggleChatBoxGrowth(idchatuser) {
	if ($('#chatbox_'+idchatuser+' .chatboxcontent').css('display') == 'none') {  
		
		var minimizedChatBoxes = new Array();
		
		if ($.cookie('chatbox_minimized')) {
			minimizedChatBoxes = $.cookie('chatbox_minimized').split(/\|/);
		}

		var newCookie = '';

		for (i=0;i<minimizedChatBoxes.length;i++) {
			if (minimizedChatBoxes[i] != idchatuser) {
				newCookie += idchatuser+'|';
			}
		}

		newCookie = newCookie.slice(0, -1)


		$.cookie('chatbox_minimized', newCookie);
		$('#chatbox_'+idchatuser+' .chatboxcontent').css('display','block');
		$('#chatbox_'+idchatuser+' .chatboxinput').css('display','block');
		$("#chatbox_"+idchatuser+" .chatboxcontent").scrollTop($("#chatbox_"+idchatuser+" .chatboxcontent")[0].scrollHeight);
	} else {
		
		var newCookie = idchatuser;

		if ($.cookie('chatbox_minimized')) {
			newCookie += '|'+$.cookie('chatbox_minimized');
		}


		$.cookie('chatbox_minimized',newCookie);
		$('#chatbox_'+idchatuser+' .chatboxcontent').css('display','none');
		$('#chatbox_'+idchatuser+' .chatboxinput').css('display','none');
	}
	
}

function checkChatBoxInputKey(event,chatboxtextarea,chatboxtitle,idchatuser) {

	if(event.keyCode == 13 && event.shiftKey == 0)  {
		message = $(chatboxtextarea).val();
		message = message.replace(/^\s+|\s+$/g,"");

		$(chatboxtextarea).val('');
		$(chatboxtextarea).focus();
		$(chatboxtextarea).css('height','44px');
		if (message != '') {
		
      message = message.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
			$("#chatbox_"+idchatuser+" .chatboxcontent").append('<div class="chatboxmessage"><span class="chatboxmessagefrom">'+username+':&nbsp;&nbsp;</span><span class="chatboxmessagecontent">'+message+'</span></div>');
			$("#chatbox_"+idchatuser+" .chatboxcontent").scrollTop($("#chatbox_"+idchatuser+" .chatboxcontent")[0].scrollHeight);		
		
			$.post("/mob/chat?action=sendchat", {to: chatboxtitle, message: message, id_to: idchatuser} , function(data){
        // pongo el append afuera para que no haya delay
			});
		}
		chatHeartbeatTime = minChatHeartbeat;
		chatHeartbeatCount = 1;
        $(chatboxtextarea).attr("disabled", "true");
        window.setTimeout(function() {$(chatboxtextarea).attr("disabled", "");}, 500);
		return false;
	}

	var adjustedHeight = chatboxtextarea.clientHeight;
	var maxHeight = 94;

	if (maxHeight > adjustedHeight) {
		adjustedHeight = Math.max(chatboxtextarea.scrollHeight, adjustedHeight);
		if (maxHeight)
			adjustedHeight = Math.min(maxHeight, adjustedHeight);
		if (adjustedHeight > chatboxtextarea.clientHeight)
			$(chatboxtextarea).css('height',adjustedHeight+8 +'px');
	} else {
		$(chatboxtextarea).css('overflow','auto');
	}
	 
}

function startChatSession(){  
	$.ajax({
	  url: "/mob/chat?action=startchatsession",
	  cache: false,
	  dataType: "json",
	  success: function(data) {
 
		username = data.username;

		$.each(data.items, function(i,item){
			if (item)	{ // fix strange ie bug

				chatboxtitle = item.f;
        idchatuser = item.i;
				if ($("#chatbox_"+idchatuser).length <= 0) {
					createChatBox(chatboxtitle,item.i,1);
				}
				
				if (item.s == 1) {
					item.f = username;
				}

				if (item.s == 2) {
					$("#chatbox_"+idchatuser+" .chatboxcontent").append('<div class="chatboxmessage"><span class="chatboxinfo">'+item.m+'</span></div>');
				} else {
					$("#chatbox_"+idchatuser+" .chatboxcontent").append('<div class="chatboxmessage"><span class="chatboxmessagefrom">'+item.f+':&nbsp;&nbsp;</span><span class="chatboxmessagecontent">'+item.m+'</span></div>');
				}
			}
		});
		
		for (i=0;i<chatBoxes.length;i++) {
			idchatuser = chatBoxes[i];
			$("#chatbox_"+idchatuser+" .chatboxcontent").scrollTop($("#chatbox_"+idchatuser+" .chatboxcontent")[0].scrollHeight);
			setTimeout('$("#chatbox_"+idchatuser+" .chatboxcontent").scrollTop($("#chatbox_"+idchatuser+" .chatboxcontent")[0].scrollHeight);', 100); // yet another strange ie bug
		}
	
	setTimeout('chatHeartbeat();',chatHeartbeatTime);
		
	}});
}

/**
 * Cookie plugin
 *
 * Copyright (c) 2006 Klaus Hartl (stilbuero.de)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 */

jQuery.cookie = function(name, value, options) {
    if (typeof value != 'undefined') { // name and value given, set cookie
        options = options || {};
        if (value === null) {
            value = '';
            options.expires = -1;
        }
        var expires = '';
        if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
            var date;
            if (typeof options.expires == 'number') {
                date = new Date();
                date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
            } else {
                date = options.expires;
            }
            expires = '; expires=' + date.toUTCString(); // use expires attribute, max-age is not supported by IE
        }
        // CAUTION: Needed to parenthesize options.path and options.domain
        // in the following expressions, otherwise they evaluate to undefined
        // in the packed version for some reason...
        var path = options.path ? '; path=' + (options.path) : '';
        var domain = options.domain ? '; domain=' + (options.domain) : '';
        var secure = options.secure ? '; secure' : '';
        document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
    } else { // only name given, get cookie
        var cookieValue = null;
        if (document.cookie && document.cookie != '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = jQuery.trim(cookies[i]);
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
};
