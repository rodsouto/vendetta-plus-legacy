#!/usr/bin/php

<?php

include "base.php";

Mob_Loader::getModel("Tropa")->sumarTropas("11873", array("maton" => "10"));
Mob_Loader::getModel("Tropa")->sumarTropas("11873", array("maton" => "010"));