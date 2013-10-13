function loadTimer(){
  var v=new Date();
  var bx=document.getElementById('bx');
  
  if (bx === null) return;
  
  var t = function() {
    var n=new Date();
    var s=$_tiempoRestante-Math.round((n.getTime()-v.getTime())/1000.);
    var m=0;
    var h=0;
    if(s<0){
      bx.innerHTML=$_txtFinalizado;
    } else {
      if(s>59){
        m=Math.floor(s/60);
        s=s-m*60;
      }
      if(m>59){
        h=Math.floor(m/60);m=m-h*60;
      } 
      if(s<10){
        s="0"+s;
      }
      if(m<10){
      m="0"+m;
      }
      
      bx.innerHTML=h+":"+m+":"+s+$_txtCancelar;
    }
  
    //window.setTimeout("t()",999);
  }

  window.setInterval(t, 999);
}

$(loadTimer);