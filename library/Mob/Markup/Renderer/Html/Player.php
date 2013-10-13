<?php

class Mob_Markup_Renderer_Html_Player implements Zend_Markup_Renderer_TokenConverterInterface
{
 
    public function convert(Zend_Markup_Token $token, $text)
    {
        return "<a href='/mob/jugador/ver?id=$text'>".Mob_Loader::getModel("Usuarios")->getUsuario($text)."</a>";
    }
 
}