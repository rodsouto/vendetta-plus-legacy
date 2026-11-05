# Misiones ocultas: resolver ataques válidos sin caducidad por revelación

Fecha inicial: 2026-10-28. Estado actualizado al 2026-10-29: v2 es el único protocolo oculto desde la inicialización. Se eliminaron v1, la activación opcional y la compatibilidad. Falta el servicio/replay de certificados reales para nuevas misiones y setup/auditoría antes de lanzamiento. No hay despliegues reales. Los avances se enlazan al final.

Primer experimento completado: [simulación de disponibilidad y sus resultados](../benchmarks/hidden-barriers/README.md). Compara 324 ejecuciones sintéticas de fronteras globales, discos y discos ampliados a propietarios. La clausura local todavía no está demostrada: el experimento informa la investigación, no aprueba la implementación descrita aquí.

Segunda investigación completada: [dependencias reales y frontera acotada](hidden-mission-dependencies.md). Incluye 12 probes sobre el simulador real, conflictos de investigación/familias/mercado/coordenadas y una cuestión adicional de identidad y secuencias que debe resolverse antes de definir el oráculo local.

Planificador de referencia completado para las rutas cubiertas: [comparación con el oráculo y límites](../benchmarks/resource-frontier/README.md). Conserva los asignadores actuales mediante recursos compartidos: 512 historias finitas coinciden en estado completo y comprobantes de misiones, con 629 misiones ocultas procesadas después de la gracia actual. Es un prototipo TS, no una implementación Solidity ni una solución de validación de ciphertexts.

Primer spike criptográfico: [apertura posterior y componente de pairing](../benchmarks/timelock-opening/README.md). El predicado Node clasifica 24 vectores y coincide con tlock-js; una prueba Groth16 real del pairing fue verificada en EVM. **La prueba completa de apertura/invalidez sigue pendiente**: no se debe integrar el componente aislado ni usar su gas/tiempo como coste del certificado completo.

Continuación: [cápsula tlock ligada al pairing](../benchmarks/timelock-opening/capsule-proof/README.md). La relación incorpora la derivación de clave y el chequeo rP. Un probe reproduce en unos 338 ms entradas legítimas que agotan un límite artificial de cuatro candidatos H3. Esto refuerza una condición de diseño: los límites del prover nunca pueden convertirse en reglas de invalidez o cancelación.

Actualización del 29 de octubre: [descifrado age y vínculo con el ciphertext](../benchmarks/timelock-opening/age-circuit/README.md). El circuito de restricciones une KEM, autenticación/descifrado age y el hash canónico del archivo, con 18 vectores nativos y pruebas de manipulación. No generó un nuevo certificado Groth16. Una regresión sobre el hash original demuestra que la autenticidad de drand sigue siendo obligatoria antes de interpretar sus flags como invalidez: esa parte y las reglas de la misión aún no están en la relación.

Autenticación incorporada en el wrapper siguiente: [quicknet y ronda dentro de la apertura](../benchmarks/timelock-opening/beacon-auth/README.md). La relación autenticada rechaza esa firma falsa y firmas auténticas de otra ronda. Se comprobó con witnesses/restricciones; siguen pendientes el contexto, el compromiso y las reglas de la misión, la cobertura de formatos/límites y un certificado completo. No se ha integrado en producción.

Predicado canónico unido: [mensaje y contexto de la misión](../benchmarks/timelock-opening/mission-predicate/README.md). Se contrastaron compromiso, tipo, destino, distancia redondeada, cargo y vínculo ABI con cadena/contrato/misión/llegada original, incluidos ciphertexts con salt máximo de uint256. No se generó aún un certificado nuevo. Dos formatos válidos para el decoder actual quedan fuera de ese perfil sin que se los declare inválidos: cerrar esa cobertura, H3 y las rutas de datos malformados es obligatorio antes de integrar cancelaciones.

## Objetivo

Una misión válida no debe perder su resultado porque el jugador cierre el navegador, falle el keeper, haya congestión o su revelación se publique tarde. Al recuperarse el servicio debe resolverse en su hora y orden originales, con el mismo resultado que habría tenido si se hubiera revelado a tiempo.

Solo los envíos inválidos deben rechazarse o descartarse por invalidez. Esto no elimina las reglas normales del juego: un ataque puede perder el combate, rebotar por las condiciones del destino o ser retirado legítimamente antes de llegar. «Resolver correctamente» no significa garantizar una victoria.

Hay dos garantías diferentes:

- **Corrección:** una demora no cancela ni altera el resultado histórico de una misión válida.
- **Progreso:** finalmente se obtiene la información y alguien publica las transacciones necesarias. No podemos garantizar un plazo finito ante una interrupción indefinida de la cadena o de drand.

## Comportamiento actual y problema

Referencias: [Missions.sol](../../contracts/src/core/Missions.sol), [Settlement.sol](../../contracts/src/core/Settlement.sol), [keeper.ts](../../apps/web/scripts/keeper.ts), [hidden.ts](../../apps/web/src/chain/hidden.ts) y [B-22](../spec/blockchain.md#b-22--hidden-information--new).

1. El envío oculto compromete tipo y destino mediante un hash. El ciphertext se publica en un evento; el contrato no verifica que cifre un mensaje válido, coincida con ese hash o use la ronda de drand prevista.
2. Al llegar, una misión aún oculta sale de la cola global y queda aparcada. Las demás misiones y acciones pueden continuar.
3. `reveal` solo acepta revelaciones anteriores a `arrival + HIDDEN_REVEAL_GRACE` (60 segundos en la especificación actual).
4. Una revelación tardía aceptada reemplaza `arrival` por el instante de revelación y asigna un nuevo `seq`.
5. Transcurrida la gracia, cualquiera puede llamar a `forfeit`: las tropas y la carga regresan desde ese momento, pero se pierde el ataque y el salario ya pagado.
6. La ventana de orden y el descanso de tropas mitigan algunas carreras, pero no cubren una caída larga del keeper.
7. `recall` permite retirar una misión aparcada después de su llegada. La posibilidad de elegir entre revelar y retirar según el estado observado ya existe hoy.
8. La clasificación de basura del cliente usa expresiones regulares sobre mensajes de error de tlock. El keeper recuerda esa clasificación y también marca como basura errores de contrato distintos de `Backlog` y `OutOfOrder`. Esto puede confundir fallos reintentables con invalidez; no hemos reproducido aquí un error real de infraestructura con ese resultado.

Hay además una discrepancia documental: B-22 menciona una apertura del keeper a los 8–11 segundos, pero `hidden.ts` usa `HEAD_START = 15 s`. La ventana de orden también vale 15 s: con el calendario previsto, cuando drand permite abrir una misión ya han vencido las ventanas de las misiones anteriores. No hay que usar el texto antiguo para estimar garantías actuales.

Ejemplo: un ataque debía llegar a las 12:00; el keeper se recupera a las 12:10. Hoy ya no puede revelarse. Si solo elimináramos la caducidad, pero conserváramos la reprogramación, combatiría contra el estado de las 12:10. Si el defensor sacó sus tropas a las 12:01, tampoco obtendríamos el resultado de las 12:00.

## Qué podemos tomar de Dark Forest

Dark Forest registra la llegada al enviar y aplica los eventos vencidos cronológicamente al actualizar el planeta: primero crecimiento hasta la llegada, luego combate y finalmente los eventos posteriores. No necesita una transacción exactamente en la hora de llegada.

Fuentes fijadas al commit `30584297044a44d20c672614e2a8f5917086e5ab` de `darkforest-eth/eth`:

- [DFMoveFacet.sol](https://github.com/darkforest-eth/eth/blob/30584297044a44d20c672614e2a8f5917086e5ab/contracts/facets/DFMoveFacet.sol): registro y actualización de movimientos.
- [LibLazyUpdate.sol](https://github.com/darkforest-eth/eth/blob/30584297044a44d20c672614e2a8f5917086e5ab/contracts/libraries/LibLazyUpdate.sol): orden temporal y combate.
- [LibPlanet.sol](https://github.com/darkforest-eth/eth/blob/30584297044a44d20c672614e2a8f5917086e5ab/contracts/libraries/LibPlanet.sol): cálculo y persistencia del estado actualizado.

La diferencia decisiva es que su contrato conoce el destino desde el envío. Nuestro contrato no sabe qué edificio debe proteger frente a acciones posteriores. Podemos adoptar la resolución cronológica, pero no copiar sin más su aislamiento por planeta ni concluir que eso resuelve la revelación oculta.

## Invariantes propuestos

1. Una misión válida no caduca por el reloj ni se descarta por ausencia de una revelación.
2. La llegada y el desempate originales `(arrival, seq)` se conservan después de llegar. Una demora no concede al remitente el derecho de elegir cuándo combate.
3. No se confirman acciones posteriores que puedan cambiar el resultado de una misión anterior pendiente.
4. Revelar información y ejecutar el juego son operaciones separadas. Debe poder publicarse una revelación correcta aunque la ejecución esté detenida por otro evento anterior.
5. Reintentos y revelaciones duplicadas son seguros; cualquier participante puede colaborar.
6. Los fallos de RPC, disponibilidad de drand o infraestructura se consideran reintentables; no prueban invalidez.
7. Un atacante no debe poder introducir un ciphertext imposible de abrir y detener indefinidamente al resto.
8. El simulador TypeScript y los contratos mantienen exactamente las mismas transiciones, orden y errores.

## Diseño propuesto: validez al enviar y frontera de resolución

### A. Verificar el contenido cifrado sin publicar el destino

Investigar una prueba criptográfica que vincule el ciphertext publicado con el compromiso y demuestre que su mensaje cumple las reglas comprobables al enviar:

- Tipo, coordenadas y origen válidos; distancia real dentro del `cover`.
- Restricciones de carga según el tipo.
- Mismo propietario, tipo, destino y salt que el compromiso.
- Cifrado correcto bajo la identidad y ronda permitidas de drand, calculadas a partir de la llegada aceptada por el contrato.
- Vinculación a la instancia del juego y parámetros pertinentes para evitar sustitución de pruebas o ciphertexts.

La relación exacta, los datos públicos y la resistencia a reutilización se deben especificar antes de elegir circuito y sistema de pruebas. La prueba debe ser de conocimiento cero, no solo sólida. La misión debe conservar un hash del ciphertext y la prueba debe vincularse a ese hash; guardar un hash no garantiza por sí mismo disponibilidad del ciphertext. Reglas que dependen del estado al llegar siguen evaluándose al llegar; no deben confundirse con validez del mensaje cifrado.

**Esto todavía no está implementado ni se ha demostrado viable con nuestro stack tlock.** Probar únicamente coordenadas válidas o el conocimiento del compromiso no demuestra que terceros puedan descifrar el ciphertext. Validar el formato tampoco basta. Hace falta probar el cifrado y su relación con el mensaje, incluida la ronda correcta.

Si resulta demasiado caro probar el formato tlock actual, habría que estudiar un formato de cifrado verificable diferente o aceptar explícitamente otro modelo de confianza. No se presupone una solución barata.

Hay que medir especialmente las operaciones de BLS12-381/IBE dentro del circuito y la generación local de pruebas. No disponemos de un benchmark que justifique cifras concretas de tiempo, memoria o gas. Delegar la generación a un servicio que recibe el mensaje revelaría el destino a ese servicio; no es equivalente a generarla localmente. La elección de sistema también introduce hipótesis de solidez y, según el caso, de setup.

La garantía criptográfica buscada es condicional: si se obtiene el material correcto de la ronda, el mensaje se recupera y satisface los predicados probados. No garantiza que drand publique esa ronda, que alguien conserve el ciphertext o que pague la revelación. Los predicados del circuito y de `reveal` deben ser equivalentes: no puede existir una misión aceptada como válida al enviar que luego sea irrecuperable por una restricción adicional de revelación. Pueden mantenerse comprobaciones defensivas redundantes si verifican la misma relación.

Esto también debe conservarse al actualizar el contrato UUPS: no basta con que el circuito y `reveal` coincidan el día del envío. Un cambio de reglas, constantes, distancia o verificador no debe invalidar misiones ya aceptadas. Hay que versionar la relación por misión o impedir cambios incompatibles mientras existan misiones pendientes de esa versión, usando fuentes compartidas de reglas y pruebas de equivalencia.

Con una prueba completa, los envíos basura se rechazan en la entrada. No hace falta conservar una cancelación por tiempo para distinguirlos de los honestos. El contrato no puede inferir intención maliciosa: distingue invalidez demostrable de información todavía no disponible.

### B. Conservar las misiones pendientes sin vencimiento

- Eliminar la caducidad temporal para misiones cuya validez esté garantizada.
- Eliminar el `forfeit` por mera ausencia de revelación para esas misiones.
- No cambiar la llegada ni el orden al revelar tarde.
- Mantener el ciphertext accesible desde los eventos, junto con la vinculación verificable que necesite el contrato. Evaluar retención de logs, proveedores y recuperación independiente.
- Permitir publicar revelaciones sin ejecutar antes toda la cola. La interfaz actual `Game.reveal` usa `drained`; eliminar esa dependencia es un requisito bloqueante del diseño: si la nueva frontera impidiera terminar el drain, la revelación que la desbloquea tampoco podría ejecutarse.
- Separar recepción/validación de revelaciones de la ejecución cronológica. Pueden aceptarse datos de misiones posteriores aunque sus efectos todavía no se apliquen.

### C. Una frontera impide adelantar estado dependiente

La hora finalizada del juego no puede cruzar una llegada oculta vencida cuyo contenido aún falte, si cruzarla permitiría modificar su resultado.

Para una primera implementación, la opción más fácil de razonar es una frontera global conservadora: se procesan eventos conocidos en orden hasta la primera llegada sin información. La recepción de pruebas y revelaciones debe seguir disponible. Las acciones de juego que requieran pasar esa frontera esperan o se rechazan con un motivo recuperable.

No basta con detener `advance`: también hay que impedir que acciones de edificios, investigación, mercado, vacaciones, abandono, envíos o retiradas muten estado relevante por delante de la frontera. La clasificación completa es trabajo pendiente. Las lecturas deben distinguir el estado confirmado de cualquier proyección tentativa.

También hay que inventariar las funciones que hoy no usan `drained`, incluyendo suspensión, cambios de premium y gestión de cuentas. No todas afectan al combate, pero algunas influyen en otras reglas del juego. Los plazos de mercado, invitaciones y sesiones siguen consumiendo tiempo real durante la pausa: decidir si se mantienen o compensan es parte del diseño.

El orden estricto haría innecesaria la ventana de revelaciones `HIDDEN_ORDER_WINDOW`/`OutOfOrder` como mecanismo de orden. Debe revisarse por separado si el descanso de tropas sigue siendo una regla de juego deseada: ya no sería necesario alargarlo para compensar la demora de revelación.

Tras recuperarse drand o el keeper:

1. Se publican las revelaciones pendientes.
2. Se resuelve cada misión con su llegada y orden originales.
3. Se avanza entrenamiento, producción y demás eventos en su posición temporal correspondiente.
4. Se procesan retornos y dependencias generados, incluso si también vencieron durante la caída.
5. El juego vuelve a aceptar acciones hasta el presente cuando termina de ponerse al día.

La resolución debe paginarse con un presupuesto de gas acotado por transacción. Una pausa larga no puede exigir ponerse al día en una sola llamada.

### D. Retiradas y comportamiento del remitente

Una retirada solicitada después de la llegada original no puede eliminar el combate pendiente: daría al atacante una opción de cancelarlo cuando el resultado le parezca desfavorable. Hay que conservar las retiradas legítimas anteriores a la llegada y definir su posición temporal sin permitir saltarse la frontera.

Lo mismo se aplica a vacaciones, abandono y cualquier otra acción del dueño o del defensor que afecte al resultado. La garantía no debe depender de mantener un cooldown cada vez más largo.

## Coste inevitable de la disponibilidad

La primera versión global puede detener escrituras de juego cuando falte una revelación, incluso de una misión ajena. Con el calendario actual (`HEAD_START = 15 s`), si el remitente no revela, la espera normal incluye esos 15 segundos más la publicación por el keeper y su inclusión. Las latencias reales no se han medido aquí.

Con una frontera correctamente aplicada, podría reducirse `HEAD_START` a un margen entre el reloj de drand y el tiempo de la cadena: ya no necesita reservar una ventaja de inclusión al remitente. Mientras el defensor no pueda mutar estado posterior a la llegada pendiente, adelantarse a la revelación pública no le permite evadirla; habría que revisar también la necesidad de un RPC privado para esa amenaza concreta. Esto no justifica abrir antes de la llegada efectiva en la cadena: el margen de relojes y el supuesto de confidencialidad de drand deben verificarse.

Ejemplo puramente ilustrativo, no previsión de usuarios: 5.000 llegadas diarias equivalen a una cada 17,28 segundos. Si cada llegada provoca una espera independiente de duración fija D y se modelan como Poisson, la fracción cubierta por esperas sería `1 − exp(−D / 17,28)`: aproximadamente 44 % con D = 10 s y 72 % con D = 22 s. Es un modelo simplificado sin colas, no una medición del sistema. Muestra por qué hay que simular la carga antes de recomendar una barrera global.

Además, misiones perfectamente válidas y baratas pueden usarse para generar pausas continuas. La prueba de validez no es una defensa suficiente contra congestión o múltiples cuentas. Hacen falta límites, costes y mediciones, sin prometer que un límite por cuenta elimine ese ataque.

Una prueba de validez evita ciphertexts basura, pero no vuelve disponible a drand ni paga las transacciones de recuperación. Seguimos necesitando infraestructura de revelación y presupuesto de gas.

## Alternativas y compromisos

| Alternativa | Ventajas | Contras / garantía obtenida |
| --- | --- | --- |
| Aumentar gracia y desplegar varios keepers | Cambio pequeño; menos fallos operativos | Reduce la probabilidad de cancelación; no garantiza el resultado original ni cubre una caída más larga |
| Quitar solo la gracia | Los honestos pueden revelar después | Si se conserva la reprogramación, cambia el resultado; la basura sigue pendiente y el remitente puede elegir cuándo revelar |
| Volver a poner solo la fecha original | Parece un cambio pequeño | Incorrecto sobre estado ya mutado; no reconstruye tropas, recursos, propiedad ni consecuencias posteriores |
| Frontera global + cifrado verificable | Orden claro, sin rollback; garantía fuerte de corrección bajo las hipótesis criptográficas | Complejidad criptográfica; pausa global y dependencia de drand; no garantiza tiempo máximo de espera |
| Fronteras por disco de `cover` o conjunto de destinos posibles | Menor alcance de las pausas; el disco de origen y `cover` ya es público y no añade una filtración por sí mismo | Hay que cubrir también casillas vacías y dependencias de jugadores, investigación, honor, mercado y misiones entre zonas; un conjunto más preciso podría filtrar información adicional |
| Plazo desde publicación on-chain de la ronda de drand | Distingue caída de drand de ausencia de reveladores; podría evitar probar todo el cifrado | Sigue pudiendo cancelar misiones válidas; requiere verificar la ronda y permitir descartes, y no cumple la garantía estricta |
| Cola de intenciones durante la espera | Permite recibir órdenes sin confirmar sus efectos antes de tiempo | Validación y errores asíncronos, más almacenamiento y gas; no equivale a ejecutar inmediatamente ni elimina el bloqueo de finalización |
| Historial y ejecución especulativa con rollback | Permite seguir aceptando actividad | Recalcular efectos encadenados es complejo y costoso; no se pueden revertir libremente transferencias externas ya ejecutadas |
| Destino público desde el envío | Facilita adoptar el enfoque de Dark Forest y evitar la revelación del destino | Pierde la ocultación del objetivo y cambia la estrategia del juego |
| Servicio o comité que certifica validez/descifrado | Puede reducir trabajo criptográfico on-chain | Añade confianza, censura y disponibilidad del operador; no equivale a la garantía del diseño propuesto |

Un depósito o una penalización económica puede encarecer la basura, pero no demuestra que sea basura y no ofrece por sí solo la garantía solicitada.

### Alternativa sugerida por Claude: plazo desde la publicación de drand

Cualquiera aportaría la firma de la ronda; tras comprobarla on-chain, empezaría un plazo T. Si nadie revela durante T, la misión se descartaría o devolvería. Esto evita que una caída de drand consuma la gracia antes de poder descifrar.

Sin embargo, una firma publicada no demuestra que el ciphertext sea basura ni que haya un revelador operativo. Puede haber una ronda disponible y todos los keepers caídos, o el remitente desconectado. En ese caso el plazo cancela un ataque válido. También hay que garantizar una oportunidad real de revelación bajo congestión y definir qué significa T. No se acepta como equivalente al objetivo de este documento.

La verificación BLS y su coste, los precompilados disponibles en Gnosis y la vinculación entre la ronda certificada y el ciphertext enviado quedan sin verificar. No asumimos que la alternativa esté implementada ni sea barata. Solo tendría sentido como simplificación si se aprueba expresamente una garantía más débil.

## Pros del diseño propuesto

- Caídas de keeper o congestión dejan trabajo pendiente, en vez de cancelar ataques válidos.
- La hora del combate deja de depender de quién logró publicar primero una revelación tardía.
- Intercepciones y orden entre ataques, refuerzos y retornos se explican con una regla temporal única.
- La basura se rechaza antes de reservar un lugar bloqueante en la cola, si la prueba cubre realmente todo el cifrado.
- No requiere deshacer estado ya confirmado ni guardar versiones completas del mundo.
- La revelación sigue siendo permissionless; varios keepers pueden mejorar disponibilidad sin cambiar el resultado.

La [tercera revisión con Claude y auditoría de cobertura](../benchmarks/timelock-opening/coverage-review/README.md) recomienda decidir el dominio de compatibilidad antes de ampliar perfiles. Incluye un experimento H3 paginado, sus restricciones de privacidad y los desacuerdos con el revisor; no constituye un certificado completo.

## Contras y riesgos

- El cifrado verificable puede convertirse en el componente más difícil del proyecto: desarrollo, generación de pruebas en navegador, tamaño, gas y auditoría.
- Una prueba incompleta que acepte un mensaje irrecuperable convierte una misión en bloqueo permanente.
- La frontera global sacrifica disponibilidad de escrituras, incluso con misiones válidas y pequeñas demoras normales.
- Las dependencias de investigación compartida, mercado y retornos dificultan reducir la frontera a un edificio.
- Un flujo constante de misiones puede mantener retrasado el estado finalizado; hacen falta límites y mediciones de capacidad, no solo validez individual.
- Nuevas interfaces y estados de espera afectan ABI, simulador, proyecciones, cliente, keeper e indexación.
- No se garantiza recuperación si desaparece definitivamente la información criptográfica necesaria. Una salida administrativa cambiaría las garantías y debe declararse, no ocultarse como timeout.

Antes de desplegar debe existir una política explícita para drand retirado, pérdida irreversible de datos y errores del circuito. Las opciones incluyen aceptar un mundo detenido, una migración o una intervención de emergencia con confianza declarada. No existe una salida que descarte un ataque todavía desconocido y garantice simultáneamente su resultado original. Hace falta decidir esta política; no introducir automáticamente un timeout para disimular el conflicto.

La recuperación voluntaria por el remitente depende del criterio de validez elegido. Si al enviar ya se probó la validez completa del cifrado, publicar `(kind, target, salt)` puede permitir progreso sin drand bajo esa garantía previa y sin caducidad. Si la validez del ciphertext se decide después, abrir solo el compromiso no basta para ejecutar efectos: el mensaje puede registrarse como información, pero debe satisfacer el mismo criterio de validez que las demás rutas. De lo contrario, un remitente podría elegir combatir mediante revelación o abortar mediante una prueba de ciphertext inválido. No se ha implementado una prueba alternativa de cifrado correcto que permita esa recuperación sin beacon. La cooperación del remitente tampoco es una garantía de disponibilidad.

## Plan de investigación antes de implementar

1. Acordar la garantía estricta y la política de indisponibilidad permanente. Separar las mejoras operativas compatibles con el diseño actual: clasificación de errores por causa verificable y corrección del calendario documentado. Son trabajos propuestos, no autorizados aquí para implementación.
2. Simular carga normal y adversaria con una frontera global y distintos márgenes de apertura. Fijar carga objetivo, máximo de espera aceptable y ritmo mínimo de recuperación antes de invertir en criptografía.
3. Si la disponibilidad resultante es aceptable, especificar la relación de prueba y hacer una prueba de viabilidad del cifrado verificable: medir generación local, gas y coste de integración. Analizar ronda futura, ciphertext sustituido y mensajes inválidos. No introducir una frontera permanente sin resolver cómo excluir basura.
4. Diseñar recepción de revelaciones, finalización y retiradas; revisar todas las acciones y dependencias. Elegir alcance global o acotado y definir UI de espera. Si el alcance global falla, evaluar la clausura de dependencias del disco de `cover` antes de descartarla por completo.
5. Investigar el plazo desde drand solo si se acepta relajar la garantía. Puede compararse su coste, pero no sustituye el objetivo vigente.
6. Actualizar B-22/B-07/B-08 y después implementar simulador y Solidity juntos. Mantener codegen y consumidores sincronizados.
7. Medir recuperación tras una caída y capacidad sostenida antes de desplegar.

## Criterios de aceptación

- Para cada ejecución con latencia L, registrar el historial aceptado A_L (incluidos timestamp y desempate). Tras ponerse al día, su estado y reportes deben coincidir con un oráculo que ejecuta ese mismo historial revelando cada misión a su llegada. No se exige que dos latencias admitan las mismas acciones: la frontera puede cambiar cuáles se aceptan. La investigación de dependencias detectó que IDs y secuencias actuales se asignan al ejecutar: antes de usar este criterio con un planificador local, definir identidad y desempates o una equivalencia explícita sobre referencias. No asumir igualdad literal de IDs sin resolverlo.
- Una caída superior a 60 segundos no cancela un ataque válido ni cambia su llegada o desempate.
- Un defensor no puede sacar a las 12:01 tropas que un ataque pendiente de las 12:00 debía haber alcanzado.
- Se conserva el orden en empates y entre ataques, refuerzos, entrenamiento, investigación, ocupaciones y retornos.
- No se puede retirar después de la llegada para evitar un combate todavía pendiente.
- Los envíos con ciphertext inválido, compromiso incongruente o ronda no autorizada no entran como eventos bloqueantes.
- Una revelación correcta puede publicarse aunque haya un bloqueo anterior o backlog; las duplicadas no dañan el estado.
- Una caída de RPC o drand nunca se usa como evidencia de basura.
- La recuperación usa lotes de gas acotado y coincide entre TS y Solidity mediante escenarios diferenciales.
- Fijar umbrales de carga, espera y recuperación; medir uso normal y ataques con múltiples cuentas. El ritmo sostenible de recuperación debe superar las llegadas previstas. No se da por satisfecha esta condición con un límite por jugador.
- Ningún mensaje admitido por la prueba falla después por un predicado estático adicional de `reveal`; comprobarlo mediante pruebas de equivalencia y vectores negativos.
- Distinguir errores de frontera de otros errores legítimos de validación y de backlog. Un rechazo por frontera identifica la misión que bloquea; no se promete que toda acción fuera de la espera sea válida.
- Bajo las hipótesis declaradas de drand y de relojes, reducir el margen no expone el objetivo antes de la llegada efectiva en la cadena.

## Recomendación provisional

No aplicar el parche aislado de eliminar la gracia. Mantener **cifrado verificable + resolución cronológica con frontera** como candidato que respeta el objetivo estricto, pero medir primero la disponibilidad bajo carga y el riesgo de bloqueo con misiones válidas. La frontera global es una referencia de corrección, no una recomendación de experiencia de juego ya aprobada. Si se continúa, hace falta validar después la viabilidad criptográfica antes de implementar la nueva máquina de estados.

Si la pausa global resulta inaceptable o la prueba criptográfica no es viable, debemos escoger explícitamente qué ceder: ocultación del objetivo, confianza en infraestructura o equivalencia exacta con la llegada original. Más keepers y una gracia mayor son mejoras operativas útiles, pero no sustituyen esa decisión.

## Revisión de Claude y respuesta

La revisión completa, sin editar sus conclusiones, está en [hidden-mission-resolution-claude-review.md](../reviews/hidden-mission-resolution-claude-review.md). Sus estimaciones criptográficas y de red no son benchmarks verificados ni decisiones aprobadas. La revisión calificó algunos requisitos ya previstos en el borrador como omisiones; aquí se distinguen los cambios sustantivos de los énfasis adicionales.

### Feedback aceptado e incorporado

- Medir disponibilidad y abuso antes de invertir en ZK. La validez no impide generar muchas pausas con misiones honestamente cifradas.
- El disco de `cover` ya es público; usarlo no añade por sí solo una filtración. Se corrigió la tabla de alternativas.
- La frontera permite reconsiderar el margen de apertura, el RPC privado y la ventana de orden. El coste de esperar 15 segundos no es necesariamente inevitable en el nuevo diseño.
- Hacer explícito el interbloqueo de mantener `reveal` con `drained`, la equivalencia entre circuito y contrato, el hash del ciphertext y la privacidad de un prover externo.
- Añadir funciones sin drain, consumo de plazos reales, política de fallo permanente, cola de intenciones y criterios basados en un oráculo sobre el historial aceptado.
- Documentar la retirada tardía ya permitida, las heurísticas de clasificación de basura y el calendario desactualizado de B-22. No se corrigió código como parte de esta tarea.

### Desacuerdos que permanecen

1. **Timeout tras drand como primera solución recomendada.** Claude propone priorizarlo por su menor complejidad. No lo considero equivalente: puede cancelar una misión válida cuando nadie revela durante T. Se documenta como alternativa que requiere relajar expresamente el objetivo del usuario.
2. **«Siempre hace falta una salida».** Claude exige diseñarla desde el principio; coincido en exigir una política explícita, pero no doy por hecho que deba garantizar continuidad a cualquier coste. Aceptar un mundo detenido es una elección posible, aunque probablemente mala como producto. Recuperar la continuidad sin conocer un evento anterior exige otra garantía o confianza adicional.
3. **Comprobaciones estáticas solo en el circuito.** Claude recomienda retirarlas de `reveal`. Lo necesario es equivalencia exacta de predicados; mantener verificaciones redundantes no es incorrecto por sí mismo.
4. **Reserva sobre las estimaciones.** Claude identifica sus cifras de minutos, GB y gas como supuestos; no es un desacuerdo factual. No se usan para decidir ni se da por viable la verificación BLS en Gnosis sin un prototipo y fuentes específicas.

Este apartado registra las diferencias tras la primera ronda. Claude compartía el diagnóstico y rechazaba eliminar solo la gracia. Su desacuerdo principal era priorizar una alternativa sin ZK; pedía medir la disponibilidad de la barrera antes de invertir en criptografía, no descartarla de antemano. Tras la revisión se cambió el orden de investigación y se amplió el análisis de disponibilidad, conservando el requisito de no descartar ataques válidos por falta de revelación. La segunda ronda siguiente actualiza cuáles de esas diferencias siguen vigentes.

## Segunda ronda con Claude: consenso y nueva alternativa

Revisión completa: [hidden-mission-resolution-claude-round2.md](../reviews/hidden-mission-resolution-claude-round2.md). Se pidió revisar expresamente los desacuerdos sin relajar el requisito del usuario.

### Cambios de postura y correcciones

- **Timeout desde drand:** Claude reconoce que una ronda publicada no demuestra invalidez. Retira recomendar el plazo bajo el requisito estricto: transforma una falta de progreso en cancelación de una misión válida.
- **Fallo permanente:** acepta que una pausa indefinida conserva corrección aunque pierda progreso. Retira equiparar esa política con una salida por timeout; sigue exigiendo documentar la política antes de desplegar, y coincidimos.
- **Validaciones duplicadas:** acepta que no son incorrectas por sí mismas. Lo importante es equivalencia y control de versiones. Añade el riesgo de actualizar UUPS mientras existan misiones pendientes, incorporado arriba.
- **Estimaciones:** confirma que sus cifras y la disponibilidad de primitivas en Gnosis no estaban medidas. No hay desacuerdo factual que resolver con esas cifras.
- **Corrección de nuestra atribución:** Claude no proponía descartar la frontera global; su alternativa con timeout también la usaba. Se corrigió el resumen de la primera ronda.
- **Revelación sin drand:** se explicita arriba que el remitente puede aportar el mensaje que conserva. Una caída de drand no bloquea necesariamente si alguien con el mensaje coopera.

**Ya no quedan desacuerdos sustantivos en esos cuatro puntos.** Sí quedan decisiones de producto y viabilidad técnica abiertas; consenso entre revisores no demuestra que el diseño sea implementable con costes aceptables.

### Nueva línea: invalidez demostrada después de la llegada

Además de demostrar validez al enviar, investigar si alguien puede demostrar después de la apertura de la ronda que un ciphertext concreto es inválido. La frontera y el orden histórico se conservan. No se descarta nada solo porque transcurra tiempo.

La prueba debe vincularse al hash del ciphertext realmente enviado, al compromiso y parámetros de la misión y al material auténtico de la ronda autorizada. Debe demostrar un fallo determinista bien especificado: por ejemplo, que descifrar esos bytes con ese material autenticado no produce un mensaje que cumpla los predicados. Un mensaje de error del keeper, una clave elegida por quien reclama o la mera ausencia de una revelación nunca son pruebas suficientes.

Todas las rutas deben usar el mismo contexto inmutable y criterio de validez del sobre completo, fijados por versión antes de admitir el envío. Una revelación que satisface ese criterio se procesa en su hora original; una invalidez demostrada aplica la política de envíos inválidos. Sin ninguna, continúa la espera. Abrir solo el compromiso no puede competir con una prueba de ciphertext inválido: «gana la primera transacción» permitiría elegir entre combatir y abortar. La política no debe reinterpretar retroactivamente envíos anteriores. Este requisito todavía no está integrado en contratos.

Ventajas potenciales:

- El trabajo pesado podría trasladarse a servidores después de la ronda, cuando la información necesaria para descifrar ya es pública. No requiere que el navegador genere una prueba privada al enviar.
- Mantiene el principio de que una demora no prueba invalidez ni cancela un ataque válido.
- Puede evitar probar cifrado correcto para cada envío, si comprobar aperturas normales y resolver los casos inválidos resulta más barato. Esto es una hipótesis, no un resultado medido.

Costes y cuestiones sin resolver:

- La basura entra y bloquea hasta que se publique una prueba correcta; disponibilidad y gas de esos probadores importan. No ofrece el rechazo temprano del diseño original.
- Hay que especificar y verificar toda la relación de descifrado, incluida autenticación de la ronda, sobre malformado, contenido inválido y ronda distinta. No se da por hecho que una verificación BLS aislada sea suficiente.
- Necesita una forma verificable de distinguir la ronda autorizada incluso si el remitente publica un sobre para una ronda futura. De lo contrario un envío basura puede imponer una espera arbitraria.
- Tras publicar una prueba de invalidez, las penalizaciones pueden desalentar abuso, pero no sustituyen la prueba ni garantizan disponibilidad ante múltiples cuentas.
- No se ha construido un circuito ni medido coste. Aunque la información ya sea pública, el contrato sigue necesitando una prueba sólida o una verificación directa correcta; no basta confiar en el servidor.
- B-01 indica que la lógica no debe depender de precompilados específicos de una cadena. Cualquier propuesta que use EIP-2537 debe contrastarse con esa regla y verificar soporte real; no se presume aprobado un cambio de especificación.

### Investigación recomendada tras ambas rondas

1. Mantener el objetivo estricto y decidir la política de indisponibilidad permanente, incluida recuperación voluntaria por el remitente.
2. Medir frontera global y frontera por clausura del disco de `cover` bajo carga normal y adversaria, antes de escoger una como experiencia de producto.
3. Comparar en el diseño y luego mediante prototipos **validez previa** e **invalidez posterior demostrada**, verificando compatibilidad con B-01, disponibilidad de datos, pruebas de equivalencia y versionado de reglas. Son líneas de investigación; no una autorización de implementación.
4. Mantener el timeout desde drand fuera de las soluciones que cumplen el objetivo; solo reconsiderarlo si el usuario cambia expresamente ese requisito.

### Avance posterior: H3 paginado sin inicializador de confianza

El [experimento KEM/H3](../benchmarks/timelock-opening/paginated-kem/README.md) liga una caché pública por entrada con un certificado Groth16 real de 17 entradas; su verificador desplegado ocupa 8.712 bytes. El cifrado válido de cinco intentos se verifica correctamente en EVM. También existe un wrapper del perfil de misión con 52 entradas, comprobado mediante restricciones: no se ha generado su prueba ni integrado la resolución. Esta composición no amplía por sí sola la cobertura de JSON/age ni autoriza cancelaciones desde el resultado aislado de KEM.

### Dominio futuro de mensajes

Se preparó el [codec v2 fijo](../benchmarks/timelock-opening/codec-v2/README.md): mensaje de 37 bytes, paquete de 273 y contexto con dominio `VENDETTA_OPENING_V2`. Mantiene tlock/age y el salt completo; evita perfiles según longitud del JSON, ronda o salt. La ruta anterior sigue vigente para sus mensajes. Antes de habilitar la admisión v2 quedan pendientes las ramas criptográficas de basura, el certificado completo medido y la integración histórica; el formato por sí solo no autoriza a cancelar.

### Certificado completo v2 medido

Se generaron y verificaron en EVM dos [certificados Groth16 completos de misión v2](../benchmarks/timelock-opening/mission-v2-proof/README.md): ataque válido de cinco intentos H3 y compromiso incorrecto. El verificador ocupa 13.847 bytes; verificar cuesta alrededor de 736.000 gas en transacciones Anvil separadas, con prefijo ya calculado y sin efectos de Game. También se implementó la [rama independiente de U inválido](../benchmarks/timelock-opening/invalid-point/README.md), comprobada por restricciones y revisada con Claude, pendiente de su prueba/verificador. La política de agotamiento H3 se comprueba con recibos mock y una rama de placeholder, sin afirmar un vector real de agotamiento. Continúan pendientes admisión v2 e integración de resolución histórica.

### Invalidez de U medida

La [rama de U inválido](../benchmarks/timelock-opening/invalid-point-proof/README.md) ya tiene dos pruebas Groth16 reales verificadas en EVM: flag incorrecto y punto de orden 13. Su verificador ocupa 6.697 bytes y verificar consume 348.676 gas en transacciones Anvil separadas. Se rechazaron las reutilizaciones contra otra misión y contra la misión válida original. Así quedan medidas las dos rutas criptográficas del prototipo; la admisión y resolución histórica en Game siguen pendientes.

### Primer componente de integración histórica

Se añadió un [núcleo de recepción y consumo de resultados](../benchmarks/timelock-opening/resolution-lifecycle/README.md) a TS y Solidity, sin conectarlo todavía a World/CoreState/Game. Conserva statement, llegada y secuencia originales; recibe evidencia sin reloj ni drain y permite consumo una sola vez. Cinco trazas compartidas comparan 33 pasos entre motores, más fuzz de tiempos y secuencias. Falta el adaptador de certificados y la frontera que protege el resto del mundo: este núcleo aislado no evita todavía adelantar estado ni cambia B-22 vigente.

### Receptor y cola conectados, sin admisión v2 pública

La [integración de evidencia y cola](../benchmarks/timelock-opening/evidence-queue/README.md) incorpora almacenamiento de bindings, recepción de ambas rutas sin `drained`, espera del head pendiente y consumo histórico. En un caso con dos ataques del mismo segundo y demora de dos horas, el simulador coincide en World completo con la ejecución puntual. Game sigue sin un endpoint de admisión v2: faltan el constructor de contexto, el tratamiento de mutaciones fuera de `drained` y la integración de cliente/keeper. Se detectó y corrigió el exceso de tamaño del contrato; Game mide 23.644 bytes y volvió a desplegarse en Anvil.

### Continuación: contexto desde almacenamiento

Se implementó el [constructor de contexto v2](../benchmarks/timelock-opening/game-context/README.md), compatible byte por byte con los nueve vectores archivados, junto con framing y binding interno desde el paquete. La admisión pública sigue deshabilitada. La revisión de mutaciones incluye ahora un contraejemplo ejecutable: el forfeit v1 puede cambiar el orden global de secuencias mientras v2 espera. Hace falta cerrar la política de transición antes de activar ambos protocolos.

### Continuación: admisión v2 opt-in

Se implementó la [activación de mundo y admisión v2](../benchmarks/timelock-opening/world-admission/README.md): solo el administrador, con cero misiones activas, fija consumidores una vez. Después de activarse, todo nuevo envío oculto se vincula a v2, cerrando la mezcla v1/v2 que alteraba secuencias. El loader/proyección reconoce los recibos. Los despliegues siguen en v1 y las pruebas integrales actuales usan mocks; falta el replay criptográfico real contra el contexto recién admitido y adaptar sender/keeper antes de uso operativo.

### Protocolo único desde el despliegue

La [implementación actual](../benchmarks/timelock-opening/v2-only/README.md) exige consumidores al inicializar, elimina las rutas v1 y usa el mismo paquete v2 en navegador, simulador y keeper. Las fases anteriores quedan como historial de investigación, sin capas activas de compatibilidad.


### Productor y replay real de contextos nuevos (29 de octubre de 2026)

El [productor HTTP](../benchmarks/timelock-opening/game-producer/README.md) ya genera y verifica certificados nuevos para misiones admitidas por Game, deriva el contexto de storage, autentica beacon/ronda, prepara H3 y comprueba los consumidores desplegados. El replay sobre Anvil privado usa Deploy.s.sol y consumidores reales, sin mocks: apertura válida recién cifrada (ronda 1001, salt máximo y origen en fila no cero), compromiso inválido y U inválido. El World completo coincide con evidencia puntual y retrasada dos horas; se rechazan pruebas manipuladas/cruzadas y se reconstruye H3 desde la caché tras revertir la cadena. Esto sustituye los pendientes de productor/contexto nuevo de fases anteriores, conservadas como historial.

Las claves son de setup local inseguro y permanecen fuera de Git. Siguen pendientes setup seguro, auditoría, endurecimiento operativo y evaluación de capacidad y disponibilidad; no se ha desplegado en redes reales.


### Medición inicial de capacidad real (30 de octubre de 2026)

El [lote de capacidad](../benchmarks/timelock-opening/game-producer/capacity/README.md)
completó seis misiones distintas y doce peticiones concurrentes en 23,09 minutos:
seis pruebas nuevas, seis deduplicaciones y 15,59 misiones/hora observadas.
Opening tardó 241,59–306,09 s nativos; invalid-point, 166,01–168,23 s; pico RSS
muestreado de 5,94 GiB. Se midieron 517120 gas de preparación H3 compartida y
7527257 gas totales de admisión/H3/certificados. No incluye despliegue ni drenaje.
El replay desde caché tras revertir Anvil mantuvo el mismo World completo.
Es un lote finito con firmas archivadas en estación compartida y setup local
inseguro: quedan carga prolongada, capacidad/costes operativos representativos,
recuperación de fallos prolongados, setup seguro y auditoría.


### Integración del worker residente (31 de octubre de 2026)

El productor ya usa el supervisor con timeout por trabajo, cierre y espera de
salida antes de reinicio/cambio de circuito. El replay real separado en
[worker-replay](../benchmarks/timelock-opening/game-producer/worker-replay/README.md)
generó tres certificados nuevos, reutilizó opening, cambió a invalid-point y
comprobó consumidores EVM/H3 reales. Tras revertir Anvil obtuvo tres hits de
caché, reconstruyó H3 y coincidió el World completo puntual/tardío. Sin nuevos
setups ni cambios de reglas/circuitos. No sustituye la carga prolongada, pruebas
con servicios remotos, recuperación de transacciones atascadas/reorg, setup
seguro o auditoría del roadmap de cierre.


### Cierre operativo local y recuperación (31 de octubre de 2026)

El [soak real de una hora](../benchmarks/timelock-opening/game-producer/worker-soak/README.md)
generó 35 pruebas en 62,54 minutos con seis contextos admitidos, ambos circuitos,
reutilizaciones calientes y cambios de setup sin procesos solapados observados.
Los certificados finales se consumieron en Game y el World completo coincidió
puntual/tardío tras revertir Anvil y reconstruir H3. La observación HTTPS separada
completó 61 muestras correctas de RPC público Gnosis y firma drand archivada.
El [replay de fallos sostenidos](../benchmarks/timelock-opening/game-producer/worker-faults/README.md)
añadió tres pruebas nuevas y recuperó caídas de al menos un minuto de RPC,
beacon y recibos H3 sin declarar INVALID, perder el journal ni retener la cola.

El keeper conserva bytes firmados antes del envío, resuelve resultados ambiguos
antes de preparar otro nonce y reconstruye su índice de ciphertexts tras reorg.
Sus historiales con Game/consumidor mock explícito comparan World completo con TS;
no se confunden con la evidencia criptográfica/H3 real. La política conservadora
no reemplaza fees: un nonce irresoluble mantiene el journal, y la recuperación
manual detiene esa instancia y configura otro signer dedicado con archivo nuevo.
El pronóstico cliente también respeta el head no certificado y deja de predecir
sin entrar en bucles. No hay cambios de reglas de combate ni de Solidity.

El cierre local no habilita producción: los setups siguen siendo inseguros,
los recursos son observaciones de hardware compartido y no hay SLA, auditoría
ni validación de costes/capacidad de una red real. El hito de producción conserva
sus requisitos separados; no se hizo ningún despliegue real.
