

$(document).ready(function() {

    $("#chatBar").css("right", ((($(window).width()-$("#wraper").width())/2)-210)+"px");

    var actionBuilding = window.location.href;
    $(document).keydown(function(e) {
    if (e.ctrlKey) return;
      
		if (e.target.nodeName == "INPUT" || e.target.nodeName == "TEXTAREA") return;
		
    var link;
    
    switch(e.which)
		{
		  // anterior paginacion
		  case 74:link = ".paginationPrev";break;
      // siguiente paginacion
		  case 75:link = ".paginationNext";break;
      // primero paginacion
		  case 85:link = ".paginationFirst";break;
      // ultimo paginacion
		  case 73:link = ".paginationLast";break;	
			// proximo edificio
			case 39:link = "#nextBuilding";break;	
			// edificio anterior
			case 37:link = "#prevBuilding";break;
			// vision general
			case 86:link = "#linkV";break;
			// habitaciones
			case 72:link = "#linkH";break;
			// reclutamiento
			case 82:link = "#linkR";break;
			// seguridad
			case 83:link = "#linkS";break;
			// entrenamiento
			case 69:link = "#linkE";break;
			//familias
			case 70:link = "#linkF";break;
			//misiones
			case 65:link = "#linkA";break;
			//mensajes
			case 77:link = "#linkM";break;
			//clasificacion
			case 67:link = "#linkC";break;
		}
                    
		if (link && $(link).length != 0) {
      $(link+":first").trigger("click");
      //window.location.href = $(link+":first").attr("href");
    }
	});
  var firstLoad = true;
  /*$.history.init(function(url) {
      if (firstLoad && url == "") {
        firstLoad = false;
        return;
      }
      if (url == "") url = "/mob/visiongeneral";
      $("#content").empty().addClass("loading").load(url, {format:"html"}, function(){
        $(this).removeClass("loading");
        $("#barraRecursos").css("top", originalTop+"px");
      });      
  }, {unescape: "/"});*/
	
	var tp = 1;
	
	/*$(".ajax").live("click", function(event){
	  event.preventDefault();
	  actionBuilding = $(this).attr("href").replace(/^.*#/, '');
	  _gaq.push(['_trackPageview', $(this).attr("href")]);
    $.history.load(actionBuilding.indexOf("?") == -1 ? actionBuilding+"?tp="+(tp++) : actionBuilding+"&tp="+(tp++));    
  });*/
  
  $("#building").change(function(){
    var url;
    url = actionBuilding.indexOf("?") == -1 ? actionBuilding : actionBuilding.split("?")[0];  
    $("#frmBuilding").attr("action", url).trigger("submit");
  });
  
  $("#prevBuilding, #nextBuilding").click(function(){
    var url;
    url = actionBuilding.indexOf("?") == -1 ? actionBuilding+$(this).attr("href") : actionBuilding.split("?")[0]+$(this).attr("href");
    window.location.href = url;
  }); 


	$('.hasTip').monnaTip();




  var originalTop = parseInt($("#logo").position().top+$("#logo").height());
  $("#barraRecursos").css("top", originalTop+"px");      
  $(window).scroll(function(){
    var scroll = $(window).scrollTop();
    $("#barraRecursos").css("top", scroll > originalTop ? scroll : originalTop+"px");
  });
  
  $("#msgSelectAll").click(function(event){
    event.preventDefault();
    $("#frmMensajes input[type=checkbox]").attr("checked", true);
  });
  
  $("#msgInvert").click(function(event){
    event.preventDefault();
    $("#frmMensajes input[type=checkbox]").each(function(k, v){
      $(v).attr("checked", !$(v).attr("checked"));
    });
  });
  
  $(".msgTxt").click(function(){
    var chk = $(this).parents(".msgRow").find("input[type=checkbox]");
    console.log(!chk.attr("checked"), chk);
    chk.attr("checked", !chk.attr("checked"));
  });
  
  
  $("#openChat").click(function(event){
    event.preventDefault();
    $("#chatUserList").toggle();
  });     
   
});
