# MPC local persistente en dominios del juego

4 de noviembre de 2026. El circuito real invalid-point (3.760.005 restricciones,
dominio 2²²) completó fase 1 y fase 2, con dos contribuciones verificadas en cada
fase, sellado, nuevas PK/VK y verificador Solidity. El pico de todos los workers
terminados fue **7.740.268.544 bytes (~7,21 GiB)** durante extracción de claves.
Todos los artefactos se persistieron en directorios nuevos fuera de Git.

La secuencia automática v4 continúa con el dominio 2²³ de opening,
reutilizando la primera contribución guardada y el conjunto completo 22. El nuevo conjunto de invalid-point ya pasó una prueba real del productor,
Go Verify y el verificador Solidity/consumidor en Anvil privado, con casos
negativos. El replay completo Game/H3 espera a que terminen ambos circuitos. Los beacons son fijos y conocidos; los manifiestos declaran
unsafeLocalSetup=true y productionApproved=false.

| Operación terminada               |                Wall |              MaxRSS |
| --------------------------------- | ------------------: | ------------------: |
| Primera contribución fase 1, 2²²  |     41 min 26,530 s | 3.228.385.280 bytes |
| Primera verificación fase 1, 2²²  |     11 min 38,838 s | 6.182.105.088 bytes |
| Segunda contribución fase 1, 2²²  |     51 min 48,197 s | 3.971.440.640 bytes |
| Segunda verificación fase 1, 2²²  |     11 min 31,754 s | 5.636.730.880 bytes |
| Sellado fase 1, 2²²               |     52 min 08,055 s | 3.969.638.400 bytes |
| Inicialización fase 2, 2²²        | 2 h 27 min 50,933 s | 6.672.801.792 bytes |
| Primera contribución fase 2, 2²²  |      5 min 10.132 s |    1281273856 bytes |
| Primera verificación fase 2, 2²²  |      1 min 50.185 s |    3170910208 bytes |
| Segunda contribución fase 2, 2²²  |       5 min 0.710 s |    1285799936 bytes |
| Segunda verificación fase 2, 2²²  |      1 min 45.411 s |    3224473600 bytes |
| Sellado/extracción fase 2, 2²²    |     18 min 41.058 s |    7740268544 bytes |
| Lectura fría del CS invalid-point |             5,666 s | 1.583.464.448 bytes |
| Lectura fría del CS opening       |             9,095 s | 2.307.706.880 bytes |

[results.json](results.json) fija los hashes originales, copias JSON normalizadas y sus ubicaciones
originales fuera de Git. Los CS son copias de los circuit.bin existentes, con
los mismos hashes que las compilaciones independientes anteriores. No se
leyeron PK/VK de los setups existentes para esta prueba.

La verificación de fase 1 conserva el estado nuevo y un anchor público del
anterior: digest y cuatro puntos, exactamente los valores anteriores usados
por las pruebas de actualización nativas. Usa UpdateProof.Verify y
SameRatioMany nativos; el ensayo pequeño compara ambas transiciones y el
sellado byte a byte con VerifyPhase1. El recibo local fijado por hash no acredita
participación independiente ni autorización de producción.

## Flujo y recursos

`pnpm pipeline:local-hidden-v2` compila offline una herramienta separada. Admite
contribute, verify, continue, seal, inspect-cs, phase2-init, phase2-contribute,
phase2-verify y phase2-seal. Todos los comandos requieren --unsafe-test-only,
outputs externos nuevos y pins SHA-256 explícitos de las entradas pertinentes.
Los workers se ejecutan serialmente y persisten informes, digests y heartbeats.
No sobrescriben directorios ni reintentan automáticamente un fallo.

| Operación                        | Espacio virtual máximo | CPU máxima | Wall máxima | MemAvailable inicial |
| -------------------------------- | ---------------------: | ---------: | ----------: | -------------------: |
| Contribución inicial fase 1      |                  8 GiB |    6.000 s |     7.200 s |               12 GiB |
| Verificación fase 1 v3           |                 10 GiB |    6.000 s |     7.200 s |               14 GiB |
| Verificación fase 1 v4           |                 14 GiB |    6.000 s |     7.200 s |             14,5 GiB |
| Continuación/sellado fase 1      |                  8 GiB |    9.000 s |    10.800 s |               12 GiB |
| Lectura fría CS                  |                  6 GiB |      120 s |       180 s |               10 GiB |
| Inicialización fase 2            |                 14 GiB |   86.400 s |        12 h |             14,5 GiB |
| Contribución/verificación fase 2 |                 10 GiB |   18.000 s |         6 h |               14 GiB |
| Sellado fase 2                   |                 14 GiB |   86.400 s |         6 h |             14,5 GiB |

Los límites de espacio virtual, CPU, tamaño de archivo (2 GiB) y core (cero)
son límites kernel comprobados al arrancar. Los objetivos Go de memoria no son
cuotas. Inicialización/sellado fase 2 tienen además un umbral observado de
10,5 GiB RSS muestreado cada 100 ms: puede haber un exceso entre muestras y no
es un límite kernel de RSS. El pico final también se comprueba. La presión del
host por debajo de 4 GiB disponibles detiene el worker. Se mata el grupo y se
espera su salida antes de continuar.

Fase 2 lee el CS frío autenticado por pin y los commons sellados, inicializa
mediante la API nativa y persiste por separado el estado inicial y las
evaluaciones. Las contribuciones/verificaciones posteriores leen sólo estados
de fase 2; el sellado usa commons/evaluaciones sin cargar el CS. Los prefijos de
los vectores se comprueban antes de las asignaciones nativas. La caché de
evaluaciones tiene framing local explícito; no se presenta como transcript MPC.
Los beacons fijos son conocidos y exclusivos de capacidad, sin cierre futuro.

`scripts/hidden-v2-local-sequence.py` encadena los dos dominios, admite continuar
la fase 1 ya iniciada y valida el binario/CS por hash. Sus eventos y reportes se
persisten en un directorio nuevo. La ejecución actual está en
`/home/rodrigo/.cache/vendetta-audit/local-mpc-sequence-20261104-run3/` y usa el
binario inmutable pipeline-v4; el bundle source-v4-at-launch.tar.gz y su recibo
se conservan en local-mpc-pipeline-20261104-tools, bajo el mismo directorio padre.

## Validación y límites

El ensayo pequeño usa procesos reales para dos contribuciones y verificaciones
por fase, sellado, export Solidity, carga de claves y prove/verify positivo y
negativo. Se prueban circuitos con y sin compromiso. La caché se compara con
claves obtenidas por VerifyPhase2 nativo. Las regresiones cubren framing,
canonicalidad, longitudes maliciosas, fallo/timeout, espera de salida y
conservación de evidencias. Cuatro tests Python comprueban la secuencia/pins,
parada tras fallo, rechazo de outputs existentes y espera de salida antes de
leer un recibo aún en escritura. El binario v3 se reconstruyó offline desde el
bundle congelado con SHA idéntico; ver [recibo](binary-reproduction.json).
La regresión registrada en [tests.jsonl](tests.jsonl) pasó siete paquetes y
133 eventos de tests/subtests/seeds, sin fallos. La prueba de sustitución de
challenge recalcula hashes y llega al rechazo criptográfico nativo.
El test de presión comprueba parada y recolección del proceso. Un fuzz acotado
de las tres cachés terminó sin fallo, pero sólo ejecutó once muestras; no se
presenta como cobertura amplia.

No hay ceremonia independiente, cierre autenticado con beacon futuro, auditoría
ni aprobación de artefactos del juego. No se modifican setups existentes ni
barreras de producción y no hay despliegues reales. Un host de 64 GiB es una
opción si una operación supera este presupuesto, no una necesidad ya probada.

El replay posterior se prepara con scripts/hidden-v2-local-replay.py. Espera
sequence-complete y comprueba inventarios/hashes de claves, manifiestos locales,
fuentes ejecutables y herramientas antes de lanzar el productor en Anvil privado.
Los nuevos directorios enlazan únicamente las claves recién calculadas; el
runtime EVM, jobs y resultados se escriben bajo la nueva ruta de replay. El
productor corre con PROVER_MEMORY=6GiB/PROVER_THREADS=4, techo virtual 14 GiB,
CPU 10800 s por proceso, wall 2 h, archivo 2 GiB/core cero; el supervisor externo
detiene el grupo si MemAvailable cae por debajo de 4 GiB. Estos son presupuestos
preparados, no mediciones de ese replay. Todavía no se ejecutó con las nuevas
claves. Cuatro tests ligeros comprueban eventos parciales, recibos que declaran
aprobación, inventarios incompletos y observación de memoria.

El campo operation del informe de verify2 conserva la etiqueta del helper
verify-first-contribution. Su recibo verification sí fija la segunda contribución
(sourceArtifactSha256=22d92d7e…) y el recibo de la primera como predecesor; son
los campos que valida la cadena. Se conserva el informe original sin corregir
retrospectivamente su etiqueta.

El nuevo Verifier.sol de invalid-point también compiló directamente con el
solc fijado (0.8.28, optimización 200, Cancun): runtime 6.609 bytes.
[solidity22-compile.json](solidity22-compile.json) vincula manifest/source/compiler
y hash del runtime de esta compilación aislada; no es el registro final del
replay ni una prueba Groth16 con esas claves. Se verificaron todos los hashes
del nuevo conjunto. Estado original local-mpc-solidity22-20261104-run1 fuera
de Git. Un primer intento con Forge abortó en su allocator Rust bajo AS 2 GiB;
la compilación directa con solc pasó con el mismo presupuesto virtual, 120 s CPU,
16 MiB por archivo y core cero. Se conserva ese intento, sin confundirlo con
un fallo del circuito o de la nueva clave.

## Continuación: límite observado en 2²³ y prueba real de invalid-point

La primera contribución de 2²³ terminó en **82 min 19,626 s**, pico
5.218.168.832 bytes. La primera verificación se detuvo en SameRatioMany al
intentar reservar otro bloque de 2 GiB bajo el techo virtual de 10 GiB; RSS
máximo 7.516.946.432 bytes. Se conserva report incomplete/transcript: no se
declara fallo criptográfico ni necesidad de otro host. La versión v4 libera
transitorios de decode/hash antes del batching nativo, permite AS 14 GiB y
Go target 8 GiB para verify, exige 14,5 GiB de margen inicial y detiene el
worker con RSS observado >10,5 GiB cada 100 ms o host disponible <4 GiB.
El algoritmo criptográfico permanece UpdateProof.Verify/SameRatioMany nativo.
Se reanuda desde la primera contribución guardada y las claves 22 completas.

Durante esa parada, el productor real generó y verificó una prueba invalid-U
con las nuevas claves: 237,498 s, MaxRSS 5.329.436.672 bytes. La petición
deriva del fixture público codec-v2 con U no canónico y roots recalculados;
--inspect-v2 confirmó la ruta. El verificador Solidity y el consumidor real
aceptaron esa prueba en Anvil 1337 y rechazaron prueba/input/statement
sustituidos; se repitió el positivo al final. estimateGas de check: 356.525.
Esto valida la interoperabilidad de las nuevas claves; **no es el replay
completo Game/H3 con nuevos contextos**, que sigue pendiente de ambos juegos
de claves. [Informe EVM](invalid-point-evm-report.json), [prueba](invalid-point-new-keys-proof.json)
y [script de la ejecución](evm22-check.mjs) conservan la evidencia; sus rutas
absolutas identifican esta ejecución local. No hubo despliegue de red real.

La reanudación v4 está activa en local-mpc-sequence-20261104-run3 y el watcher
del replay en local-mpc-replay-20261104-run2. Sus versiones anteriores se
detuvieron sin usar claves parciales. Se reutilizan por pins las claves 22
y el transcript de primera contribución 23. [v4-tests.jsonl](v4-tests.jsonl)
registra 3 paquetes/94 eventos aprobados; 24 tests Python cubren además la
reanudación y la conservación/rechazo de artefactos sustituidos. El binario
v4 se reconstruyó desde su bundle con SHA idéntico: [recibo](v4-binary-reproduction.json).
No se modificó el verificador matemático: sólo límites/supervisión y liberación
de transitorios antes de la llamada nativa. El presupuesto v4 de verify es
AS 14 GiB, Go target 8 GiB, MemAvailable inicial 14,5 GiB y parada con RSS
observado >10,5 GiB cada 100 ms; CPU/wall 6000/7200 s permanecen.

La primera verificación 2²³ pasó con v4: **26 min 29,553 s**, MaxRSS
9.051.721.728 bytes (~8,43 GiB), mismo algoritmo nativo. La segunda contribución
también terminó: 117 min 20,356 s, MaxRSS 5.373.382.656 bytes. Su verificación
está ejecutándose; después siguen sellado y fase 2 del segundo circuito.

Durante verify2 se observó un salto de UTC desde 07:40:11 hasta 16:46:31,
mientras elapsedSeconds avanzó 10 s. [Observación](clock-discontinuity.json):
9 h 6 min 10 s de diferencia, causa no determinada. No atribuir ese intervalo
al cálculo. Los tiempos reportados usan el contador transcurrido del worker;
las estimaciones de trabajo pendiente suponen una PC que sigue ejecutando.
No se utiliza ese reloj local para declarar cierre/beacon posterior seguro.

La segunda verificación 2²³ también terminó: **22 min 59,443 s** de contador
transcurrido, MaxRSS 9.038.798.848 bytes. El sellado arrancó automáticamente.
El salto de UTC señalado antes está incluido entre sus timestamps, pero no
en ese contador de ejecución; se conservan ambas observaciones.

Fase 1 de 2²³ completada: sellado en **105 min 11,012 s**, MaxRSS
5.372.522.496 bytes. Commons públicos persistidos, SHA-256
`65abc486a3a255849d4735f06d5664775b4a8129c6f90643702e426d5ce2ac82`.
Ambos dominios terminaron sus dos contribuciones/verificaciones y sellado de
fase 1 en esta PC. La inicialización de fase 2 del opening real está en curso
con AS 14 GiB/Go target 8 GiB y umbral RSS observado 10,5 GiB.

La inicialización nativa 2²³ se detuvo después de 3 h 26 min 3,595 s. El informe
`phase2-init23-v4-failed-report.json` usa un mensaje común a presión del host,
fallo de observación y exceso del presupuesto RSS. El máximo RSS fue ~8,00 GiB,
por debajo de 10,5 GiB; el último heartbeat mostró sólo ~4,16 GiB disponibles,
por lo que la presión del host es la causa probable. El watcher se detuvo sin
usar claves parciales. El nuevo [adaptador por etapas](../local-mpc-staged/README.md)
reduce retención de tablas y guarda checkpoints; su medición del opening completo
está en curso. No se repite la fase 1 ni el protocolo invalid-point ya terminado.
