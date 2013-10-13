<?php

class Mob_Markup_Renderer_Html_Alliance implements Zend_Markup_Renderer_TokenConverterInterface
{
 
    public function convert(Zend_Markup_Token $token, $text)
    {
        return "<a href='/mob/familias/ver?idf=$text'>".Mob_Loader::getModel("Familias")->getNombre($text)."</a>";
    }
 
}