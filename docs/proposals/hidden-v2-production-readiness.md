# Hidden v2: preparación de producción (hito 6)

Estado al 5 de noviembre de 2026: en preparación, bloqueado para lanzamiento.
Las etapas 1–5 permanecen cerradas según el
[candidato local](../benchmarks/timelock-opening/game-producer/local-candidate/README.md).
Este documento concreta las evidencias que faltan; no certifica seguridad ni
sustituye la auditoría independiente. No se han generado claves ni desplegado
contratos en redes reales en esta continuación.

## Procedencia del setup

La ruta original de generación de claves del juego es `--unsafe-local-setup-v2`, en
`apps/web/scripts/experiments/opening-zk/producer_backend.go`. Genera los dos
setups locales y escribe `unsafeLocalSetup: true`. Los hashes de artefactos y
la coincidencia del runtime verifican integridad y correspondencia; no prueban
que se haya eliminado el secreto del setup.

La revisión encontró que `scripts/prover/setup.ts` aceptaba el valor `false`
como declaración suficiente de seguridad. Ahora se rechaza explícitamente.
El opt-in local sólo permite el valor `true` en 1337/31337. No existe una ruta
de producción soportada hasta implementar y revisar su procedencia.
El servicio no controla despliegues directos. Ahora `Deploy.s.sol` rechaza toda
red salvo 1337/31337 antes de consultar el entorno, y `deploy:gnosis` aborta
antes de leer secretos o contactar RPC, incluso con `--yes`. Sustituir estas
barreras por verificación de artefactos aprobados requiere implementación y
revisión; ningún flag del operador demuestra procedencia. Los archivos PK/VK
por sí solos tampoco demuestran posesión del secreto tóxico.

Antes de habilitar otra procedencia se requiere:

1. Congelar fuentes de ambos circuitos, dependencias y toolchain, con digest de
   las restricciones compiladas, número/orden de inputs públicos y procedimiento
   reproducible. Una modificación de restricciones obliga a revisar el setup.
2. Elegir y revisar un procedimiento de setup compatible con el backend real.
   Documentar participantes independientes, supuestos de confianza, contribuciones,
   verificación del transcript y tratamiento de secretos. No cambiar el boolean
   de los manifiestos existentes para simular una ceremonia.
3. Implementar importación/verificación de los artefactos finales y una política
   de aprobación fuera del manifiesto aportado por el operador. Probar rechazo
   de transcript, circuito, claves y aprobación sustituidos o incompletos.
4. Vincular CS/PK/VK, Verifier.sol, compilador/opciones, runtime, wrappers y
   direcciones por red en un registro revisado. Repetir pruebas reales de ambos
   circuitos, consumo EVM/H3 y equivalencia de World con esos artefactos finales.

## Paquete para auditoría independiente

Entregar una revisión inmutable del árbol completo y el manifest de fuentes,
no sólo HEAD mientras existan archivos pendientes. El manifest actual describe
el trabajo local; no representa una aprobación externa. Conservar informes,
hallazgos, correcciones y retests vinculados a la revisión final.

| Frontera            | Fuentes principales                                                                                               | Propiedad que revisar                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relación ZK         | `opening-zk/mission_v2*.go`, `invalid_point_v2*.go`, `beacon.go`, `point_encoding*.go` y dependencias transitivas | Autenticación de ronda, encoding canónico, validez de punto, compromiso, dominio/contexto e inputs públicos; ausencia de witnesses inválidos aceptables |
| Verificación EVM/H3 | `contracts/src/hidden/`, verificadores generados finales                                                          | Binding de inputs y verificador, límites y completitud de H3, certificados cruzados, inmutabilidad y bytecode                                           |
| Estado y orden      | `contracts/src/core/Hidden*.sol`, `Missions.sol`, `packages/rules/src/sim/hidden-*.ts`, `missions.ts`             | Una misión sólo se descarta con evidencia; orden histórico y frontera global; equivalencia TS/Solidity                                                  |
| Productor           | `apps/web/scripts/prover/`, `opening-zk/producer_*.go`                                                            | Procedencia de claves, derivación de contexto, caché, workers, autenticación/cuotas y fallos reintentables                                              |
| Keeper e índice     | `apps/web/scripts/keeper/`, `keeper.ts`, `src/chain/certificates.ts`                                              | Persistencia antes de envío, exclusión operativa, reorg, nonce bloqueado y rotación sin pérdida de estado                                               |
| Génesis y operación | `contracts/script/Deploy.s.sol`, `scripts/deploy-gnosis.sh`, configuración de operador                            | Consumidores aprobados, roles, configuración por red y recuperación                                                                                     |

Las rutas `opening-zk/` son relativas a
`apps/web/scripts/experiments/`; las de `src/chain/`, a `apps/web/`.
Los benchmarks criptográficos y los tests con consumidores mock tienen alcances
distintos: entregar ambos con sus límites. No presentar esta revisión interna
como auditoría independiente.

## Evidencia operativa pendiente

| Área              | Evidencia exigida antes de lanzamiento                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacidad y coste | Hardware dedicado, mezcla de ambos circuitos y llegadas representativas; latencia de cola/certificación, RSS/CPU/disco, cargas frías, gas total H3/certificado y presupuesto de operador |
| Disponibilidad    | Rondas nuevas y dependencias remotas reales; umbrales de alerta, respuesta ante cola creciente y restauración después de caída                                                           |
| Supervisión       | Servicio externo que limite recursos y termine todos los hijos tras muerte abrupta; historial medido de reinicio sin dos setups residentes                                               |
| Durabilidad       | Volumen persistente privado, exclusión de instancias por signer/journal, backups/restauración y pruebas de corte durante escritura/envío; definir las garantías del filesystem           |
| Cadena            | Política explícita de finalidad/reorg y RPC coherente; ensayo de journal bloqueado y rotación de signer según el candidato local                                                         |

Primero fijar carga objetivo, hardware, presupuesto, proveedores y responsables;
los números locales no determinan un SLA. No lanzar otra carga prolongada sin
un criterio que resuelva una de estas incógnitas.

## Resultado local completado: 5 de noviembre

Ambos dominios terminaron el MPC local y exportaron nuevas claves. La
[inicialización por etapas de opening](../benchmarks/timelock-opening/local-mpc-staged/README.md)
completó en 5 h 8 min 22,786 s con MaxRSS 3.132.063.744 bytes (~2,92 GiB).
El sellado con menos copias llegó a ~4,54 GiB; las verificaciones nativas de fase 2
a ~5,00 GiB. La verificación de fase 1 ya había medido ~8,43 GiB. No se cambió
hardware, swap ni servidores de otros proyectos para estos resultados.

El replay posterior usó las dos claves nuevas para tres pruebas Groth16 reales
por HTTP, consumidores Solidity, Game/H3 y equivalencia del World completo en
resolución puntual y retrasada. Pasaron rechazo de petición manipulada, flag de
invalidez forjado y prueba cruzada entre misiones; el caché se revalidó y H3 se
restauró tras Anvil revert. Pico nativo muestreado ~5,82 GiB, un solo proceso
nativo simultáneo, 10 min 42,787 s para las tres pruebas. Es un ensayo corto
local, no evidencia de disponibilidad remota/capacidad sostenida de producción.

Los adaptadores de inicialización/sellado conservan comparaciones exactas contra
claves nativas en circuitos pequeños y pasaron estas pruebas del juego, pero
requieren revisión independiente. Los beacons locales son conocidos/fijos;
unsafeLocalSetup=true, productionApproved=false y bloqueo de despliegue real
siguen vigentes. No se estableció participación independiente, cierre autenticado
ni aleatoriedad impredecible posterior; la memoria adicional no es un requisito
demostrado para este recorrido local ya completado.

## Trabajo pendiente vigente

El MPC local de ambos circuitos y el replay de tres pruebas ya terminaron.
No repetirlos para atender las instrucciones históricas inferiores. La siguiente
frontera es revisar los adaptadores y establecer procedencia segura de los
artefactos finales. La [preparación de revisión](hidden-v2-review-preparation.md)
fija entradas, comprobaciones locales y decisiones externas pendientes. El
comprobador de evidencia archivada sólo verifica integridad y coherencia; no
aprueba claves ni vuelve a ejecutar criptografía.

## Historial previo al cierre local (no es una lista de ejecución vigente)

La [prueba de compatibilidad MPC](../benchmarks/timelock-opening/setup-mpc/README.md)
ya valida la API nativa del backend fijado sobre un circuito pequeño con
compromiso. El [empaquetador de auditoría](hidden-v2-audit-bundle.md) permite
congelar las fuentes actuales con hashes, incluidos cambios sin commit. Ninguno
de esos resultados es una ceremonia ni una auditoría independiente.

La [CLI de diseño y revisión](hidden-v2-ceremony.md) valida un plan con pin externo
y revisiones Ed25519 con quórum/registro de confianza también fijado externamente.
Es autenticación de revisión de diseño: no ejecuta MPC ni aprueba producción.
La candidata inicial del plan usa fase 1 separada por circuito; su ejecución sigue
pendiente de medición de recursos y revisión independiente.

El formato de propuesta de ejecución ya se inspecciona offline. El ensayo
[pequeño entre procesos](../benchmarks/timelock-opening/mpc-rehearsal/README.md)
comprueba contribuciones firmadas, lectura nativa con dimensiones validadas antes
de asignar, cierres fijados por digest, autenticación de beacons archivados y
extracción/proving reproducibles. Usa una relación fija de cinco restricciones,
dominio 8 y dos identidades bajo un mismo operador: no es ceremonia segura.
La [escalera de capacidad](../benchmarks/timelock-opening/mpc-capacity/README.md)
ya mide fase 1 en 2¹⁰/2¹²/2¹⁴ bajo límites; registra los dominios del juego como
no ejecutados por presupuesto y no mide fase 2. La medición completa de esos
dominios, publicación autenticada de cierres y desafío
posterior impredecible siguen pendientes. Los datos del ensayo pequeño no fijan
presupuestos de producción. La [reproducción acotada del CS del juego](../benchmarks/timelock-opening/cs-reproduction/README.md)
posterior sí compila dos veces cada circuito desde un bundle verificado y obtiene
los mismos bytes/digests declarados históricamente. No genera claves ni mide MPC;
sus dimensiones alimentan un inventario de asignaciones de fase 2, no un pico
de RAM medido. Se propone un host dedicado de 64 GiB para experimentar con ambas
fases, todavía sin reserva ni capacidad demostrada.
La selección de participantes/auditor, contratación y aprobación
externa siguen pendientes; este repositorio no contiene evidencia de ellas.
Después implementar el importador y la aprobación de procedencia, resolver los
hallazgos y repetir checks/replays sobre los artefactos finales. El despliegue
real sigue siendo una acción separada que requiere instrucción del usuario.

La [entrada nativa protegida](hidden-v2-guarded-native-import.md) ya implementa
dimensiones ligadas al CS compilado, control de prefijos antes de ReadFrom y
verificación de puntos/subgrupos/canonicalidad. Está integrada y probada en el
ensayo pequeño entre procesos. La importación/aprobación de artefactos finales
del juego sigue pendiente; esos resultados no habilitan setups seguros.

El [probe local del 4 de noviembre](../benchmarks/timelock-opening/local-domain-probe/README.md)
ya mide inicialización/hash de fase 1 en ambos dominios completos, con picos de
2,414/4,742 GiB bajo techo virtual de 8 GiB. El host de 64 GiB es una opción,
no un requisito demostrado. La continuación preferida es medir contribución,
verificación y fase 2 por operaciones locales con presupuestos explícitos.

## Continuación local del 4 de noviembre

El [pipeline persistente](../benchmarks/timelock-opening/local-mpc-pipeline/README.md)
ya mide una contribución completa y su verificación criptográfica en 2²²:
41 min 26,530 s / 3,007 GiB y 11 min 38,838 s / 5,758 GiB de MaxRSS,
respectivamente. La segunda contribución terminó en 51 min 48,197 s, pico
3,699 GiB; su verificación terminó en 11 min 31,754 s / 5,249 GiB.
El sellado también terminó (52 min 08,055 s / 3,697 GiB). Ya se ejecuta
la primera contribución de fase 2 de invalid-point: su inicialización terminó
en 2 h 27 min 50,933 s / 6,215 GiB. Estado inicial y evaluaciones están cacheados
con hashes explícitos. Después de contribuciones/verificaciones/extracción sigue
el dominio 2²³.
Esto no demuestra todavía que ambas fases de ambos circuitos quepan localmente.

El ensayo pequeño del nuevo pipeline ya completa dos contribuciones por fase,
verificaciones entre procesos, extracción de claves desde evaluaciones cacheadas,
exportación Solidity y prove/verify positivo/negativo, con y sin compromiso.
Los beacons son fijos y las claves llevan unsafeLocalSetup=true. No sustituye
la ceremonia independiente, el beacon futuro, el importador/aprobación final ni
la auditoría. Las barreras de producción siguen activas.

El dominio 2²² completó posteriormente el protocolo local de ambas fases:
dos contribuciones verificadas por fase y extracción de nuevas PK/VK/Verifier.sol,
con pico de 7.740.268.544 bytes (~7,21 GiB) entre los workers. Se inició la
primera contribución de 2²³. La procedencia sigue siendo experimental/insegura;
el productor/EVM con las nuevas claves aún no se probó. El replay automático
espera a que estén listos ambos conjuntos y verifica fuentes/herramientas/claves
por hash antes de usar Anvil privado.

Las claves nuevas de invalid-point ya pasaron proving y verificación reales
del productor, y verificador Solidity/consumidor en Anvil, con sustituciones
de prueba/input/statement rechazadas. No es el replay completo Game/H3.
La contribución inicial 2²³ también terminó; su primera verificación encontró
el techo virtual de 10 GiB durante batching. Se reanuda con liberación de
transitorios y AS 14 GiB/RSS observado 10,5 GiB, manteniendo las mismas pruebas
nativas. No se infiere todavía la necesidad de otro host ni seguridad de
producción a partir de esta ejecución local.

## Optimización local del 5 de noviembre

Fase 1 de ambos dominios terminó. La inicialización nativa del opening se cortó
tras 3 h 26 min bajo probable presión de memoria del host; no generó claves23.
El [adaptador local por etapas](../benchmarks/timelock-opening/local-mpc-staged/README.md)
calcula tablas por separado, las persiste con hashes y conserva menos datos en
el sellado final. Es un cambio experimental de implementación: 134 eventos de
test Go en cuatro paquetes comparan bytes de inicialización/evaluaciones/claves
con gnark nativo y prueban proving, verificación y reanudación. No equivalen a
una auditoría ni a una prueba de capacidad del dominio completo. La nueva
medición del opening está en curso en esta PC; las barreras de producción
permanecen activas.
