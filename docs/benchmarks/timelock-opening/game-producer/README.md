# Productor real de certificados: integración local

Validación del 29 de octubre de 2026. El productor HTTP genera certificados
Groth16 para misiones recién admitidas por Game; no usa consumidores ni pruebas
simulados. Se desplegó únicamente en un Anvil privado, con setup local inseguro.
No constituye una configuración apta para producción.

Los resultados completos están en `results.json` y los certificados y mediciones
en `certificates.json`. Se verificaron tres casos:

| Caso                                                   | Tiempo de petición | Gas de envío del certificado |
| ------------------------------------------------------ | -----------------: | ---------------------------: |
| Paquete válido recién cifrado, ronda 1001, salt máximo |          255555 ms |                       846477 |
| Commitment inválido, cinco candidatos H3               |          225664 ms |                       781591 |
| Punto U inválido                                       |          155305 ms |                       383009 |

Los tiempos incluyen el procesamiento de la petición y la preparación H3 cuando
corresponde. El gas indicado corresponde al envío del certificado, no al coste
total de despliegue, admisión ni preparación H3.

Resolver con dos horas de retraso produjo exactamente el mismo World completo
que resolver puntualmente. Los certificados manipulados y el intento de usar
una prueba de otra misión se rechazaron sin alterar el recibo pendiente. Tras
revertir Anvil, la caché reutilizó las tres pruebas y reconstruyó el estado H3.

Se usaron firmas drand auténticas archivadas, verificadas por el productor; esta
prueba no evalúa la disponibilidad del servicio público drand. El setup se
reutiliza entre misiones y no se ejecuta al procesar cada ataque.

Código principal: `apps/web/scripts/prover/service.ts`,
`apps/web/scripts/experiments/opening-zk/producer_*.go` y el harness
`apps/web/scripts/experiments/run-producer-game.ts`.

Para reproducir con claves locales ya generadas:

```bash
HIDDEN_PROVER_KEYS=/ruta/keys \
HIDDEN_PROVER_BIN=/ruta/vendetta-producer-v2 \
SOLC_BIN=/ruta/solc-0.8.28 \
pnpm --filter @vendetta/web exec tsx scripts/experiments/run-producer-game.ts
```

Las claves, binarios y cachés no se incluyen en el repositorio. El servicio exige
coincidencia entre setup y bytecode del verificador desplegado; los errores se
reintentan y nunca se convierten en una declaración de ataque inválido. El setup
local inseguro se admite expresamente sólo en chain IDs 1337 y 31337. Declarar
`unsafeLocalSetup: false` también se rechaza: todavía no existe verificación de
procedencia de un setup seguro. Ver el [hito 6](../../../proposals/hidden-v2-production-readiness.md).

Persisten costes altos de prueba, dependencia de disponibilidad de productores,
necesidad de setup seguro y auditoría. El servidor experimental escucha en
loopback; su operación y protección de recursos requieren trabajo adicional.

## Ejecución del servicio

Configurar las variables server-only de `.env.example` en el entorno del proceso
(la CLI no carga `.env` automáticamente). Conservar binario, claves y caché fuera
del repositorio. No regenerar setups al cambiar el witness de una misión.

```bash
# Compilar el binario una vez con el SDK Go compatible con go.mod:
(cd apps/web/scripts/experiments/opening-zk && go build -o "$HIDDEN_PROVER_BIN" .)
# Compilar verificadores públicos y vincular setup con bytecode:
pnpm --filter @vendetta/web prover:compile "$HIDDEN_PROVER_KEYS"
# Iniciar el productor, ligado al Game y RPC del deployment:
pnpm --filter @vendetta/web prover deployments/local.json
# En otro proceso, con HIDDEN_PROVER_URL=http://127.0.0.1:8787/
# y HIDDEN_PROVER_TOKEN asignado al keeper:
pnpm --filter @vendetta/web keeper deployments/local.json
```

`HIDDEN_H3_PRIVATE_KEY` debe disponer de fondos para las transacciones H3.
`HIDDEN_PROVER_PORT` vale 8787 por defecto y el servidor escucha en loopback.
`RPC_URL` permite reemplazar el RPC del deployment; el chain ID debe coincidir.
`PROVER_THREADS=8` y `PROVER_MEMORY=6GiB` limitan cada trabajo Go, serializado.
`ALLOW_UNSAFE_LOCAL_SETUP=1` sólo permite claves inseguras en 1337/31337;
no habilita su uso en redes reales. Los manifiestos deben declarar explícitamente
si el setup es inseguro. El compilador acepta `FORGE_BIN` y `SOLC_BIN` opcionales.
La compilación no ejecuta un setup ni copia las claves al proyecto Solidity.

Checks rápidos: `pnpm --filter @vendetta/web typecheck:scripts` y
`go test -run '^TestProducer' -count=1` desde opening-zk. El replay completo
se ejecuta con `pnpm --filter @vendetta/web prover:replay` y las variables de
claves/binario anteriores; es pesado y debe ejecutarse sin otros provers.

## Límites de ejecución y recuperación

`HIDDEN_PROVER_TIMEOUT_MS=900000` limita cada subproceso nativo de inspección
o prueba a quince minutos por defecto. Debe ser un entero positivo de hasta
2147483647 ms. Al vencer, el servicio mata el subproceso con SIGKILL antes de
liberar el turno; la petición falla con 503 y el keeper puede reintentar. No es
un plazo de validez de la misión ni un límite total de la petición: no cancela
RPC, preparación H3 ni espera en cola.

La cola admite ocho trabajos distintos, contando el activo, y ejecuta uno cada
vez. Peticiones idénticas comparten el trabajo incluso con la cola llena; una
petición adicional recibe 503. Un fallo libera su turno y permite volver a
intentar la misma identidad. Las pruebas de recursos ejecutan un subproceso
Node bloqueado real y comprueban su terminación y la recuperación de la cola,
sin cargar claves ni generar pruebas Groth16.

Quedan pendientes autenticación/cuotas por cliente, métricas, recuperación de RPC/transacciones H3 y
mediciones de carga sostenida. Este límite de procesos no resuelve por sí solo
la disponibilidad del productor.

## Límites HTTP

El listener de loopback admite como máximo 32 conexiones simultáneas y 32
handlers activos. Un cliente desconectado sigue contando como handler hasta
que termina su trabajo: reconectar repetidamente no acumula waiters ilimitados.
El límite de ocho trabajos distintos y la deduplicación de la cola permanecen.
Cada conexión acepta una petición y se cierra al responder, limitando también
el pipelining. Estos límites son por proceso, sin cuotas por identidad.

La subida del cuerpo tiene un plazo absoluto de 10 segundos desde los headers
completos y un máximo de 16 KiB; headers admiten 8 KiB y tienen un plazo Node
de 10 segundos, con comprobación periódica cada segundo. El plazo de recepción
Node es de 15 segundos. El plazo propio de subida destruye el socket incompleto;
los errores de JSON/raíz y los fallos de generación conservan respuesta 503
cuando la conexión permite responder. Sólo se aceptan objetos JSON como raíz.
La expiración HTTP nunca se convierte en evidencia de invalidez.

El timeout de subida se elimina al terminar de leer el cuerpo; no limita la
espera en cola ni la generación de la prueba. Keep-alive tiene 5 segundos y el
servidor no impone timeout de inactividad al socket durante la generación.
Pruebas con sockets reales cubren subida incompleta, exceso de conexiones,
reconexión tras desconexión durante una prueba, cuerpos inválidos/grandes y
recuperación posterior. Siguen pendientes autenticación/cuotas por cliente,
métricas y recuperación RPC/H3.

### Retención de caché

`HIDDEN_PROVER_CACHE_MAX_BYTES=67108864`, `HIDDEN_PROVER_CACHE_MAX_FILES=4096`
y `HIDDEN_PROVER_CACHE_MAX_AGE_MS=604800000` limitan las pruebas retenidas
(64 MiB, 4096 archivos, siete días desde su escritura). Deben ser enteros positivos
seguros; se validan antes del RPC. Al iniciar y antes/después de cada trabajo
serializado se eliminan pruebas expiradas y, después, las más antiguas hasta
cumplir ambos presupuestos. Los hits no renuevan la antigüedad. También se
eliminan requests, inspecciones y salidas parciales de trabajos fallidos.

La carpeta debe ser privada y exclusiva de un proceso productor. Sólo se borran
nombres de archivos propios; otros archivos quedan intactos y no cuentan en los
presupuestos. Enlaces simbólicos con nombres propios provocan un fallo, sin
seguirlos. La limpieza fallida mantiene el error reintentable. La retención se
aplica en los límites de trabajos: no es una cuota de disco durante la escritura
nativa ni un temporizador de limpieza en reposo. Usar cuota de filesystem para
un techo físico estricto. Una prueba expulsada se regenera cuando se solicita;
no se altera la validez ni el orden de la misión.

### Métricas y recuperación RPC/H3

`GET /metrics` en el mismo listener loopback devuelve JSON agregado: handlers
activos, tamaño/capacidad de cola, deduplicaciones y rechazos, pruebas generadas,
hits de caché, espacio/archivos retenidos tras la última limpieza, memoria del
proceso y llamadas/fallos/tiempo total/máximo por etapa. Las etapas incluyen
trabajo, lectura de bloque RPC, inspección, beacon, proving, limpieza, prefijo H3,
transacciones y recuperación H3. Los contadores se reinician con el proceso;
`requests` cuenta cuerpos parseados que llegan al servicio y `job` cuenta trabajos
únicos ejecutados, incluyendo los fallidos. No incluye direcciones, packets,
firmas, claves, URLs RPC ni mensajes de error. No es una sonda de disponibilidad
RPC y no realiza operaciones de cadena. No se debe exponer públicamente sin
control de acceso. Los tiempos son agregados, no percentiles.

Cada llamada RPC tiene timeout de 15 segundos sin reintentos automáticos del
transporte. La espera de recibo H3 tiene timeout de 60 segundos; un fallo sigue
siendo 503 reintentable. Antes de enviar H3 se prepara y firma localmente la
transacción, se guarda mediante rename un journal privado de bytes firmados
`h3-<chain>-<game>-<signer>.json` en caché y sólo entonces se transmite. El journal
se conserva ante timeout, desconexión o respuesta perdida. El siguiente trabajo
lo recupera antes de leer el contexto de la misión: retransmite los mismos
bytes y espera el recibo del mismo hash, incluso después de reiniciar. Un recibo
revertido elimina el journal y devuelve error; el siguiente intento vuelve a
leer estado. Un recibo exitoso permite continuar desde el progreso H3 en cadena.
Las pruebas de caché se conservan ante fallos RPC/H3 para reutilizarlas.

Usar una cuenta H3 dedicada y una carpeta exclusiva de un proceso. El journal
no se expulsa con las pruebas y no debe borrarse mientras una transacción esté
sin resolver. No se implementan reemplazos por tarifas, cancelación de nonces,
failover RPC ni recuperación automática ante reorganizaciones profundas. Una
transacción que nunca se mine puede bloquear la cola hasta intervención del
operador; la prioridad es evitar avances duplicados. El rename protege ante
reinicio de proceso; no se garantiza persistencia ante pérdida de energía.

### Autenticación y cuotas por cliente

El productor requiere `HIDDEN_PROVER_CLIENTS_FILE`: ruta a un JSON privado fuera
del repositorio, con entre 1 y 128 clientes. Se valida antes de conectar al RPC.
Ejemplo de estructura (sustituir ambos tokens por secretos independientes):

```json
[
  {
    "token": "REPLACE_WITH_RANDOM_KEEPER_TOKEN_32_CHARS_MIN",
    "scopes": ["prove"],
    "requestsPerMinute": 60,
    "maxConcurrent": 2
  },
  {
    "token": "REPLACE_WITH_RANDOM_METRICS_TOKEN_32_CHARS_MIN",
    "scopes": ["metrics"],
    "requestsPerMinute": 60,
    "maxConcurrent": 1
  }
]
```

Generar cada token con `openssl rand -hex 32`; proteger el archivo con permisos 0600. Tokens únicos de 32–128 caracteres alfanuméricos, guion o guion bajo.
`requestsPerMinute` acepta enteros de 1 a 100000; `maxConcurrent`, de 1 a 32.
El keeper exige `HIDDEN_PROVER_TOKEN` y lo envía como `Authorization: Bearer ...`.
El cliente rechaza redirecciones para no reenviar credenciales. No configurar
estos secretos en `VITE_*` ni en el navegador. La CLI no carga `.env` sola.

`POST /` exige scope `prove`; `GET /metrics`, scope `metrics`. Las credenciales
se comparan mediante hashes SHA-256 con comparación de tiempo constante.
La autenticación y las cuotas se comprueban antes de leer el cuerpo. Falta de
credencial/token incorrecto devuelve 401; scope insuficiente, 403; cuota agotada,
429 con `Retry-After`. El keeper reintenta esos errores sin producir INVALID.

La cuota usa un token bucket por cliente: capacidad inicial igual a
`requestsPerMinute` y recarga continua a esa tasa. Cada petición admitida consume
una unidad, aunque después falle el cuerpo, la cola o el trabajo; no se reembolsa.
Peticiones duplicadas/hits de caché también consumen cuota. La concurrencia cuenta
handlers desde la admisión, incluidos uploads y trabajos pendientes/compartidos.
Desconectarse no libera un trabajo activo; terminar o fallar sí libera el turno.
Clientes diferentes tienen presupuestos independientes, sujetos a límites globales
HTTP y a la cola serial existentes. Si ambos scopes comparten token, comparten cuota.

`/metrics` añade contadores agregados `access.unauthorized`, `access.forbidden`
y `access.limited`, sin identificar clientes. Los presupuestos y contadores
son locales al proceso y se reinician con él; no garantizan reparto equitativo
de CPU ni representan cuotas de tiempo de proving. Rotar/revocar tokens requiere
actualizar el archivo y reiniciar. No hay registro dinámico ni cuotas distribuidas.
El listener continúa en loopback; para acceso remoto, usar un proxy TLS con
controles de conexión. Conocer un token no cambia qué misión/packet puede certificar
el consumidor: se siguen verificando contexto, setup y prueba.

### Carga operativa e historiales adversarios

Carga reproducible, con puerto efímero y carpeta temporal que se elimina al salir:

```bash
pnpm --filter @vendetta/web prover:load 60 /tmp/vendetta-producer-load.json
```

El argumento de duración admite 1–3600 segundos. El harness usa HTTP, control de
acceso, cola serial y retención en filesystem reales, con 20 workers y trabajos
**sintéticos** de 8 ms más I/O. No usa RPC, H3, beacon ni Groth16. Mezcla credenciales
incorrectas, scopes insuficientes, saturación por cliente y de cola, claves
compartidas para deduplicar, hits y expulsiones de caché, y un fallo inicial
reintentable para cada clave múltiplo de 17. Al terminar la carga, comprueba que
las 256 claves pueden recuperarse. Comprueba cola vacía, cero handlers/trabajos
activos, máximo un trabajo simultáneo y ambos presupuestos de caché.

`load-results.json` registra una ejecución de 60 segundos (65,1 s con recuperación):
1313 trabajos completados, 16 fallos inyectados, 1282 deduplicaciones, 170 hits y
máximo ocho trabajos pendientes. Terminó con cero pendientes y 32 archivos/8192
bytes, dentro del presupuesto; las 256 claves se recuperaron. 429 y 503 son
rechazos esperados durante sobrecarga. Sus percentiles mezclan respuestas rápidas
de rechazo/monitorización con trabajos y recuperación; **no son latencias de
proving**. La memoria final y el pico muestreado son observaciones de esta ejecución,
no una prueba de ausencia de fugas ni una garantía de memoria máxima.

`packages/rules/test/hidden-histories.test.ts` añade 18 historiales: seis órdenes
de llegada de certificados y presupuestos de drenaje 1/2/20, evidencia válida e
inválida, ataques públicos empatados en llegada, recall, duplicados y fallos de
verificador. Compara todo el World tras siete días de demora con ejecución en
las llegadas originales. Usa la frontera de verificación confiable del modelo
TS; no genera pruebas criptográficas y no es un nuevo diferencial Solidity.

Pendiente: carga con proving y RPC/H3 reales durante periodos largos, medición
por tipo de circuito, capacidad/costes por misión, más escenarios diferenciales
de juego y ensayos de recuperación ante transacciones atascadas/reorg. El harness
sintético no permite dimensionar un productor de producción.

### Diferencial de historiales con Solidity (30 de octubre de 2026)

El generador `packages/rules/scripts/scenarios.ts` añade los escenarios 36–53:
seis órdenes de certificados por presupuestos de drenaje 1/2/20. Cada historial
incluye tres ataques ocultos (dos válidos y uno con certificado invalid-point),
un cuarto retirado mediante recall, un ataque público empatado en llegada,
duplicados y evidencia para una misión retirada. Tras siete días de demora,
el generador exige igualdad del World completo con un oráculo puntual.
Foundry reproduce cada acción tardía y compara los campos del snapshot
habitual (edificios, misiones, jugadores y estado social/económico). No afirma
comparación exhaustiva de todo el storage ni de logs/reportes on-chain.

`pnpm --filter @vendetta/rules scenarios` regenera los fixtures; desde
`contracts`, `forge test --match-contract ScenariosTest` ejecuta el diferencial.
Pasaron 43 tests de Foundry y los 762 tests rules. Se usan consumidores de test:
no se repitió proving real ni se simulan aquí fallos del verificador.
Resultados: `differential-histories-results.json`. Siguen pendientes carga
prolongada con proving/RPC/H3 reales, capacidad/costes y recuperación ante
transacciones atascadas/reorg, además del setup seguro y la auditoría.

### Lote de capacidad con pruebas reales (30 de octubre de 2026)

`pnpm --filter @vendetta/web prover:capacity` ejecuta seis misiones distintas con
doce peticiones HTTP simultáneas sobre Anvil privado y consumidores reales.
El [reporte de capacidad](capacity/README.md) registra 23,09 minutos para seis
pruebas nuevas, seis deduplicaciones y 15,59 misiones/hora observadas. Opening
consumió 241,59–306,09 s nativos; invalid-point, 166,01–168,23 s. El pico RSS
muestreado fue 5,94 GiB con ocho hilos y GOMEMLIMIT=6GiB en estación compartida.
La caché recuperó los seis certificados después de revertir Anvil y se mantuvo
la igualdad del World puntual/tardío. El resumen reconcilia 517120 gas H3 en tres
contextos y 7527257 gas para admisiones + H3 + certificados; excluye despliegues,
reverts de prueba y ejecución de misiones. No estima precios de una red real.

Esta es la primera medición del lote concurrente con proving/RPC/H3 reales,
firmas drand auténticas archivadas y setups existentes; no es una prueba de
carga prolongada ni de disponibilidad de RPC/beacon remotos. Los resultados y
sus límites están separados del replay original. Continúan pendientes carga de
horas/días, capacidad bajo mezcla representativa, perfilado por etapas nativas,
recuperación de transacciones atascadas/reorg, setup seguro y auditoría.

## Perfil nativo por etapas

```bash
HIDDEN_PROVER_BIN=/ruta/productor-instrumentado \
HIDDEN_PROVER_KEYS=/ruta/keys \
pnpm --filter @vendetta/web prover:profile /ruta/reporte-nuevo.json
```

Compilar el binario desde las fuentes actuales con el comando de build anterior.
No genera ni modifica setups. Ejecuta secuencialmente una apertura válida con
firma archivada auténtica y un punto U inválido derivados de los vectores codec-v2.
Usa GOMEMLIMIT=6GiB, GOMAXPROCS=8 y timeout/SIGKILL de quince minutos por prueba.
El reporte exige un archivo nuevo; no sobrescribe resultados anteriores.
Los requests y pruebas temporales se eliminan al finalizar; el informe conserva
sólo duraciones, hashes de binario/vectores/manifiestos y recursos agregados.
Ejecutar sin otro prover pesado simultáneo.

Cada artefacto nuevo de `--prove-v2` incluye `profileMs`, con tiempos de pared
monotónicos y disjuntos: `artifactIntegrityMs` (manifiesto y hashes),
`prepareAssignmentMs` (lectura del request, autenticación beacon y derivación de
asignación), `loadArtifactsMs` (deserialización de CS/PK/VK), `witnessMs`
(construcción y extracción pública), `proveMs`, `verifyMs` y `encodeMs`
(inputs, prueba Solidity y digest del manifiesto). Su suma aproxima `elapsedMs`;
no incluye serialización/escritura del resultado ni arranque del proceso.
La instrumentación no altera circuitos, claves, statements ni decisiones.
Los hits de caché antiguos pueden carecer de `profileMs`; no se inventan etapas
para ellos. El benchmark de capacidad conserva este campo cuando está presente.

El perfil es nativo: verifica cada prueba con VK, sin repetir la aceptación EVM,
HTTP, RPC o H3. Una muestra por circuito en hardware compartido, con cachés de
filesystem sin vaciar, no establece percentiles ni capacidad sostenible.
GC y planificación se incluyen en los tiempos de cada etapa. La comparación
sirve para decidir qué optimizar; no justifica desactivar la integridad ni
mantener las dos claves grandes residentes sin medir memoria adicional.

Resultado del perfil del 30 de octubre de 2026: `phase-profile.json`.
Dos pruebas nuevas verificadas localmente con VK, ejecución secuencial de 550,22 s.

| Circuito       | Total nativo | Integridad | Carga CS/PK/VK | Proving |
| -------------- | -----------: | ---------: | -------------: | ------: |
| Opening válido |     309,25 s |    38,48 s |       202,42 s | 68,32 s |
| Punto inválido |     238,52 s |    15,46 s |       183,16 s | 39,90 s |

La carga representa 65,5 % y 76,8 % respectivamente; preparación de asignación,
witness, VK y encoding sumaron menos de 15 ms por prueba. Estos son tiempos de
pared de esta ejecución, no tiempos aislados de CPU. El pico RSS muestreado fue
5,85 GiB en opening y 5,29 GiB en punto inválido; Node separado, 109,88 MiB.
No confundir GOMEMLIMIT con una cota estricta de RSS. Sólo hubo un prover activo.

La primera línea de investigación queda fundamentada: evaluar reutilización
controlada de CS/PK/VK deserializados, midiendo el coste de memoria y el cambio
de circuito, y conservando autenticación de artefactos y aislamiento entre
requests. No se implementó todavía un worker residente ni se omitieron hashes.
El binario instrumentado de esta ejecución está en
`/home/rodrigo/.cache/vendetta-producer-v2-profile`; no reemplaza el binario
anterior. Log: `/tmp/vendetta-producer-profile.log`.

## Experimento de reutilización de artefactos

```bash
# Build from current sources, using a separate binary for the experiment.
HIDDEN_PROVER_BIN=/ruta/productor-worker \
HIDDEN_PROVER_KEYS=/ruta/keys \
pnpm --filter @vendetta/web prover:worker:profile /ruta/reporte-nuevo.json
```

`--prove-worker-v2 <setup-dir>` acepta por stdin una línea JSON por trabajo con
rutas locales `input` y `output`. Emite `VENDETTA_WORKER_V2_DONE` tras escribir
cada resultado; stdout también contiene logs de gnark. El comando es una
interfaz interna de experimento, sin listener de red. Los mensajes de control
se limitan a 64 KiB. Un error aborta el proceso entero; no se reutiliza estado
tras fallos. EOF termina el worker. Cada proceso admite un único setup, cuyo
manifiesto queda fijado al cargar por primera vez.

CS/PK/VK se deserializan una sola vez. Antes de **cada** trabajo se vuelven a
verificar los cuatro hashes de artefactos; el manifiesto debe conservar su
digest y se comprueba otra vez al terminar el proving. Cada petición vuelve a
autenticar el beacon, construir asignación/witness, generar prueba y verificarla
con VK. `artifactsReused` indica si se omitió únicamente la deserialización.
El CLI original `--prove-v2` sigue cargando un setup nuevo por invocación.

El harness ejecuta tres statements distintos: válido → compromiso inválido →
válido con cinco candidatos. Exige decisiones correctas, statements propios,
verificación local de las tres pruebas, una carga fría y dos reutilizaciones;
comprueba reconciliación de tiempos y un solo proceso nativo observado. Usa
8 hilos y GOMEMLIMIT=6GiB. El timeout/SIGKILL cubre el lote completo de tres
trabajos (45 minutos), no cada job individual. Espera la salida del proceso
antes de liberar recursos. No modifica timeouts ni ejecución del servicio HTTP.

El reporte no contiene witnesses, requests ni pruebas; los temporales se limpian
al finalizar. Sólo se evalúa opening y una secuencia corta: no demuestra todavía
estabilidad durante horas, memoria tras alternar circuitos, recuperación del
servicio ni aceptación EVM/H3 de este nuevo modo. El servicio mantiene la ruta
por subproceso hasta evaluar esos límites y adaptar su ciclo de vida y timeout
por trabajo. Los setups deben permanecer bajo control del operador, sin
escritores concurrentes; no hay garantía frente a un atacante local que pueda
modificarlos entre hash y lectura. No se generan nuevos setups.

Resultado del 30 de octubre de 2026: `worker-profile.json`, lote de **468,53 s**.

| Petición                 | Artefactos residentes | Total nativo | Integridad |    Carga | Proving |
| ------------------------ | --------------------- | -----------: | ---------: | -------: | ------: |
| Válido                   | No                    |     347,14 s |     5,88 s | 266,28 s | 74,94 s |
| Compromiso inválido      | Sí                    |      61,98 s |     3,50 s |   < 1 ms | 58,48 s |
| Válido, cinco candidatos | Sí                    |      58,26 s |     2,22 s |   < 1 ms | 56,03 s |

Las tres pruebas verificaron con VK; se comprobaron las decisiones y statements
de sus inputs públicos (posiciones 48–50), también mediante un observador de
esta ejecución. Los artefactos permanecieron en memoria en un único proceso.
Pico RSS muestreado 6,00 GiB, Node separado 85,33 MiB; el proceso terminó tras
EOF. Estos datos apoyan continuar con la reutilización; no son una comparación
controlada de throughput: los witnesses difieren y hay cachés/GC/otras cargas.
No hay aún medición de memoria después de cambiar de circuito ni prueba larga.

Binario: `/home/rodrigo/.cache/vendetta-producer-v2-worker`, distinto del binario
normal y del perfil por subproceso. Logs: `/tmp/vendetta-producer-worker.log`,
`/tmp/vendetta-producer-worker-binding.log`,
`/tmp/vendetta-producer-worker-native.log` y
`/tmp/vendetta-producer-worker-tests.log`.
El siguiente paso es adaptar y probar un supervisor con timeout por trabajo,
SIGKILL y espera de salida antes de reinicio/cambio de circuito, sin mantener
los dos setups residentes a la vez. Después, replay real con consumidor EVM/H3
y medición prolongada antes de cambiar el modo del servicio.

## Supervisor del worker (31 de octubre de 2026)

`ProducerWorker` en `scripts/prover/worker.ts` mantiene un solo hijo. El caller
conserva la cola: las llamadas concurrentes se rechazan, sin cola interna.
Cada job tiene un timeout propio (15 min por defecto, validado al construir).
Timeout, AbortSignal, error de proceso, protocolo incorrecto o exceso de logs
provocan SIGKILL; el fallo no se devuelve hasta recibir `close` y limpiar
resultado/temporal. El siguiente intento puede crear otro proceso.

Al cambiar de circuito mata y espera el cierre del worker anterior antes de
arrancar el nuevo. `close()` es terminal, idempotente y espera también el job
activo. El aborto del job no lo proporciona automáticamente la desconexión HTTP:
la política actual de handlers desconectados se mantiene al integrar el servicio.
Los fallos son reintentables de operación; el supervisor no emite certificados
INVALID ni cambia el orden de resolución.

El protocolo actual exige `id` por trabajo (1–64 caracteres alfanuméricos,
`_` o `-`). La confirmación es `VENDETTA_WORKER_V2_DONE <id>`; el supervisor
usa UUIDs nuevos y rechaza confirmaciones duplicadas, ajenas o del protocolo
anterior sin id. Compilar un binario actual al usar este supervisor. Las líneas
partidas entre chunks se reconstruyen. stdout/stderr se drenan con presupuesto
agregado de 1 MiB por job; los logs no se conservan. El presupuesto de salida
sigue activo mientras el proceso está ocioso, hasta comenzar el siguiente job.

`prover:worker:profile` usa ahora ese supervisor y timeout por job. El informe
`worker-profile.json` anterior conserva su semántica histórica de timeout del
lote completo; no se ejecutó de nuevo proving pesado en este bloque. No se
integró aún el supervisor en el servicio HTTP: ése es el siguiente hito, junto
con replay real de ambos circuitos y H3. El supervisor no verifica por sí solo
el contenido de las pruebas; el productor debe conservar su validación de
statement/setup y comprobación con el consumidor antes de servir certificados.

Once tests con procesos Node reales cubren reutilización, cambios de circuito
con PID anterior muerto, crash, bloqueo/timeout, presupuesto renovado por job,
aborto, cierre, error de spawn, crash ocioso, confirmaciones tardías/duplicadas
y exceso de salida. Los tests de protocolo Go exigen id válido. No se modifican
circuitos, claves ni setups.

## Productor integrado con worker residente (31 de octubre de 2026)

El servicio genera nuevas pruebas mediante `ProducerWorker`: conserva un único
setup residente, reutiliza sus artefactos y espera la muerte del proceso antes
de cambiar de circuito. La inspección del paquete continúa en un subproceso
ligero sin CS/PK/VK. Ambos tienen el plazo `HIDDEN_PROVER_TIMEOUT_MS`; el plazo
del worker se renueva por job. Es necesario recompilar un binario actual que
implemente las confirmaciones con id. No hay fallback automático a un binario
anterior. El CLI nativo de una prueba sigue disponible para experimentos.

Se conservan la cola serial, deduplicación, retención de caché, autenticación,
cuotas y validación de setup/runtime/statement. Cada certificado se comprueba
con el consumidor desplegado; opening prepara y valida H3 antes de devolverlo.
Una desconexión HTTP no aborta la prueba ni libera prematuramente su presupuesto.

Los embedders deben usar `await producer.close()`: detiene admisiones/listener,
cierra conexiones, aborta y espera inspecciones, termina el worker y espera la
cola. Los trabajos ya en cola fallan antes de tocar RPC; no producen INVALID.
RPC/H3 ya iniciados pueden consumir su timeout antes de drenar. El journal H3
se conserva ante resultado ambiguo. `close()` es idempotente. La CLI lo conecta
a SIGINT/SIGTERM y errores del listener. El cierre externo del server también
libera el worker cuando se emite `close`, pero se recomienda la API del productor
para cerrar inmediatamente los trabajos pendientes.

Para terminar el grupo de procesos tras una muerte abrupta del padre, el entorno
de operación debe gestionar también sus hijos (p. ej. un cgroup de servicio).
El cierre ordenado del productor no cubre SIGKILL del padre ni pérdida de energía.
La estabilidad prolongada y esos fallos se evalúan en la etapa de resistencia.

```bash
HIDDEN_PROVER_BIN=/ruta/binario-actual \
HIDDEN_PROVER_KEYS=/ruta/keys \
SOLC_BIN=/ruta/solc-0.8.28 \
pnpm --filter @vendetta/web prover:worker:replay
```

El replay separado escribe en `worker-replay/`, sin sustituir resultados del
replay original o del lote de capacidad. Usa tres pruebas nuevas: apertura
válida recién cifrada, compromiso inválido y U inválido. Exige una reutilización
opening, dos procesos nativos en total y máximo uno a la vez. El timeout HTTP
de este benchmark secuencial es de 16 minutos por petición; no cambia los
plazos HTTP/keeper normales ni la semántica de sus reintentos. Prueba caché y
reconstrucción H3 después de revertir Anvil, y compara el World puntual/tardío.
Las firmas drand son auténticas archivadas; no mide disponibilidad remota.

Los resultados anteriores de capacidad y perfiles son históricos: el servicio
usaba subprocesos por prueba cuando se produjo `capacity/`. Una nueva ejecución
de `prover:capacity` usa el worker integrado; la secuencia de seis circuitos
cuenta procesos según las cargas frías registradas (la secuencia nominal usa
cuatro, con dos reutilizaciones opening). El resumen distingue CPU/RSS por
proceso residente de latencia por misión. Sus resultados no
se han regenerado en este bloque; no inferir nuevos tiempos de los antiguos.

### Recuperación ante fallos de transporte (31 de octubre de 2026)

El cliente beacon limita a 4 KiB el cuerpo recibido, sin depender de
Content-Length; el plazo de 15 segundos incluye la recepción del cuerpo.
HTTP fallido, cuerpo excesivo, lectura bloqueada o ronda incorrecta rechazan
el trabajo como fallo operativo reintentable. La forma de la respuesta se
comprueba en Node; la autenticidad criptográfica sigue siendo responsabilidad
del productor nativo. Ninguno de estos errores produce INVALID.

Pruebas reproducibles, con Foundry en PATH:

```bash
pnpm --filter @vendetta/web test -- test/producer-rpc.test.ts test/producer-beacon.test.ts
```

La prueba RPC usa Anvil real y un proxy HTTP que primero entrega la transacción
al nodo y luego pierde la respuesta. Ejecuta 16 ciclos con ocho trabajos
serializados fallidos por ciclo: 128 respuestas de envío perdidas y 128 consultas
de recibo rechazadas. Cada recuperación conserva el journal firmado, termina
con cola vacía y consume exactamente un nonce por ciclo (16 en total).
La prueba beacon usa un servidor HTTP local: cuatro trabajos por fallo y
recuperación entre errores 503, cuerpo excesivo, cuerpo bloqueado y ronda
incorrecta. No usa firmas auténticas ni proving.

Son pruebas acotadas de transporte/cola/journal, no carga de horas/días,
recuperación ante reorg ni evidencia nueva de H3/Groth16. La etapa 3 sigue
pendiente de carga prolongada representativa y fallos combinados con el
productor y consumidores reales, además de disponibilidad remota medida.

### Carga prolongada con proving real e inyección de fallos

```bash
# Usa las variables de binario/keys/solc anteriores; no genera setups.
pnpm --filter @vendetta/web prover:soak 3600
# Al terminar, sustituir la ruta por la carpeta fechada que creó el harness:
pnpm --filter @vendetta/web prover:soak:summary <carpeta>/soak-results.json
# Observación HTTPS independiente y de sólo lectura; exige un informe nuevo:
pnpm --filter @vendetta/web prover:probe:remotes 3600 <informe-nuevo.json>
```

`prover:soak` exige entre 3600 y 86400 segundos. Crea una carpeta nueva en
`worker-soak/<fecha>/` y reutiliza las claves existentes. Despliega los
consumidores reales y Game con Deploy.s.sol sobre Anvil privado. Admite seis
contextos distintos: dos paquetes válidos recién cifrados, dos compromisos
inválidos y dos puntos U inválidos. En este modo el helper Game simula primero
cada acción y envía con 12M de gas, para cubrir la reserva de drenaje sin depender
de estimaciones ajustadas. No cambia el contrato ni su consumo observado.

Antes de la carga inyecta seis rechazos RPC, tres rechazos de beacon y un envío
H3 ambiguo: el proxy entrega los bytes al nodo, pierde la respuesta y rechaza
consultas de recibo. Comprueba por RPC directo que la transacción se minó y que
el journal persiste; luego restaura el transporte, recupera el journal y prepara
H3. Después de cada episodio exige todas las misiones aún pendientes y cola
vacía. Las firmas drand archivadas auténticas se sirven por HTTP local y el
productor nativo las autentica; no se falsifica la decisión del circuito.

Tras obtener los seis certificados, elimina sólo el artefacto de prueba del
contexto elegido y vuelve a generar una prueba, con una petición HTTP duplicada.
Agrupa cuatro witnesses opening y dos invalid-point por vuelta para cubrir
reutilización caliente y cambios de circuito. Mantiene la carga hasta alcanzar
el tiempo mínimo, que incluye proving inicial y recuperación. Cada job conserva
el timeout de quince minutos y la barrera de salida del worker; se extiende sólo
el transporte HTTP del benchmark. Los últimos certificados de cada contexto se
consumen en EVM. Rechaza pruebas manipuladas/cruzadas y compara World completo
puntual/tardío tras revertir Anvil y reconstruir H3 desde la caché.

`soak-progress.json` registra iteraciones completadas durante la ejecución;
`soak-results.json` sólo se escribe si terminan las comprobaciones finales.
El muestreo de recursos cubre la carga inicial y las repeticiones; el resumen
separa tiempos de pruebas repetidas y CPU/RSS por proceso residente. No
extrapola misiones/hora: reprobar seis contextos no mide capacidad de admisión.
Los picos muestreados no son límites físicos ni demuestran ausencia de fugas.

`prover:probe:remotes` comprueba cada minuto `eth_chainId == 100` en
`https://rpc.gnosischain.com` y la firma archivada de la ronda drand 1001 en
`https://api.drand.sh`. Usa plazos de 15 segundos, sin retries RPC automáticos,
y conserva resultados parciales con `completed: false` hasta terminar. Rechaza
sobrescribir un informe existente antes de conectar. Es una observación puntual
de disponibilidad HTTPS, separada de Anvil: no prueba un Game remoto, recibos
H3 remotos ni latencia de publicación de rondas futuras.

La mezcla cubre ambos circuitos y categorías de validez, pero repite los mismos
seis contextos. Los fallos se inyectan antes del bucle sostenido. No cubre todos
los intercalados posibles, pérdida de energía ni muerte abrupta del padre;
transacciones atascadas/reorg y setup seguro/auditoría siguen siendo hitos
separados. Ningún fallo operativo autoriza INVALID.

### Política actual de settlement y reorg: alcance probado

El journal H3 mantiene un solo envío firmado sin resolver por signer/Game.
Ante un timeout o un nonce aparentemente consumido no prepara otra transacción
ni borra el journal: retransmite los bytes originales y sólo un recibo resuelve
ese envío. No hay reemplazo automático de tarifas. Esto prioriza conservar la
operación pendiente; una transacción atascada o reemplazada externamente puede
bloquear nuevos trabajos y requiere intervención. No usar el signer H3 fuera
del proceso ni borrar el journal para saltarse ese bloqueo.

`producer-settlement.test.ts` prueba con Anvil real cuatro plazos vencidos con
minería detenida y recuperación tras minar, conservando bytes/nonce. Otro
historial revierte una transacción ya minada antes de resolver el journal y
recupera el mismo hash en la nueva cadena. Son transacciones de prueba simples,
no un nuevo replay de reorg contra contratos H3; usan plazos cortos explícitos.
Un recibo exitoso es una observación de inclusión, no una garantía de finalidad.

`CiphertextIndex`, compartido por cliente y keeper, fija el hash del último
bloque escaneado. Comprueba ese checkpoint incluso al pedir una misión ya
cacheada. Una cadena acortada o un hash distinto vacían el índice y lo reconstruyen
desde el bloque de despliegue, por rangos de hasta 5000 bloques. Durante cada
rango comprueba los hashes del checkpoint y del extremo consultado antes de
incorporar logs. Si detecta una reorganización en esa consulta, rechaza la
lectura y exige reintento. Las búsquedas concurrentes comparten el escaneo.
Esto asume un RPC coherente; no demuestra finalidad ni detecta cualquier
respuesta inconsistente de un conjunto de RPCs adversarios.

`ciphertext-reorg.test.ts` usa un emisor EVM mínimo del evento canónico para
probar forks más cortos, forks de igual altura con el mismo id de misión y
cambios de rama durante la consulta de logs. No modifica ni simula la máquina
de estados Game. Los certificados siguen vinculados al contexto que lee el
productor y que comprueba el consumidor en la cadena actual.

El keeper también usa un journal, con carpeta persistente configurable mediante
`KEEPER_STATE_DIR` (por defecto `$XDG_STATE_HOME/vendetta/keeper` o
`~/.local/state/vendetta/keeper`), RPC
con plazo de 15 segundos y espera de recibo de 60 segundos. Antes de leer estado
al comenzar un tick resuelve cualquier envío pendiente; antes de firmar otra
acción vuelve a comprobarlo y simula la acción nueva. Usa 12M de gas para cubrir
la reserva de drenaje; sólo se cobra el gas consumido. No se ejecutan envíos
concurrentes con el mismo journal. Los ficheros se crean privados y el directorio
está fuera del árbol web; los launchers locales usan carpetas temporales distintas
por cadena nueva. `.keeper-state/` también queda ignorado si se configura
explícitamente una ruta local con ese nombre. El estado de un despliegue persistente
debe conservarse entre reinicios y pertenecer
a un solo proceso con signer dedicado.

El historial de reinicio del keeper usa transacciones Anvil simples: conserva
bytes/nonce durante minería detenida, impide preparar la acción siguiente hasta
resolver la anterior y luego permite el nonce siguiente. Prueba el adaptador de
settlement, no un nuevo replay del CLI contra Game. Un status de recibo ajeno a
success/reverted conserva el journal y falla; no se trata como revert confirmado.

`keeper-reorg.test.ts` ejecuta el CLI real y Game con un productor/consumidor
mock explícito: pierde el recibo de una evidencia minada, revierte la cadena y
sustituye la admisión por otro packet con el mismo id. El journal retransmite
el certificado anterior, que revierte contra el contexto nuevo; luego el índice
relee los logs canónicos, el keeper consigue el certificado nuevo y el World
completo coincide con el modelo TS. Esta prueba es de recuperación operativa,
no de criptografía/H3; el replay real de productor cubre éstos por separado.

Política para nonce reemplazado externamente: conservar el journal y bloquear
acciones nuevas de ese signer. No reinterpretar `nonce too low` como éxito ni
borrar el archivo para continuar. Si el nonce no puede confirmarse, el operador
detiene el proceso afectado, preserva su journal y configura otro signer dedicado
con fondos y directorio persistente. El nombre del journal incluye el signer:
la instancia nueva empieza desde el estado canónico con un archivo distinto.
El viejo se conserva para diagnóstico y no se ejecutan dos procesos sobre el
mismo archivo. La prueba Anvil de reemplazo mina una transacción distinta con
el mismo nonce, comprueba el bloqueo del journal original y el progreso con
otro signer sin borrar el anterior. Es recuperación manual explícita, no
reemplazo automático de fees ni garantía de finalidad. Las llamadas del keeper
son permissionless y la evidencia sólo puede consumirse una vez; una petición
obsoleta revierte o deja el recibo consumido sin una segunda ejecución.
Para el journal H3 se aplica el mismo procedimiento conservador: detener el
productor, conservar caché/journal y configurar otro `HIDDEN_H3_PRIVATE_KEY`
dedicado y fondeado. Su nombre también incluye el signer, por lo que la nueva
instancia vuelve a leer el progreso H3 canónico con un journal distinto; no
elimina el anterior ni reutiliza su nonce. La rotación no requiere cambiar Game
o consumidores, cuyas operaciones de preparación son permissionless.

### Frontera de fixtures e2e

Los tests Playwright de flujo/Backlog aportan evidencia explícita mediante
`apps/web/e2e/test-evidence.ts` al consumidor mock de `DeployTest.s.sol`. El
helper verifica chain id 31337, RPC loopback fijo y bytecode de ambos consumidores
antes de enviar. Usa los drafts privados que el navegador de prueba acaba de
guardar, comprueba sus compromisos y prepara certificados del mock; no genera
Groth16 ni consulta un beacon futuro. Después el cliente debe drenar las misiones
certificadas y leer informes reales de Game. No se integra este helper en la
app, el keeper ni Deploy.s.sol. Los resultados de proving real se registran
separadamente en el soak.

El servidor e2e no arranca un keeper sin proveedor. AA/dev-local sólo lo arrancan
con HIDDEN_PROVER_URL explícito y token; en otro caso las misiones ocultas siguen
pendientes. Cada stack privado nuevo usa su propio directorio temporal de
journals fuera de la raíz estática. Un despliegue persistente conserva el suyo;
no se reutiliza el journal de una cadena Anvil descartada.

### Previsión detenida en la frontera

La revisión e2e del candidato detectó que forecastAttack podía repetir processDue
indefinidamente cuando un head oculto no certificado precedía al ataque
hipotético. La previsión ahora retorna null cuando no hay progreso. No predice
más allá de evidencia pendiente, no cambia World y vuelve a funcionar tras
certificación; una misión oculta posterior no impide una batalla anterior.
Es lógica exclusivamente cliente, sin contraparte Solidity ni cambio de la
máquina de estados. La regresión vive en packages/rules/test/sim.test.ts y los
cinco flujos Playwright estándar volvieron a pasar.

El [candidato local del 31/10](local-candidate/README.md) reúne los checks finales,
la política de recuperación y sus límites. Cierra las etapas locales 1–5;
producción mantiene su hito separado de setup seguro, auditoría/correcciones y
validación operativa real. Los contadores originales y cada benchmark previo
conservan su alcance/fecha, sin sobrescribirse.

Para un replay con nuevas claves experimentales, `HIDDEN_PROVER_EVIDENCE_DIR`
puede fijar un directorio absoluto **nuevo** para los resultados. Se rechaza
una ruta relativa o existente; así se conservan las evidencias históricas.
`HIDDEN_PROVER_KEYS` debe apuntar al nuevo conjunto de claves y el replay sigue
usando exclusivamente Anvil privado. Esta opción no ejecuta una nueva prueba
por sí misma ni habilita setups de producción.
