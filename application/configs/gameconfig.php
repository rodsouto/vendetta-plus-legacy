<?php

/*
formula tiempo habitacion: nivel*nivel*duracion/nivel oficina;
*/

$conf_accionesTropas = array(1 => "atacar", 2 => "transportar", 3 => "estacionar", 4 => "ocupar");

$conf_entrenamientos=array(
	"rutas"=> array("nombre"=>"Planificacion de rutas", "arm"=>500, "mun"=>1200, "dol"=>0, "duracion"=>2000, "puntos"=>"15,5"),
	"encargos"=> array("nombre"=>"Planificacion de encargos", "arm"=>1000, "mun"=>2500, "dol"=>1000, "duracion"=>5000, "puntos"=>"46"),	
    "extorsion"=> array("nombre"=>"Extorsion", "arm"=>1000, "mun"=>2000, "dol"=>0, "duracion"=>3000, "puntos"=>"26"),
	"administracion"=> array("nombre"=>"Administración de base", "arm"=>0, "mun"=>0, "dol"=>5000, "duracion"=>14400, "puntos"=>"76"),
	"contrabando"=> array("nombre"=>"Contrabando", "arm"=>0, "mun"=>0, "dol"=>1500, "duracion"=>9600, "puntos"=>"23,5"),
	"espionaje"=> array("nombre"=>"Espionaje", "arm"=>500, "mun"=>500, "dol"=>300, "duracion"=>4200, "puntos"=>"13"),
	"seguridad"=> array("nombre"=>"Seguridad", "arm"=>1000, "mun"=>4000, "dol"=>1000, "duracion"=>4000, "puntos"=>"61"),
	"proteccion"=> array("nombre"=>"Proteccion de grupo", "arm"=>3000, "mun"=>5000, "dol"=>2000, "duracion"=>5000, "puntos"=>"96"),
	"combate"=> array("nombre"=>"Combate cuerpo a cuerpo", "arm"=>2000, "mun"=>2000, "dol"=>3000, "duracion"=>6200, "puntos"=>"76"),
	"armas"=> array("nombre"=>"Combate de armas a corta distancia", "arm"=>1000, "mun"=>200, "dol"=>3000, "duracion"=>5100, "puntos"=>"53"),
	"tiro"=> array("nombre"=>"Entrenamiento de Tiro", "arm"=>5000, "mun"=>12000, "dol"=>10000, "duracion"=>19200, "puntos"=>"296"),
	"explosivos"=> array("nombre"=>"Fabricación de explosivos", "arm"=>10000, "mun"=>19500, "dol"=>15000, "duracion"=>42000, "puntos"=>"471"),
	"guerrilla"=> array("nombre"=>"Entrenamiento de guerrilla", "arm"=>8000, "mun"=>10000, "dol"=>12000, "duracion"=>20000, "puntos"=>"321"),
	"psicologico"=> array("nombre"=>"Entrenamiento psicologico", "arm"=>2000, "mun"=>5000, "dol"=>16000, "duracion"=>26000, "puntos"=>"301"),
	"quimico"=> array("nombre"=>"Entrenamiento químico", "arm"=>4000, "mun"=>12000, "dol"=>1000, "duracion"=>14400, "puntos"=>"0"),
	"honor"=> array("nombre"=>"Honor", "arm"=>0, "mun"=>0, "dol"=>280000, "duracion"=>92000, "puntos"=>"4201")
);

$conf_habitaciones=array(
	"oficina"=> array("desc" => "El Jefe se encuentra en esta oficina, y aquí, se toman todas las decisiones. Coordina el desarrollo y la velocidad de construcción de las otras áreas. Cuando más nivel, más rápido se desarrollan el resto.", "nombre"=>"Oficina del Jefe", "arm"=>100, "mun"=>200, "dol"=>0, "duracion"=>900, "produccion"=>0, "puntos"=>"6"),
	"escuela"=> array("desc" => "Como ya dice el nombre, esta habitación permite el entrenamiento de \"los chicos\" en nuevas ténicas, permitiéndoles tener más experiencia en combate. Al igual que para la oficina de El Jefe, cuánto más rápido se haga el entrenamiento, más rápido se desarrollan las habilidades.", "nombre"=>"Escuela de especialización", "arm"=>1000, "mun"=>1000, "dol"=>0, "duracion"=>2000, "produccion"=>0, "puntos"=>"31,75"),
	"armeria"=> array("desc" => "Aquí, en la Armería, como dice el nombre, se guardan armas. Serán de gran necesidad para ocupar nuevos lugares, y para entrenamientos en combate. Cuanto mejor desarrollada esté, más armas podrás hacer al mismo tiempo.", "nombre"=>"Armería", "arm"=>12, "mun"=>60, "dol"=>0, "duracion"=>500, "produccion"=>10, "puntos"=>"2,32"),
	"municion"=> array("desc" => "El almacén de munición es similar a la armería. Aquí, se manufactura la munición importante. Es necesaria, en grandes cantidades, al ocupar áreas, así como para su uso en entrenamientos. A diferencia de las armas, la munición se usa mucho más rápido.", "nombre"=>"Almacén de munición", "arm"=>9, "mun"=>15, "dol"=>0, "duracion"=>600, "produccion"=>10, "puntos"=>"1,39"),
	"cerveceria"=> array("desc" => "Esta habitación manufactura alcohol. Desgraciadamente (¿o afortunadamente?) está prohibido y por tanto, muy demandado por la población, así que es un negocio próspero. Sin embargo, necesitarás ciertas estrategias para poder llevarlo hasta los ciudadanos.", "nombre"=>"Cervecería", "arm"=>20, "mun"=>20, "dol"=>0, "duracion"=>1000, "produccion"=>50, "puntos"=>"1,6"),
	"taberna"=> array("desc" => "En la taberna se consume alcohol. Aquí es donde traficas con Alcohol. Ten cuidado de no ser detectado por la Policia, o te saldrá caro. Dado que la taberna se supervisa batante mal, la conversión de alcohol es moderada.", "nombre"=>"Taberna", "arm"=>10, "mun"=>50, "dol"=>0, "duracion"=>1500, "produccion"=>2, "puntos"=>"2,1"),
	"contrabando"=> array("desc" => "Mejor que la taberna funciona el contrabando, podrás vender alcohol con un impacto mucho mayor, lo que naturalmente, beneficia a la caja de los gángsters. Desgraciadamente, esta táctica es arriesgada, y mucho más costosa.", "nombre"=>"Contrabando", "arm"=>2000, "mun"=>5000, "dol"=>500, "duracion"=>4000, "produccion"=>21, "puntos"=>"136"),
	"almacen_arm"=> array("desc" => "En el almacén de armas, se guarda todo el armamento que no se necesita de inmediato. El proceso es automático, y se mantienen allí hasta que sean necesarias. Además, ningún enemigo podrá robártelas de este almacén.", "nombre"=>"Almacén de armas", "arm"=>100, "mun"=>500, "dol"=>0, "duracion"=>9000, "produccion"=>0, "puntos"=>"12"),
	"deposito"=> array("desc" => "El depósito de munición funciona de forma similar al almacén de armas. Se guardan cajas de munición y granadas que no se vayan a usar de inmediato. Además, aquí están más seguras, a salvo del enemigo.", "nombre"=>"Depósito de munición", "arm"=>500, "mun"=>600, "dol"=>0, "duracion"=>12000, "produccion"=>0, "puntos"=>"18"),
	"almacen_alc"=> array("desc" => "Ya que la destilación de alcohol es bastante sencilla, la producción es alta. Para poder almacenarlo sin perder el exceso de producción, necesitas construir un almacén de alcohol. En el mismo, estará a salvo de los enemigos.", "nombre"=>"Almacén de alcohol", "arm"=>200, "mun"=>200, "dol"=>0, "duracion"=>8000, "produccion"=>0, "puntos"=>"7"),
	"caja"=> array("desc" => "Después de realizar un contrabando con éxito, conseguirás una buena cantidad de dólares. Pero, ¡presta atención!. Si no quieres tirar el dinero, debes usar esta caja, para prevenir que desaparezca, y para asegurarte liquidez.", "nombre"=>"Caja fuerte", "arm"=>2000, "mun"=>2000, "dol"=>1000, "duracion"=>16000, "produccion"=>0, "puntos"=>"91"),
	"campo"=> array("desc" => "Tal y como dice el nombre, en el campo de entrenamiento, tus \"chicos\" entrenarán. El mismo, dependerá según el tipo de unidades que puedas producir, por ejemplo, simples delincuentes, asesinos, profesionales, a los que tus enemigos tendrán un respeto extremo. Dependiendo del nivel, las unidades serán creadas en menor tiempo.", "nombre"=>"Campo de entrenamiento", "arm"=>1000, "mun"=>2500, "dol"=>0, "duracion"=>5600, "produccion"=>0, "puntos"=>"61"),
	"seguridad"=> array("desc" => "Al igual que el entrenamiento de luchadores en el campo de entrenamiento, aquí podrás entrenar a los más jóvenes en defensa. En principio, se quedarán permanentemente, siempre en el hogar, y protegiendo sus habitaciones contra enemigos. Si tus gángsters están de vuelta, automáticamente luchan juntos.", "nombre"=>"Seguridad", "arm"=>0, "mun"=>0, "dol"=>0, "duracion"=>6000, "produccion"=>0, "puntos"=>"45"),
	"torreta"=> array("desc" => "A fin de aliviar un poco el trabajo de los defensores, dispones de ciertas construcciones, como esta torreta de fuego automático. Técnicamente, son muy avanzadas, y en el momento en que detecten a un enemigo, abrirán fuego de golpe.", "nombre"=>"Torreta de fuego automático", "arm"=>1000, "mun"=>2000, "dol"=>200, "duracion"=>4500, "produccion"=>0, "puntos"=>"57"),
	"minas"=> array("desc" => "Estas minas son una ayuda incluso más \"agradable\". Tus chicos las repartirán a lo largo de la casa. Cuando algún enemigo la pise sin darse cuenta... ¡Buenas noches!", "nombre"=>"Minas ocultas", "arm"=>2000, "mun"=>2000, "dol"=>150, "duracion"=>3000, "produccion"=>0, "puntos"=>"65.5")
);

$conf_tropas = array(
    "maton"=>array("nombre"=>"Maton", "arm"=>200, "mun"=>1000, "dol"=>0, "duracion"=>1400, "puntos"=>6, "ataque"=>5, "defensa"=>5, "capacidad"=>200, "velocidad"=>1600, "salario"=>1, "requisitos"=>array(), "bonificacionesA"=>array(), "bonificacionesD"=>array()),
    "portero"=>array("nombre"=>"Portero", "arm"=>500, "mun"=>8000, "dol"=>0, "duracion"=>1600, "puntos"=>6, "ataque"=>8, "defensa"=>6, "capacidad"=>400, "velocidad"=>2000, "salario"=>1, "requisitos"=>array(), "bonificacionesA"=>array("extorsion"), "bonificacionesD"=>array("extorsion", "seguridad")),
    "acuchillador"=>array("nombre"=>"Acuchillador", "arm"=>1000, "mun"=>200, "dol"=>0, "duracion"=>2000, "puntos"=>4, "ataque"=>10, "defensa"=>4, "capacidad"=>300, "velocidad"=>2500, "salario"=>1, "requisitos"=>array(), "bonificacionesA"=>array("extorsion", "armas"), "bonificacionesD"=>array("extorsion", "cuerpo")),
    "pistolero"=>array("nombre"=>"Pistolero", "arm"=>2000, "mun"=>3000, "dol"=>0, "duracion"=>1200, "puntos"=>21, "ataque"=>30, "defensa"=>10, "capacidad"=>500, "velocidad"=>2400, "salario"=>2, "requisitos"=>array(), "bonificacionesA"=>array("tiro"), "bonificacionesD"=>array("seguridad", "proteccion")),
    "ocupacion"=>array("nombre"=>"Tropa de Ocupacion", "arm"=>20000, "mun"=>10000, "dol"=>20000, "duracion"=>344000, "puntos"=>251, "ataque"=>1, "defensa"=>10, "capacidad"=>3000, "velocidad"=>2000, "salario"=>500, "requisitos"=>array(), "bonificacionesA"=>array(), "bonificacionesD"=>array()),
    "espia"=>array("nombre"=>"Espia", "arm"=>500, "mun"=>200, "dol"=>0, "duracion"=>14000, "puntos"=>3, "ataque"=>1, "defensa"=>1, "capacidad"=>50, "velocidad"=>400000, "salario"=>1, "requisitos"=>array(), "bonificacionesA"=>array("espionaje"), "bonificacionesD"=>array("espionaje")),
    "porteador"=>array("nombre"=>"Porteador", "arm"=>300, "mun"=>100, "dol"=>1000, "duracion"=>3600, "puntos"=>9, "ataque"=>4, "defensa"=>6, "capacidad"=>10000, "velocidad"=>2400, "salario"=>5, "requisitos"=>array(), "bonificacionesA"=>array("combate"), "bonificacionesD"=>array("combate")),
    "cia"=>array("nombre"=>"Agente de la CIA", "arm"=>7000, "mun"=>10000, "dol"=>2500, "duracion"=>17000, "puntos"=>87, "ataque"=>100, "defensa"=>90, "capacidad"=>3000, "velocidad"=>3400, "salario"=>30, "requisitos"=>array(), "bonificacionesA"=>array("armas", "tiro", "guerrilla"), "bonificacionesD"=>array("proteccion", "guerrilla")),
    "fbi"=>array("nombre"=>"Agente del FBI", "arm"=>4000, "mun"=>6000, "dol"=>1000, "duracion"=>15500, "puntos"=>48, "ataque"=>60, "defensa"=>50, "capacidad"=>2000, "velocidad"=>3000, "salario"=>20, "requisitos"=>array(), "bonificacionesA"=>array("proteccion", "tiro"), "bonificacionesD"=>array("proteccion", "tiro")),
    "transportista"=>array("nombre"=>"Transportista", "arm"=>1000, "mun"=>2000, "dol"=>5000, "duracion"=>17200, "puntos"=>51, "ataque"=>6, "defensa"=>8, "capacidad"=>40000, "velocidad"=>5000, "salario"=>10, "requisitos"=>array(), "bonificacionesA"=>array("psicologico"), "bonificacionesD"=>array("proteccion", "psicologico")),
    "francotirador"=>array("nombre"=>"Francotirador", "arm"=>4000, "mun"=>500, "dol"=>2000, "duracion"=>25000, "puntos"=>28, "ataque"=>200, "defensa"=>10, "capacidad"=>1000, "velocidad"=>6000, "salario"=>20, "requisitos"=>array(), "bonificacionesA"=>array("seguridad", "tiro", "guerrilla", "psicologico"), "bonificacionesD"=>array("tiro", "guerrilla", "psicologico")),
    "asesino"=>array("nombre"=>"Asesino", "arm"=>10000, "mun"=>15000, "dol"=>10000, "duracion"=>6000, "puntos"=>176, "ataque"=>300, "defensa"=>200, "capacidad"=>2000, "velocidad"=>6500, "salario"=>50, "requisitos"=>array(), "bonificacionesA"=>array("seguridad", "proteccion", "tiro", "guerrilla", "psicologico"), "bonificacionesD"=>array("seguridad", "proteccion", "tiro", "guerrilla", "psicologico")),
    "ninja"=>array("nombre"=>"Ninja", "arm"=>2000, "mun"=>1000, "dol"=>30000, "duracion"=>40000, "puntos"=>236, "ataque"=>400, "defensa"=>600, "capacidad"=>5000, "velocidad"=>8000, "salario"=>60, "requisitos"=>array(), "bonificacionesA"=>array("combate", "armas", "guerrilla", "psicologico"), "bonificacionesD"=>array("combate", "armas", "guerrilla", "psicologico")),
    "mercenario"=>array("nombre"=>"Mercenario", "arm"=>80000, "mun"=>120000, "dol"=>50000, "duracion"=>144000, "puntos"=>1176, "ataque"=>1000, "defensa"=>1200, "capacidad"=>12000, "velocidad"=>4500, "salario"=>300, "requisitos"=>array(), "bonificacionesA"=>array("espionaje", "seguridad", "proteccion", "combate", "armas", "tiro", "guerrilla", "psicologico"), "bonificacionesD"=>array("espionaje", "seguridad", "proteccion", "combate", "armas", "tiro", "guerrilla", "psicologico"))
);

//"demolicion"=>array("nombre"=>"Experto en Demolicion", "arm"=>40000, "mun"=>6000, "dol"=>20000, "duracion"=>60000, "puntos"=>281, "ataque"=>2000, "defensa"=>200, "capacidad"=>2500, "velocidad"=>3500, "salario"=>200, "requisitos"=>array(), "bonificacionesA"=>array(), "bonificacionesD"=>array()),
//"tactico"=>array("nombre"=>"Experto Tactico", "arm"=>5000, "mun"=>10000, "dol"=>4000, "duracion"=>20000, "puntos"=>93, "ataque"=>120, "defensa"=>150, "capacidad"=>4000, "velocidad"=>4000, "salario"=>40, "requisitos"=>array(), "bonificacionesA"=>array("seguridad", "tiro", "guerrilla", "psicologico"), "bonificacionesD"=>array("tiro", "guerrilla", "psicologico")),

/*
http://board.vendetta.es/thread.php?postid=378793#post378793
*/

return(object) array(
    "entrenamientos" => $conf_entrenamientos,
    "habitaciones" => $conf_habitaciones,
    "tropas" => $conf_tropas
);