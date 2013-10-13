-- phpMyAdmin SQL Dump
-- version 3.3.8
-- http://www.phpmyadmin.net
--
-- Servidor: localhost
-- Tiempo de generación: 15-12-2010 a las 12:13:42
-- Versión del servidor: 5.0.91
-- Versión de PHP: 5.2.6

SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";

--
-- Base de datos: `vendetta_plus_old`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_baneos`
--

DROP TABLE IF EXISTS `mob_baneos`;
CREATE TABLE IF NOT EXISTS `mob_baneos` (
  `id_ban` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `id_admin` int(11) NOT NULL,
  `fecha` datetime NOT NULL,
  `motivo` text collate utf8_unicode_ci NOT NULL,
  PRIMARY KEY  (`id_ban`),
  KEY `id_usuario` (`id_usuario`,`id_admin`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_batallas`
--

DROP TABLE IF EXISTS `mob_batallas`;
CREATE TABLE IF NOT EXISTS `mob_batallas` (
  `id_batalla` int(11) NOT NULL auto_increment,
  `html` text NOT NULL,
  `atacante` int(11) NOT NULL,
  `defensor` int(11) NOT NULL,
  `resultado` text NOT NULL,
  `pts_atacante` int(11) NOT NULL,
  `pts_defensor` int(11) NOT NULL,
  `pts_perd_atacante` int(11) NOT NULL,
  `pts_perd_defensor` int(11) NOT NULL,
  `fecha` datetime NOT NULL,
  `recursos_arm` int(11) NOT NULL,
  `recursos_mun` int(11) NOT NULL,
  `recursos_dol` int(11) NOT NULL,
  `recursos_alc` int(11) NOT NULL,
  PRIMARY KEY  (`id_batalla`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_edificios`
--

DROP TABLE IF EXISTS `mob_edificios`;
CREATE TABLE IF NOT EXISTS `mob_edificios` (
  `id_edificio` int(5) NOT NULL auto_increment,
  `id_usuario` int(5) NOT NULL,
  `coord1` int(6) NOT NULL,
  `coord2` int(11) NOT NULL,
  `coord3` int(11) NOT NULL,
  `recursos_arm` int(12) NOT NULL,
  `recursos_mun` int(12) NOT NULL,
  `recursos_alc` int(12) NOT NULL,
  `recursos_dol` int(12) NOT NULL,
  `puntos` float NOT NULL default '0',
  `last_update` datetime NOT NULL,
  PRIMARY KEY  (`id_edificio`),
  UNIQUE KEY `coordenadas` (`coord1`,`coord2`,`coord3`),
  KEY `id_usuario` (`id_usuario`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_entrenamientos`
--

DROP TABLE IF EXISTS `mob_entrenamientos`;
CREATE TABLE IF NOT EXISTS `mob_entrenamientos` (
  `id_entrenamiento` int(5) NOT NULL auto_increment,
  `id_usuario` int(3) NOT NULL,
  `rutas` int(3) NOT NULL,
  `armas` int(3) NOT NULL,
  `encargos` int(3) NOT NULL,
  `extorsion` int(3) NOT NULL,
  `administracion` int(3) NOT NULL,
  `contrabando` int(3) NOT NULL,
  `espionaje` int(3) NOT NULL,
  `seguridad` int(3) NOT NULL,
  `proteccion` int(3) NOT NULL,
  `combate` int(3) NOT NULL,
  `tiro` int(3) NOT NULL,
  `explosivos` int(3) NOT NULL,
  `guerrilla` int(3) NOT NULL,
  `psicologico` int(3) NOT NULL,
  `quimico` int(3) NOT NULL,
  `honor` int(3) NOT NULL,
  PRIMARY KEY  (`id_entrenamiento`),
  UNIQUE KEY `id_usuario` (`id_usuario`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_entrenamientos_nuevos`
--

DROP TABLE IF EXISTS `mob_entrenamientos_nuevos`;
CREATE TABLE IF NOT EXISTS `mob_entrenamientos_nuevos` (
  `id_entrenamiento_nuevo` int(6) NOT NULL auto_increment,
  `id_usuario` int(6) NOT NULL,
  `id_edificio` int(6) NOT NULL,
  `fecha_fin` timestamp NOT NULL default CURRENT_TIMESTAMP,
  `duracion` int(11) NOT NULL,
  `entrenamiento` text NOT NULL,
  `nivel` int(11) NOT NULL,
  `coord` varchar(15) NOT NULL,
  PRIMARY KEY  (`id_entrenamiento_nuevo`),
  KEY `id_usuario` (`id_usuario`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_errores`
--

DROP TABLE IF EXISTS `mob_errores`;
CREATE TABLE IF NOT EXISTS `mob_errores` (
  `id_error` int(11) NOT NULL auto_increment,
  `error` text NOT NULL,
  PRIMARY KEY  (`id_error`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_familias`
--

DROP TABLE IF EXISTS `mob_familias`;
CREATE TABLE IF NOT EXISTS `mob_familias` (
  `id_familia` int(11) NOT NULL auto_increment,
  `etiqueta` varchar(8) NOT NULL,
  `nombre` varchar(35) NOT NULL,
  `logo` varchar(255) NOT NULL,
  `descripcion` text NOT NULL,
  `web` text NOT NULL,
  PRIMARY KEY  (`id_familia`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_familias_mensajes`
--

DROP TABLE IF EXISTS `mob_familias_mensajes`;
CREATE TABLE IF NOT EXISTS `mob_familias_mensajes` (
  `id_mensaje` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `id_familia` int(11) NOT NULL,
  `mensaje` text NOT NULL,
  `fecha` datetime NOT NULL,
  PRIMARY KEY  (`id_mensaje`),
  KEY `id_familia` (`id_familia`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_familias_miembros`
--

DROP TABLE IF EXISTS `mob_familias_miembros`;
CREATE TABLE IF NOT EXISTS `mob_familias_miembros` (
  `id_miembro` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `id_familia` int(11) NOT NULL,
  `id_rango` int(11) NOT NULL,
  PRIMARY KEY  (`id_miembro`),
  UNIQUE KEY `id_usuario` (`id_usuario`),
  KEY `id_familia` (`id_familia`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_familias_rangos`
--

DROP TABLE IF EXISTS `mob_familias_rangos`;
CREATE TABLE IF NOT EXISTS `mob_familias_rangos` (
  `id_rango` int(11) NOT NULL auto_increment,
  `id_familia` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `tipo` int(11) NOT NULL default '0',
  `leer_mensaje` int(11) NOT NULL default '0',
  `escribir_mensaje` int(11) NOT NULL default '0',
  `borrar_mensaje` int(11) NOT NULL default '0',
  `aceptar_miembro` int(11) NOT NULL default '0',
  `enviar_circular` int(11) NOT NULL default '0',
  `recibir_circular` int(11) NOT NULL default '0',
  PRIMARY KEY  (`id_rango`),
  KEY `id_familia` (`id_familia`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_familias_solicitudes`
--

DROP TABLE IF EXISTS `mob_familias_solicitudes`;
CREATE TABLE IF NOT EXISTS `mob_familias_solicitudes` (
  `id_solicitud` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `id_familia` int(11) NOT NULL,
  `texto` text NOT NULL,
  `fecha` datetime NOT NULL,
  PRIMARY KEY  (`id_solicitud`),
  KEY `id_familia` (`id_familia`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_habitaciones`
--

DROP TABLE IF EXISTS `mob_habitaciones`;
CREATE TABLE IF NOT EXISTS `mob_habitaciones` (
  `id_habitacion` int(5) NOT NULL auto_increment,
  `id_edificio` int(5) NOT NULL,
  `id_usuario` int(11) NOT NULL,
  `oficina` int(3) NOT NULL default '0',
  `escuela` int(3) NOT NULL default '0',
  `armeria` int(3) NOT NULL default '0',
  `municion` int(3) NOT NULL default '0',
  `cerveceria` int(3) NOT NULL default '0',
  `taberna` int(3) NOT NULL default '0',
  `contrabando` int(3) NOT NULL default '0',
  `almacenArm` int(3) NOT NULL default '0',
  `deposito` int(3) NOT NULL default '0',
  `almacenAlc` int(3) NOT NULL default '0',
  `caja` int(3) NOT NULL default '0',
  `campo` int(3) NOT NULL default '0',
  `seguridad` int(3) NOT NULL default '0',
  `torreta` int(3) NOT NULL default '0',
  `minas` int(3) NOT NULL default '0',
  PRIMARY KEY  (`id_habitacion`),
  UNIQUE KEY `id_edificio` (`id_edificio`),
  KEY `id_usuario` (`id_usuario`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_habitaciones_nuevas`
--

DROP TABLE IF EXISTS `mob_habitaciones_nuevas`;
CREATE TABLE IF NOT EXISTS `mob_habitaciones_nuevas` (
  `id_habitacion_nueva` int(6) NOT NULL auto_increment,
  `id_usuario` int(6) NOT NULL,
  `id_edificio` int(6) NOT NULL,
  `fecha_fin` timestamp NOT NULL default CURRENT_TIMESTAMP,
  `duracion` int(11) NOT NULL,
  `habitacion` text NOT NULL,
  `nivel` int(11) NOT NULL,
  `coord` varchar(15) NOT NULL,
  PRIMARY KEY  (`id_habitacion_nueva`),
  KEY `id_usuario` (`id_usuario`),
  KEY `id_edificio` (`id_edificio`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_logueos`
--

DROP TABLE IF EXISTS `mob_logueos`;
CREATE TABLE IF NOT EXISTS `mob_logueos` (
  `id_login` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `ip` varchar(255) collate utf8_unicode_ci NOT NULL,
  `fecha` datetime NOT NULL,
  PRIMARY KEY  (`id_login`),
  KEY `id_usuario` (`id_usuario`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_mensajes`
--

DROP TABLE IF EXISTS `mob_mensajes`;
CREATE TABLE IF NOT EXISTS `mob_mensajes` (
  `id_mensaje` int(11) NOT NULL auto_increment,
  `remitente` int(11) NOT NULL,
  `destinatario` int(11) NOT NULL,
  `asunto` varchar(255) NOT NULL,
  `mensaje` text NOT NULL,
  `fecha_enviado` timestamp NOT NULL default '0000-00-00 00:00:00',
  `borrado_rem` tinyint(4) NOT NULL default '0',
  `borrado_dest` tinyint(4) NOT NULL,
  `id_carpeta` int(11) NOT NULL default '0',
  `leido` int(11) NOT NULL default '0',
  PRIMARY KEY  (`id_mensaje`),
  KEY `destinatario` (`destinatario`),
  KEY `remitente` (`remitente`),
  KEY `borrado_rem` (`borrado_rem`),
  KEY `borrado_dest` (`borrado_dest`),
  KEY `id_carpeta` (`id_carpeta`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_mensajes_carpetas`
--

DROP TABLE IF EXISTS `mob_mensajes_carpetas`;
CREATE TABLE IF NOT EXISTS `mob_mensajes_carpetas` (
  `id_carpeta` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  PRIMARY KEY  (`id_carpeta`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_misiones`
--

DROP TABLE IF EXISTS `mob_misiones`;
CREATE TABLE IF NOT EXISTS `mob_misiones` (
  `id_mision` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `tropas` text NOT NULL,
  `cantidad` int(11) NOT NULL,
  `coord_dest_1` int(11) NOT NULL,
  `coord_dest_2` int(11) NOT NULL,
  `coord_dest_3` int(11) NOT NULL,
  `coord_orig_1` int(11) NOT NULL,
  `coord_orig_2` int(11) NOT NULL,
  `coord_orig_3` int(11) NOT NULL,
  `mision` int(11) NOT NULL,
  `recursos_arm` int(11) NOT NULL,
  `recursos_mun` int(11) NOT NULL,
  `recursos_alc` int(11) NOT NULL,
  `recursos_dol` int(11) NOT NULL,
  `fecha_inicio` datetime NOT NULL,
  `fecha_fin` datetime NOT NULL,
  `duracion` int(11) NOT NULL,
  PRIMARY KEY  (`id_mision`),
  KEY `id_usuario` (`id_usuario`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_misiones_todas`
--

DROP TABLE IF EXISTS `mob_misiones_todas`;
CREATE TABLE IF NOT EXISTS `mob_misiones_todas` (
  `id_mision` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `tropas` text NOT NULL,
  `cantidad` int(11) NOT NULL,
  `coord_dest_1` int(11) NOT NULL,
  `coord_dest_2` int(11) NOT NULL,
  `coord_dest_3` int(11) NOT NULL,
  `coord_orig_1` int(11) NOT NULL,
  `coord_orig_2` int(11) NOT NULL,
  `coord_orig_3` int(11) NOT NULL,
  `mision` int(11) NOT NULL,
  `recursos_arm` int(11) NOT NULL,
  `recursos_mun` int(11) NOT NULL,
  `recursos_alc` int(11) NOT NULL,
  `recursos_dol` int(11) NOT NULL,
  `fecha_inicio` datetime NOT NULL,
  `fecha_fin` datetime NOT NULL,
  `duracion` int(11) NOT NULL,
  PRIMARY KEY  (`id_mision`),
  KEY `id_usuario` (`id_usuario`),
  KEY `mision` (`mision`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_puntos`
--

DROP TABLE IF EXISTS `mob_puntos`;
CREATE TABLE IF NOT EXISTS `mob_puntos` (
  `id_puntos` int(11) NOT NULL auto_increment,
  `id_usuario` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `puntos_edificios` int(11) NOT NULL,
  `puntos_tropas` int(11) NOT NULL,
  `puntos_entrenamientos` int(11) NOT NULL,
  `puntos_total` int(11) NOT NULL,
  `revision` int(11) NOT NULL,
  `pos_ranking` int(11) NOT NULL,
  PRIMARY KEY  (`id_puntos`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_textos`
--

DROP TABLE IF EXISTS `mob_textos`;
CREATE TABLE IF NOT EXISTS `mob_textos` (
  `id_texto` int(11) NOT NULL auto_increment,
  `ref` varchar(255) NOT NULL,
  `idioma` varchar(2) NOT NULL,
  `texto` text NOT NULL,
  PRIMARY KEY  (`id_texto`),
  UNIQUE KEY `ref_idioma` (`ref`,`idioma`),
  KEY `ref` (`ref`,`idioma`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_tropas`
--

DROP TABLE IF EXISTS `mob_tropas`;
CREATE TABLE IF NOT EXISTS `mob_tropas` (
  `id_tropa` int(5) NOT NULL auto_increment,
  `id_edificio` int(5) NOT NULL,
  `maton` int(20) NOT NULL default '0',
  `portero` int(20) NOT NULL default '0',
  `acuchillador` int(20) NOT NULL default '0',
  `pistolero` int(20) NOT NULL default '0',
  `ocupacion` int(20) NOT NULL default '0',
  `espia` int(20) NOT NULL default '0',
  `porteador` int(20) NOT NULL default '0',
  `cia` int(20) NOT NULL default '0',
  `fbi` int(20) NOT NULL default '0',
  `transportista` int(20) NOT NULL default '0',
  `tactico` int(20) NOT NULL default '0',
  `francotirador` int(20) NOT NULL default '0',
  `asesino` int(20) NOT NULL default '0',
  `ninja` int(20) NOT NULL default '0',
  `demoliciones` int(20) NOT NULL default '0',
  `mercenario` int(20) NOT NULL default '0',
  `ilegal` int(11) NOT NULL default '0',
  `centinela` int(11) NOT NULL default '0',
  `policia` int(11) NOT NULL default '0',
  `guardaespaldas` int(11) NOT NULL default '0',
  `guardia` int(11) NOT NULL default '0',
  PRIMARY KEY  (`id_tropa`),
  UNIQUE KEY `id_edificio` (`id_edificio`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_tropas_nuevas`
--

DROP TABLE IF EXISTS `mob_tropas_nuevas`;
CREATE TABLE IF NOT EXISTS `mob_tropas_nuevas` (
  `id_tropa_nueva` int(6) NOT NULL auto_increment,
  `fecha_fin` timestamp NOT NULL default '0000-00-00 00:00:00',
  `id_edificio` int(6) NOT NULL,
  `id_usuario` int(6) NOT NULL,
  `tropa` varchar(20) NOT NULL,
  `cantidad` int(6) NOT NULL,
  `duracion` int(11) NOT NULL,
  `tipo` int(11) NOT NULL,
  PRIMARY KEY  (`id_tropa_nueva`),
  KEY `id_edificio` (`id_edificio`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mob_usuarios`
--

DROP TABLE IF EXISTS `mob_usuarios`;
CREATE TABLE IF NOT EXISTS `mob_usuarios` (
  `id_usuario` int(5) NOT NULL auto_increment,
  `usuario` varchar(20) NOT NULL,
  `pass` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `last_update` datetime NOT NULL,
  `puntos_edificios` float NOT NULL default '0',
  `puntos_tropas` float NOT NULL default '0',
  `puntos_entrenamientos` float NOT NULL default '0',
  `last_online` datetime NOT NULL,
  `baneado` tinyint(1) NOT NULL default '0',
  `idioma` varchar(2) NOT NULL,
  PRIMARY KEY  (`id_usuario`),
  FULLTEXT KEY `usuario` (`usuario`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;
