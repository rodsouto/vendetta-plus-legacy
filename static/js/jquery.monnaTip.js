/*
 * jQuery MonnaTip plugin 0.1
 *
 * http://gadelkareem.com/
 *
 * Copyright (c) 2010 GadElKareem
 *
 * 
 * licensed under GPL licenses:
 *   http://www.gnu.org/licenses/gpl.html
 */
;(function($) {
        var title = '',
            tip = false;
        $.fn.extend({
                monnaTip : function () {
                        tip = $('<p class="tip"></p>').appendTo(document.body);
                        return this.live('mouseenter', function(e){
                                            title = $(this).attr( 'title' );
                                            $(this).attr( 'title', '' );
                                            tip.html( title ).show();
                                            updatetip(e);
                                            $(document.body).bind('mousemove', updatetip);
                                            $(this).mouseleave( function(){
                                                tip.hide().empty().css({top: 0, left: 0} );
                                                $(this).attr( 'title', title );
                                                $(document.body).unbind('mousemove', updatetip);
                                                tip.unbind();

                                            });

                                         });
                 }
        });
        function updatetip(e){
            var s= {},
                x = 10,
                h = tip,
                l = (e.pageX + x),
                t = (e.pageY + x),
                v = {
                        l: $(window).scrollLeft(),
                        t: $(window).scrollTop(),
                        w: $(window).width(),
                        h: $(window).height()
                    };
            h.css({top: t + 'px', left: l + 'px'} );
            s = { w: h.width(), h: h.height() };
            if (v.l + v.w < s.w + l + (x*2)  && l > s.w )
                    h.css({left:  ( l - s.w  - (x*3)  ) + 'px'} );
            if (v.t + v.h < s.h + t + (x*3) && t > s.h)
                    h.css({ top:  ( t - s.h - (x*2) ) + 'px'} );
        }
})(jQuery);
