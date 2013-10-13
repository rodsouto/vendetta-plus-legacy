<?php

class Mob_Markup_Renderer_Html_Link implements Zend_Markup_Renderer_TokenConverterInterface
{
 
    public function convert(Zend_Markup_Token $token, $text)
    {
        $attributes = array();
        foreach ($token->getAttributes() as $k => $v) {
            $attributes[] = "$k='$v'";
        }
        return '<a '.implode(" ", $attributes).'>' . $text . '</a>';
    }
 
}