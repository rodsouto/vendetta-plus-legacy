<?php

class Mob_View_Helper_NumberFormat extends Zend_View_Helper_Abstract {

    public function numberFormat($number) {
        return number_format(round($number), 0, null, ".");
    }

}