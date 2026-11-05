# Planificador por recursos frente al oráculo cronológico

Fecha: 2026-10-28. Prototipo de investigación posterior al [inventario de dependencias](../../proposals/hidden-mission-dependencies.md). No modifica contratos, keeper ni el simulador de producción.

## Resultado

El planificador conservador coincide con el oráculo en **512 de 512 historias con disponibilidad finita**, tanto en el estado final completo como en los comprobantes de efectos de cada misión. Conserva los IDs y contadores reales: no usa un renombrado para esconder diferencias.

En esas historias se procesaron **629 misiones ocultas después de la gracia actual de 60 segundos**, conservando llegada y desempate originales. Hay además 16 historias con información permanentemente ausente: las misiones permanecen pendientes, sin atribuirles un resultado final ni cancelarlas por tiempo.

Esto demuestra que los casos implementados pueden resolverse de forma diferida sin congelar absolutamente toda la actividad. **No demuestra todavía una frontera local completa para todas las operaciones del juego, una solución criptográfica ni un planificador viable en gas.**

## Artefactos y reproducción

```bash
pnpm --filter @vendetta/rules exec tsx scripts/experiments/run-resource-frontier.ts
pnpm --filter @vendetta/rules test
```

- [Resultados y hashes](results.json): resumen, parámetros por historia, evidencia de prueba y digests de ambos estados finales.
- [Historia completa de ejemplo](example-history.json): acciones, aceptaciones/rechazos, disponibilidad de revelaciones y ejecuciones con hora original y hora física.
- [Planificador](historical-source/resource-frontier.ts).
- [Preparación legal y generador](historical-source/frontier-histories.ts).
- [Runner](historical-source/run-resource-frontier.ts).
- [Tests](historical-source/resource-frontier.test.ts).

No hay llamadas externas ni medidas de una red real. El runner registra la versión de Node y hashes de las fuentes del motor, el experimento, los datos generados utilizados y el lockfile. Comparar los estados se hace primero por su representación canónica completa; los hashes guardados son una ayuda para inspeccionar, no sustituyen la igualdad que se comprueba.

## Política de identidad elegida para esta fase

Se conserva la asignación actual: una ocupación consume `nextBuilding` al ejecutarse y un retorno consume `seq` al generarse. No se cambia B-07 ni se asignan claves alternativas.

Para que una acción posterior no robe una asignación lógica a un evento anterior pendiente, los asignadores son recursos compartidos:

- Una llegada que puede generar retorno protege `allocator:seq`.
- Una misión oculta con tropa de ocupación suficiente protege también `allocator:building`, porque podría crear un edificio. No se usa su tipo oculto real para decidirlo.
- Un STATION conocido que rebota también genera un retorno. El tipo por sí solo no basta para excluir el asignador de su ámbito.
- Un retorno ya creado no vuelve a asignar secuencia: puede avanzar de forma independiente si sus otros recursos no chocan con una llegada anterior.

Esta política evita una decisión de reglas prematura y permite comparación literal con el oráculo. Su coste es que una construcción o entrenamiento lejano que cree un elemento de cola puede esperar por `seq`, y un registro lejano puede esperar por una posible ocupación. Es una **base de corrección conservadora**, no la arquitectura de disponibilidad recomendada para producción.

## Qué hace el planificador

1. Cada misión pendiente tiene un conjunto de lecturas, escrituras y, si sigue oculta, una región espacial basada únicamente en sus datos públicos.
2. Se recorren las llegadas vencidas en su orden original. Una llegada desconocida o dependiente queda pendiente; una conocida e independiente puede ejecutarse.
3. Se declara conflicto si una escritura anterior se cruza con una lectura/escritura posterior, o una escritura posterior altera algo que debía leer el evento anterior. Se incluyen lecturas de coordenadas vacías.
4. Una misión conocida que queda bloqueada conserva también sus recursos: un transporte pendiente propaga la frontera al destino y, si es pago, a su contrato de mercado. Un retorno espera a su padre.
5. Se recalculan los ámbitos después de cada ejecución y cada descendiente creado. No se usa un snapshot fijo de propietarios tomado al enviar.
6. Antes de una acción se comprueba su ámbito contra los eventos anteriores que todavía no pudieron finalizar. Un rechazo identifica misión y primer recurso en conflicto. Si puede avanzar, la acción pasa por las validaciones y rollback del simulador real.
7. Las revelaciones se validan por una ruta separada. No necesitan drenar primero la misión que están desbloqueando y no cambian su llegada ni su secuencia.

Las comprobaciones de recursos son deliberadamente amplias: por ejemplo, se agrupan campos por jugador y por guerra, sin optimizar todavía sumas conmutativas ni cambios de rango. Una operación puede quedar bloqueada aunque un análisis más fino demostrara que era segura.

El reloj externo solo avanza. Resolver una misión con su tiempo original no consiste en mover hacia atrás el reloj del planificador: el motor recibe el instante histórico para liquidar el estado que la frontera protegió.

`advance` se trata como trabajo de progreso independiente de la acción posterior. Si esa acción revierte, no deshace los avances que el prototipo ya ejecutó como paso separado. Esto es realizable mediante llamadas de avance independientes, pero **no reproduce el coste ni la atomicidad del modificador `drained` actual dentro de una única transacción**.

## Revelación y límites criptográficos

El prototipo recibe `(tipo, destino, salt)` cuando el harness indica que esa información está disponible. Reutiliza las comprobaciones estáticas de `sim.reveal` en una copia de validación antes de la llegada; así evita mezclar la validez del mensaje con la caducidad, aparcado y reasignación actuales. Después aplica únicamente el tipo/destino comprobados al evento original.

Una evidencia incorrecta no cambia el mundo; las duplicadas son inocuas. El planificador no tiene acceso a la tabla futura de evidencias para calcular ámbitos de misiones desconocidas; hay un test que cambia el tipo/destino ocultos sin cambiar el ámbito.

**Esta entrada no verifica ciphertexts ni firmas de drand.** Supone que alguien consigue aportar el mensaje válido. No excluye envíos basura y no demuestra que todos los envíos aceptados puedan abrirse. La investigación de validez previa o invalidez posterior demostrada sigue siendo necesaria para evitar bloqueo deliberado con datos irrecuperables. La ausencia de información nunca se usa aquí como prueba de basura.

## Oráculo y comparación

Se parte de una misma preparación y mismos envíos. El oráculo recibe sus mensajes desde el principio y resuelve siempre todas las misiones por llegada y secuencia originales. El planificador local los recibe con latencia.

Solo las acciones que la frontera acepta o evalúa como reverts de reglas se ejecutan en el oráculo, en sus timestamps originales. Las acciones rechazadas por frontera no forman parte del historial confirmado. **No se compara contra un mundo que hubiera aceptado también esas acciones rechazadas**; ese mundo puede ser incompatible con conservar un ataque anterior.

Se comprueban:

- Resultado y error de cada acción que llega a las validaciones del juego.
- Estado final completo: entidades, mapas, recursos, colas, misiones, contadores y secuencias, sin omitir IDs.
- Comprobantes por fase de cada misión: llegada, secuencia, resultado de la misión, edificio afectado, investigación/puntos/misiones de los participantes y guerras modificadas. Se excluye únicamente el tiempo físico de procesamiento al comparar esos comprobantes.

Los comprobantes son proyecciones semánticas del experimento, **no el ABI completo del evento `Battle` de Solidity**. No se ha probado todavía igualdad de todos los logs de contratos ni replay del nuevo planificador en EVM.

Al final se liquidan los edificios al mismo instante, con la cola de misiones ya recuperada. Esto evita confundir diferente materialización perezosa de stock con una diferencia económica final. En las historias permanentemente bloqueadas no se fuerza esa liquidación ni se declara igualdad final: los indicadores son `null`.

## Preparación, operaciones y cobertura

Se usan 64 semillas × cuatro latencias nominales (0, 20, 300 y 7.200 s, más 0–16 s de variación) × dos preparaciones, con y sin tropa de ocupación. Otras ocho semillas por preparación retiran permanentemente toda evidencia.

La preparación construye, investiga y entrena mediante acciones reales desde `newWorld` y `register`. También crea familias, membresía, guerra y dos contratos de mercado mediante sus APIs. No siembra directamente niveles, edificios, tropas, puntos ni misiones. Hay cuatro jugadores: dos cercanos y dos lejanos. Se usa premium autorizado mediante la API para preparar las colas; no se mide su monetización.

Las misiones iniciales incluyen dos ataques ocultos, una ocupación oculta en la variante correspondiente y un pago público de mercado que puede quedar bloqueado detrás de los ataques. Investigación y entrenamiento se inician justo antes de la primera llegada para poder finalizar durante la espera. Después del plazo de mercado se crean condiciones de capacidad para probar retiros efectivos, no únicamente reverts.

El generador intenta estas 15 operaciones: `poke`, registro, construcción, investigación, entrenamiento, cancelación de cada una de las tres colas, envío público, recall, abandono, aceptación/retiro de mercado, disolución de familia y cambio de rango. Todas las aceptaciones pasan por las APIs reales; también se incluyen intentos inválidos para comprobar errores y rollback. No todas las acciones ofrecidas son válidas ni se ejecutan todas.

Hay pruebas dirigidas adicionales de:

- Revelación 7.200 s tarde sin cambio de llegada/seq, evidencia incorrecta y duplicados.
- Dependencias de coordenadas vacías y asignación de edificios.
- Publicación fuera de orden de dos ataques que llegan en el mismo segundo.
- Un capo lejano bloqueado por el estado de la familia.
- Propagación de un transporte público hacia un destino antes independiente.
- Recall legítimo antes de llegar y bloqueo de recall posterior que evitaría el ataque.
- Investigación independiente completada y retorno independiente ejecutado mientras otra misión sigue oculta.
- STATION a destino ajeno que rebota y consume una secuencia de retorno.
- Rechazo de tiempo externo decreciente.

No están incorporadas todas las operaciones de la especificación: faltan, entre otras, vacaciones, sesiones/controladores, sanciones, premium durante el historial, apertura/cancelación de ofertas, entrada/salida/expulsión de familias, declaraciones/paz durante la espera y upgrades. No se deben habilitar esas rutas en producción sobre este prototipo. Las operaciones fuera de la unión explícita de acciones no tienen una vía genérica que se ejecute sin guardia.

## Conteos observados

| Resultado | Cantidad |
| --- | ---: |
| Historias finitas con estado y comprobantes iguales al oráculo | 512 / 512 |
| Historias con un pago de mercado aplicado correctamente | 512 / 512 |
| Historias de indisponibilidad permanente, sin conclusión final ficticia | 16 |
| Intentos de acciones en las historias finitas | 23.808 |
| Acciones aceptadas | 8.767 |
| Reverts de las reglas del juego | 7.076 |
| Rechazos por frontera | 7.965 |
| Rechazos cuyo primer motivo fue un asignador global | 1.870 |
| Misiones ocultas procesadas después de la gracia actual | 629 |

De los rechazos por frontera, 1.870/7.965 (aproximadamente 23,5 %) se identifican primero como conflictos de asignador. **No es el porcentaje de bloqueos que desaparecería al cambiar IDs**: puede haber otros conflictos ocultos detrás del primero. Tampoco son porcentajes de tiempo ni una previsión de tráfico real. Este generador concentra intentos cerca de llegadas y averías y tiene solo cuatro jugadores; no sustituye la simulación de disponibilidad anterior.

## Qué permite decidir y cómo continuar

1. **La conservación temporal funciona en los casos cubiertos.** Ya no dependemos solo de fixtures maduras y contraejemplos aislados: hay preparación legal, acciones con errores contrastados y recuperación completa comparada con el oráculo.
2. **No hace falta cambiar inmediatamente IDs para tener un modelo correcto.** Los asignadores compartidos permiten una base conservadora; la contrapartida de disponibilidad queda explícita y medible.
3. **Mantener esa base como referencia; investigar aparte claves de identidad/orden independientes del orden físico.** Antes de adoptar una alternativa hay que demostrar que conserva desempates relevantes y referencias públicas, no limitarse a quitar el lock global.
4. **Completar las rutas pendientes y el replay en Solidity antes de un port on-chain.** El planificador actual recorre mapas y reintenta pasos sin presupuesto de gas: hace falta diseñar índices y cursores acotados, además de comprobar paridad.
5. **Resolver la validación criptográfica del envío.** Este trabajo elimina la caducidad en el modelo y preserva resultados; todavía no resuelve distinguir basura de una revelación que llegará tarde.

Validación de esta fase: typecheck, formato y suite de `@vendetta/rules`, con 752 pruebas en 10 archivos, incluidas las 24 pruebas nuevas del planificador. El runner falla ante cualquier discrepancia y conserva datos y hashes para revisión.
