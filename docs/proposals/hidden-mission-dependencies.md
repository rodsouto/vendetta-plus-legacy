# Frontera acotada: dependencias reales de las misiones

Fecha: 2026-10-28. Investigación posterior a la [propuesta](hidden-mission-resolution.md) y la [simulación de disponibilidad](../benchmarks/hidden-barriers/README.md). No modifica contratos, reglas ni el motor de producción.

Seguimiento: ya se construyó un [planificador de referencia conservador](../benchmarks/resource-frontier/README.md) que mantiene los IDs y secuencias actuales, bloqueando sus asignadores cuando hay incertidumbre anterior. Sus 512 historias finitas coinciden con el oráculo; todavía no completa todas las rutas ni demuestra viabilidad on-chain. El catálogo de riesgos siguiente sigue aplicando y explica el coste de esa elección.

## Conclusión

Una frontera acotada es una línea de diseño posible, pero **no puede definirse únicamente por distancia ni por la cuenta que firma la acción**. Debe seguir recursos del juego y el tiempo hasta el que cada uno puede avanzar: coordenadas, edificios, estado del jugador, membresías, ciclo de las guerras y contratos de mercado.

No hace falta congelar automáticamente todos los edificios de una familia o a todos los participantes del mercado. Hay conflictos concretos y también operaciones que pueden conmutar. La frontera debe comprobar los efectos y las lecturas de cada operación, incluidas las liquidaciones implícitas de colas.

Hay además un asunto previo a programar un planificador local: **los IDs y las secuencias se asignan hoy durante la ejecución**. Cambiar el orden físico puede cambiar IDs y valores de `seq`, incluso entre zonas separadas. El requisito original exige conservar el resultado del ataque; nuestra propuesta añadió un criterio más fuerte de igualdad del estado final. Hay que decidir cómo se definen identidad y desempates para satisfacer ambos, sin confundir una diferencia de numeración con una diferencia ya demostrada de combate.

Por tanto, no recomiendo trasladar todavía los porcentajes del modelo `owners` a una garantía de producto ni empezar por modificar el heap de Solidity. El paso técnico siguiente es un modelo de referencia con recursos y orden explícitos, después de definir la política de IDs y desempates.

## Evidencia y reproducción

Se revisaron las rutas Solidity y sus equivalentes TS:

- [Missions.sol](../../contracts/src/core/Missions.sol), [Battle.sol](../../contracts/src/core/Battle.sol) y [Settlement.sol](../../contracts/src/core/Settlement.sol).
- [Access.sol](../../contracts/src/core/Access.sol), [Core.sol](../../contracts/src/core/Core.sol) y [Training.sol](../../contracts/src/core/Training.sol).
- [Families.sol](../../contracts/src/core/Families.sol), [Market.sol](../../contracts/src/core/Market.sol), [Account.sol](../../contracts/src/core/Account.sol) y [GameStorage.sol](../../contracts/src/core/GameStorage.sol).
- `packages/rules/src/sim/{missions,settle,common,actions,families,market}.ts` y B-06/B-07/B-11/B-22/B-31 de la especificación vigente.

También se ejecutaron **12 pruebas de planificación contrafactual con el simulador real**: nueve conflictos y tres controles de conmutación sobre proyecciones indicadas.

```bash
pnpm --filter @vendetta/rules exec tsx scripts/experiments/run-dependency-probes.ts
pnpm --filter @vendetta/rules test
```

[Resultados completos y hashes](../benchmarks/hidden-dependencies/results.json), [fixtures y experimentos](../../packages/rules/scripts/experiments/dependency-probes.ts), [runner](../../packages/rules/scripts/experiments/run-dependency-probes.ts) y [tests](../../packages/rules/test/dependency-probes.test.ts).

Las fixtures registran jugadores mediante la API y siembran estado maduro, tropas, colas y misiones ya enviadas. **No demuestran la alcanzabilidad de cada fixture mediante una partida completa.** El harness retira temporalmente eventos de la cola para comparar dos órdenes: misión a su hora antes de una acción posterior, o esa acción adelantada antes de resolver la misma misión con su hora original. Esto evita el drain únicamente en el experimento. **No es una vulnerabilidad de la API actual ni una implementación de la nueva frontera**: la cola pública actual impide saltarse eventos públicos, y las ocultas actuales se reprograman al revelar.

Las pruebas TS se apoyan en funciones del motor y las lecturas Solidity se contrastaron en código. No se añadieron nuevos escenarios diferenciales ni fixtures equivalentes en Foundry; las pruebas no constituyen una demostración de corrección general ni de coste en gas.

## Contraejemplos observados

| Prueba | Orden cronológico | Acción adelantada | Qué obliga a proteger |
| --- | --- | --- | --- |
| Investigación en otro edificio | Sobreviven 68 unidades del atacante | Sobreviven 74 | Investigación del remitente y su edificio de investigación, aunque esté fuera del disco |
| `poke` del destino con entrenamiento posterior | Atacante conserva 100; después aparecen 200 defensores | Atacante eliminado; quedan 137 defensores | El tiempo de liquidación de colas, incluso en llamadas permissionless |
| Un capo externo disuelve la familia | Se registran 58.800 centipuntos perdidos por cada bando | Se registran cero | Membresía y estado vivo de familia/guerra, sin depender de dónde esté el capo |
| Comprador externo acepta una oferta | `CannotAfford`; botín 5.000 de cada recurso | Aceptación válida; botín 2.000/6.000/6.000/6.000 | Edificio del vendedor, depósito y contrato; la cuenta del comprador no delimita el acceso |
| Registro en una casilla vacía del disco | El ataque rebota, sin botín | Encuentra el nuevo edificio y obtiene botín | Coordenadas vacías y propietarios que todavía no existen en el snapshot |
| Pago anterior al cierre frente a retiro posterior | Retiro de depósito del vendedor rechazado | Se permite retirar antes de aplicar el pago que ya debía contar | Contrato de mercado y su frontera temporal, además del edificio de destino |
| Registro fuera del disco frente a ocupación dentro | Edificio ocupado ID 5; registrado ID 6 | IDs 6 y 5 respectivamente | Asignación de identidad global o una política que evite depender del orden físico |
| Ocupación externa del mismo atacante | El combate observa honor 100 % con cuatro edificios | Observa 99 % con cinco edificios | Número de edificios del jugador, no solo investigación y tropas |
| Cola de construcción ajena frente a creación del retorno | Retorno `seq=1`, cola `seq=2` | Retorno `seq=2`, cola `seq=1` | Definición de creación/desempate y diferencia entre identidad exacta y equivalencia semántica |

En el último caso se ha demostrado cambio de números y de su relación, **no un resultado de combate diferente por esa sola inversión**. La frontera puede conservar los órdenes relevantes sin necesitar valores numéricos idénticos, pero eso requiere especificar y probar la equivalencia. No se infiere que todos los recursos deban bloquearse globalmente solo porque exista `seq`.

Los controles positivos observados son:

- `poke` en un edificio de un tercero sin dependencias de la misión: coinciden jugadores, edificios, misiones y secuencia en la proyección comparada.
- Cambiar únicamente el rango de un miembro de la familia, sin alterar membresía ni ciclo de guerra: coinciden supervivientes y pérdidas de guerra.
- Sumar dos conjuntos de pérdidas mediante `warScore`, con familias y guerra estables: los totales coinciden en ambos órdenes. Solo prueba esa suma sobre ese estado; no autoriza reordenar todos los combates ni todas las operaciones familiares.

## Regla para decidir un conflicto

Para un evento anterior E y una operación posterior A, definir lecturas `R` y escrituras `W`. Hay conflicto conservador si:

```text
W(E) ∩ (R(A) ∪ W(A)) ≠ ∅
o bien
R(E) ∩ W(A) ≠ ∅
```

También son lecturas consultar que una casilla está vacía, que una guerra no existe o que una cola está vacía. Proteger solo las entradas existentes omite esas dependencias negativas.

Dos lecturas pueden coexistir. Dos escrituras compartidas no deben darse por compatibles salvo prueba específica: una suma de pérdidas puede ser conmutativa bajo hipótesis, pero descontar y acreditar stock no lo es en general por los topes, el botín y las comprobaciones de saldo.

La frontera se expresa por **clave temporal de evento**, no solo por segundo: los empates de entrenamiento, investigación, movimientos y vacaciones usan `seq`. Que dos operaciones terminen en el mismo segundo no permite escoger libremente su orden.

## Recursos que necesita el modelo

| Recurso | Campos o relaciones relevantes | Por qué no basta con un lock del edificio objetivo |
| --- | --- | --- |
| `C(coordenada)` | `buildingAt`, ausencia, alta, baja y nueva ocupación | Un ataque puede rebotar en vacío; un transporte perder carga; una ocupación puede ganar o perder la casilla |
| `B(edificio)` | Propietario, stock, niveles, tropas, colas, `lastUpdate`, `lastTroopArrival` | Producción, capacidad, protección, entrenamiento y devoluciones alteran combate y botín |
| `P(jugador)` | Investigación, su cola y edificio, número de edificios, misiones activas, vacaciones, puntos | Combate, honor, nuevas salidas y aceptación de vacaciones dependen de estado común a varios edificios |
| `Membership(jugador)` | Familia efectiva; no confundir rango con pertenencia | Las bajas se asignan según la pertenencia al resolver, no al enviar |
| `FamilyLifecycle(familia)` | `alive` | Una disolución externa elimina la familia efectiva y termina guerras de forma perezosa |
| `WarPair(familiaA,familiaB)` | Existencia y puntero `activeWar` | Declarar, cerrar o reemplazar una guerra cambia dónde se contabilizan pérdidas, incluso si antes no había guerra |
| `WarLifecycle(guerra)` | `ended`, participantes y resultado | Aceptar paz o disolver no debe adelantarse a bajas anteriores |
| `WarLosses(guerra)` | `lostA`, `lostB` | Sumas potencialmente conmutativas si el ciclo y pertenencias permanecen estables; requieren prueba y límites aritméticos |
| `Trade(contrato)` | Aceptación, plazo, pagos, depósitos, retiros y partes | Un pago atrasado puede cambiar derechos que alguien ya consumió tras el cierre |
| Índices/listas | Ofertas y compras de un jugador; pertenencias; ocupación del mapa | Hay validaciones que recorren listas y leen varios contratos, no solo el indicado por la llamada |
| Identidad/orden | `nextBuilding`, `seq`, reservas de descendientes | Una ocupación o retorno asigna claves durante la ejecución diferida |

Este catálogo identifica dependencias verificadas. No es aún una especificación exhaustiva de instrumentación a nivel de storage ni demuestra un conjunto mínimo de locks.

## Cómo construir el ámbito de una misión todavía oculta

1. **Preservar todas las coordenadas candidatas del `cover` a la hora de llegada**, incluidas las vacías. El tipo tampoco es público hoy: el ámbito debe cubrir la unión de ATTACK, STATION, TRANSPORT y OCCUPY que acepte la prueba o revelación. No se puede asumir «solo ataques» sin cambiar esa interfaz o demostrar públicamente una clase más restringida.
2. Incluir los edificios candidatos, su estado local y los jugadores potencialmente afectados; el remitente es conocido. Proteger investigación y número de edificios de esos jugadores, y sus liquidaciones implícitas. Un recurso grueso por jugador es una primera aproximación conservadora, no necesariamente la optimización final.
3. Proteger membresías y ciclos de las familias potenciales del atacante y defensores, y los pares de guerra relevantes, incluso los inexistentes. Esto bloquea operaciones externas que los modifiquen, **sin añadir automáticamente todos los edificios de todos los miembros** al conjunto.
4. Incorporar los recursos de una misión pública posterior que deba esperar a la anterior: si es pago, su contrato; si es retorno, el origen y las tropas/carga que todavía no se conocen; si es ocupación, la casilla y el honor del dueño. Son aristas causales con su propia hora de vencimiento.
5. Repetir al encontrar eventos ya programados que conectan recursos, hasta fijar qué puede finalizar cada dominio. Una acción rechazada no se ejecuta parcialmente ni crea por sí misma una propagación permanente al resto de sus participantes.
6. Cuando llegue la revelación o una prueba de invalidez válida, reducir incertidumbre y procesar los eventos ejecutables. No reducir el ámbito basándose en datos del remitente que aún no estén autenticados.

El estado de propietarios debe corresponder al instante anterior a la frontera. Una instantánea al enviar no basta si hubo ocupaciones o abandonos legítimos durante el viaje. Consultar sin más un estado que ya avanzó más allá de la llegada tampoco reconstruye esa historia.

Una implementación no tiene por qué enumerar todas las casillas vacías ni todo el mapa en cada llamada. Puede investigar índices espaciales y comprobaciones de intersección, pero deben cubrir la distancia redondeada real, membresía de propietarios e inserciones/bajas. **No se ha diseñado todavía un algoritmo de índice on-chain con coste acotado**; el radio puede abarcar una gran parte del mapa y los datos adversarios importan.

## Investigación y liquidación perezosa

`Access.settleForAction` liquida el edificio solicitado y también el de investigación del jugador. `Battle.attack` liquida investigación de ambos participantes antes de leer estadísticas. `Settlement.settleBefore` procesa eventos hasta la llegada y respeta desempates, pero **no deshace** investigación, entrenamiento o stock previamente avanzados.

Por tanto:

- No permitir que `poke`, construcción, entrenamiento o envíos liquiden investigación afectada hasta un momento posterior a una misión pendiente.
- No basta con prohibir empezar nuevas investigaciones: una cola ya existente puede completarse por una acción aparentemente ajena.
- La liquidación del edificio de investigación puede pagar y arrancar la siguiente investigación con el stock de ese edificio. Esa dependencia también es económica, no solo un nivel que pudiera calcularse sin historia.
- Completar construcciones cambia producción, tiempos de otras colas y protección/capacidad. Proteger únicamente la variable `troops` tampoco sirve.
- Puede haber acciones de un mismo jugador que se permitan con locks más finos; primero hay que declarar todo lo que liquidan y leen. El código actual comparte liquidaciones amplias.

## Familias: qué debe esperar y qué no obliga a congelar todo

El combate usa familia efectiva actual y guerra activa para sumar pérdidas; no usa rango, aplicaciones ni totales de guerra para calcular daño. Tampoco hay una condición de victoria automática por alcanzar un contador de pérdidas en la ruta revisada: paz y disolución tienen sus propias reglas.

Conflictos que deben respetar la frontera:

- Entrada/salida/expulsión del atacante o de un defensor candidato.
- Disolución de cualquiera de sus familias, aunque la orden la firme un capo lejano.
- Declaración o cierre de guerra del par relevante; proteger la ausencia de guerra también importa.
- Lecturas finalizadas de totales/resultados deben indicar si todavía faltan pérdidas anteriores.

No se deduce de ello que un miembro lejano deba dejar de construir o entrenar por pertenecer a la misma familia. Dos combates de otros jugadores pueden compartir solo sumas de pérdidas con ciclo estable. La optimización requiere separar esos campos de los que no conmutan y conservar orden relevante, límites aritméticos, reportes y eventos. Los tres controles positivos no son una autorización general para saltarse el planificador.

## Mercado: quién firma no es el perímetro

`Market.accept` lee y liquida el edificio del vendedor y el depósito del comprador, descuenta bienes y depósitos y fija bloqueos de vacaciones para ambos. Un comprador exterior puede iniciar esa operación, pero no debe pasar por delante de un ataque anterior que debía afectar esos bienes.

`withdraw` lee el contrato y acredita un edificio elegido por la parte. `offer`/`accept` además ejecutan `_gate`, que poda listas y consulta otros contratos de ofertas/compras del actor. Una guardia que examine únicamente `tradeId` y `msg.sender` deja fuera lecturas relevantes.

**Distinción importante:** `sendHidden` no acepta `tradeId`; la misión oculta lleva `trade=0`. No puede alterar directamente `paid` como pago de mercado. Esa dependencia aparece mediante una misión pública de pago que comparte recursos con la llegada bloqueada y debe esperar también. El contraejemplo del retiro usa precisamente una misión pública con `tradeId`, no una capacidad inexistente de la misión oculta.

El plazo `closesAt` no demuestra que se hayan aplicado los pagos anteriores al cierre. El contrato no debe permitir consumir repartos finales mientras falte procesar uno de esos pagos. No es necesario congelar todos los mercados: se preservan el contrato afectado, sus lecturas y los edificios que las operaciones realmente toquen.

No se encontraron transferencias ERC-20 externas en estas rutas de mercado: se mueven recursos internos del juego. La advertencia genérica sobre rollback de transferencias externas en la propuesta sigue siendo un riesgo de arquitecturas futuras, no una descripción de lo que hace hoy `Market.sol`.

## Ocupación, registro y vacío

Las misiones consultan `buildingAt` al resolver. ATTACK puede rebotar, TRANSPORT perder carga y OCCUPY crear un edificio dependiendo de si existe algo en esa coordenada. La frontera debe incluir la ausencia de edificio; no basta con congelar los IDs existentes al construir el disco.

Una nueva ocupación también cambia `P.buildings` y por tanto honor, incluso si queda muy lejos del combate. El abandono modifica esa cuenta, borra casillas/edificios y puede cancelar investigación. Un registro exterior no cambia el honor de otro jugador, pero comparte el asignador de IDs con la ocupación.

No hay conquista del edificio existente por ATTACK en la ruta actual: cambia tropas y recursos, no la propiedad. Los cambios de mapa relevantes proceden de registro, ocupación y abandono; transferir control de una cuenta mantiene el mismo jugador dueño.

## IDs, descendientes y definición del oráculo

`newBuilding` asigna el siguiente ID; `_sendBack` asigna una secuencia nueva al retorno cuando se resuelve la ida. Ocupar puede consumir toda la tropa y no generar retorno. Por tanto, reservar un único hueco incondicional en la cola para cada misión no reproduce automáticamente las asignaciones actuales.

Hay que elegir y especificar una de estas vías antes de exigir igualdad exacta con el oráculo:

1. **Conservar asignación actual:** no adelantar consumidores de un asignador que pueda necesitar un evento anterior desconocido. Es conservador, pero puede volver globales muchos bloqueos de creación aunque las tropas y las coordenadas no se crucen.
2. **Identidad y orden independientes de ejecución física:** reservar identidades o derivarlas de eventos/relaciones causales, con una definición nueva y explícita para descendientes y empates. Hay que medir reservas desperdiciadas, ABI y cambios de B-07; no es un parche del heap.
3. **Equivalencia semántica con renombrado:** si solo cambian IDs internos, comparar mundos bajo una correspondencia de identidades. Exige tratar correctamente referencias y observabilidad externa; no se puede renombrar libremente un ID que ya consume el cliente, un contrato de mercado o una llamada posterior.

El contraejemplo de `seq` no demuestra por sí solo que la opción 2 sea imposible ni que toda diferencia numérica cambie una batalla. Sí demuestra que el oráculo anterior de igualdad literal y el modelo sintético de IDs fijos omitían este problema. Mantener la regla semántica de empates relevantes puede ser suficiente para el objetivo del usuario, pero debe probarse, no suponerse.

## Guardia de operaciones propuesta para investigar

| Operación | Comprobaciones de frontera necesarias |
| --- | --- |
| `poke`, colas y cancelaciones | Edificio, jugador e investigación liquidada; permitir lectura/proyección sin persistencia no equivale a permitir `poke` |
| Envío público/oculto | Origen, estado del jugador, investigación, validaciones del destino/cover y contrato de pago si existe; registrar los eventos futuros y descendientes |
| Misión vencida conocida | Sus recursos por tipo, orden de eventos previos, padres y posibles escrituras de retorno/ocupación |
| `recall` | Propietario, misión y orden temporal; después de su llegada original no debe borrar el combate pendiente |
| Registro, ocupación, abandono | Coordenada incluso vacía, propietario, número de edificios/honor, investigación si procede e identidad de nuevas entidades |
| Miembros/familia/guerra | Jugadores objetivo, ciclo de familia, par de guerra y ciclo de guerra; no solo la cuenta que firma |
| Mercado | Contrato, ambas partes según ruta, edificios tocados y contratos leídos al podar/validar listas |
| Vacaciones | Misiones activas, historia de vacaciones y bloqueos comerciales relevantes; no sobrescribir datos que necesite una llegada anterior |
| Revelación / prueba de invalidez | Recepción de información autenticada sin drenar efectos anteriores; la espera no debe impedir desbloquearla |
| Revocación de sesiones, cancelación de transferencia/remoción/invitación | Mantener rutas protectoras disponibles: no alteran tropas ni reescriben los propietarios de jugador de misiones; revisar autorización aparte de finalización del juego |
| Premium/suspensiones/roles/upgrade | Premium y suspensión no cambian directamente estadísticas del combate, pero sí habilitan acciones; upgrades cambian la interpretación de datos y necesitan política compatible con misiones pendientes |

La guardia debe ejecutarse antes de toda escritura y liquidación; una acción que falle queda revertida completamente. No aceptar media operación ni devolver errores que permitan mutaciones parciales.

## Qué queda sin demostrar y siguiente experimento

1. Definir identidad y desempates para comparar un planificador local con un oráculo cronológico sin cambiar resultados de ataques.
2. Escribir en un modelo de referencia, fuera de producción, los recursos de cada operación y las guardias temporales, con estrategia conservadora donde falte una prueba de conmutación.
3. Generar historias legales pequeñas mediante acciones reales, introducir latencias y comparar con el oráculo: casos de los 12 probes, membresías y paz, comercio y ventanas, registros/ocupaciones/abandonos y descendientes con empate.
4. Ampliar esa comparación a fuzzing y después a replay TS/Solidity; solo entonces valorar una estructura on-chain y medir gas/índices.
5. Repetir el experimento de disponibilidad con esas dependencias implementadas. Los porcentajes anteriores no incluyen todas ellas y no deben corregirse a mano con un supuesto multiplicador.

No se ha demostrado todavía una clausura local completa, un planificador on-chain con coste acotado ni su viabilidad criptográfica. Sí se han identificado dependencias y contraejemplos concretos que cualquier implementación correcta tiene que cubrir, y algunas oportunidades para evitar un bloqueo global innecesario.

## Validación realizada

Los 12 probes produjeron los nueve conflictos y tres controles previstos. El runner guarda ambas ejecuciones, la proyección comparada y hashes de las fuentes seleccionadas para poder auditar los ejemplos. La suite de `@vendetta/rules` pasó typecheck y **728 pruebas en 9 archivos**, incluidas 14 comprobaciones de esta investigación. No se modificaron archivos generados ni código de producción.
