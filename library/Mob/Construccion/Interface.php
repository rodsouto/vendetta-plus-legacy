<?php

interface Mob_Construccion_Interface
{
    public function getByUsuario($idUsuario);
    public function processQueue($v, $timestampEnviado);
    public function getCostoConstruccion($v);
    public function sendMessageNoRecursos($v, $timestampEnviado);
    public function getTipoCola();
    public function procesarNuevaConstruccion($idEdificio, $lastFinalizacion);
}