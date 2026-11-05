# Continuidad de sesión: hidden v2

## Trabajo local completado: 5 de noviembre, 05:32:46 UTC

**No quedan workers/controladores de este ensayo activos.** Sesión16383
terminó sequence-complete y watcher1897 terminó replay-complete. Los PID y
celdas de monitor del historial ya no están activos. No repetir setup, FFT,
contribuciones ni pruebas reales por defecto: el recorrido local solicitado
está completo. Producción sigue bloqueada por trabajo externo/revisión.

Resultado concreto:

- Ambos circuitos completaron ambas fases del MPC local en esta PC, con dos
  contribuciones verificadas por fase, sellados y nuevas PK/VK/Verifier.sol.
- Inicialización opening v6: **2,92 GiB**, 5h8min22,786s; verify fase2 ~5,00GiB;
  exportación optimizada v7 ~4,54GiB. El pico histórico fase1 ~8,43GiB sigue
  siendo distinto: no afirmar que todo el protocolo usa sólo2,92GiB.
- **Tres pruebas reales nuevas** (opening válido, compromiso inválido,
  invalid-U), productor HTTP, verificadores/consumidores Solidity, Game/H3.
  `punctualAndDelayedFullWorldEqual=true`, proof cache rechecked, H3 restaurado
  tras Anvil revert, intentos manipulados/entre misiones rechazados.
- Replay batch **642786,668ms**; pico nativo muestreado **6249586688 bytes
  (~5,82GiB)**, Node142241792 bytes, peakNativeProcesses=1. Go5/GOGC25/threads4.
  RSS muestreado cada1s: no es techo ni prueba de carga prolongada.
- Validación código final: 149 eventos Go /4paquetes, 31 Python, vet, binaries
  v6/v7 reproducidos offline idénticos. Race no disponible sin cgo/CC.
- Sin despliegue real, cambios de hardware/swap ni cierre de otros servidores.
  unsafeLocalSetup=true, beacons fijos conocidos y productionApproved=false.

Evidencia final legible en
`docs/benchmarks/timelock-opening/local-mpc-staged/README.md` y completed-results.json;
raw results.json/worker-results.json del replay se copiaron como replay-results.json
y replay-worker-results.json. Incluyen digests y rutas a las tres pruebas reales
externas, manifests nuevos y runtime hashes de verificadores. Los outputs grandes
siguen fuera de Git y los setups/recibos anteriores permanecen intactos.

Claves opening finales:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run3/23-phase2-keys/public/`;
manifest SHA e1c210611c3c110ff45027f7fc7f2459c2b065ee3ffcb3a1b9ed38a4dfcc1455.
Claves invalid-point finales en local-mpc-sequence-20261104-run2/22-phase2-keys/public,
manifest c4798b4f3ddc81c535c680a420b437fec9107ea007bc5c39c9504ff86a13a2c8.
Reporte íntegro externo del replay:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-replay-20261105-run3/evidence/`.
replay.jsonl final fija result SHA
69f7623dd69f3a38a2504a4acdd38d6a776d49f96c1f7ce229ac30aa0a14c01a
y worker-result SHA
88b101457ff6684ba68556bbf60bf16f7c6b5d40b3787cde75f79d1ffdbe0755.

Siguiente frontera: revisión independiente de adaptadores, participantes reales,
cierre/beacon impredecible y procedencia/aprobación segura; no fabricar esa evidencia
ni declarar seguros estos artefactos locales. El usuario no autorizó publicar/desplegar
una red real ni enviar mensajes a participantes. Todo lo local factible de este
recorrido quedó cerrado sin necesitar una compra de RAM ni otra PC.

## Continuación local: preparación de revisión, 5 de noviembre de 2026

Se tomó como base el cierre de las 05:32:46 UTC anterior, no los estados ACTIVO
históricos. No se repitieron MPC, FFT, setup ni pruebas Groth16; no se modificaron
los artefactos existentes. La siguiente frontera es revisión independiente y
procedencia segura, no otra medición local de ese mismo recorrido.

Trabajo local nuevo completado:

- `pnpm check:evidence-hidden-v2` comprueba un resumen fijado externamente por
  SHA-256, las tres copias de informes, referencias a manifests, aserciones del
  replay y métricas. `--originals` también coteja informes y tres proof JSON
  externos por hash y metadatos. Lectura acotada a 2 MiB/JSON, sin escribir en
  evidencia, leer claves/transcripts ni ejecutar criptografía. Se ejecutaron
  ambos modos contra la evidencia final y pasaron.
- Pin del resumen existente: `1ad3b946d00bb9fa6f0ee1fc85afac2601bc0b9cd0c4e8e93ae5cf6279caf645`.
  El resultado se llama archived-local-evidence-consistent; nunca aprobación,
  verificación criptográfica nueva o autenticidad independiente.
- [Preparación de revisión](hidden-v2-review-preparation.md): entradas concretas
  y fronteras de los adaptadores, procedimiento de congelación y decisiones
  externas imprescindibles. Producción/readiness ahora separa resultado vigente
  e instrucciones históricas; no usar sus secciones antiguas para relanzar MPC.
- Cinco tests nuevos, incluidos seis subcasos de alteración, verifican rechazo
  de pins/copias/setup/statement/métricas sustituidos, alcance inseguro eliminado,
  inventario inesperado, metadatos de proof cambiados, JSON duplicado/sobredimensionado
  y archivos no regulares. Cinco tests del empaquetador también pasaron.
  Prettier y git diff --check aprobados. No cambió la implementación del juego,
  contratos o circuitos; no se repitieron sus suites pesadas.

Se actualizó el inventario de fuentes del benchmark, conservando los resultados
raw, manifests de claves y pins anteriores. Nuevo bundle de fuentes y receipt
fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-review-preparation/`.
El receipt conserva digest/número de fuentes y resultado del cotejo externo;
no representa aprobación. Entregas de lanzamiento y cierres anteriores intactos.

Falta decisión externa: identidad/alcance de revisores independientes, participantes
reales, publicación autenticada del cierre y beacon futuro, autoridad/política de
aprobación de procedencia (quórum/vigencia/revocación/bindings), y carga/presupuesto
operativo objetivo. No se inventó esa autoridad para habilitar manifests seguros.
El importador/registro de producción debe implementarse contra esa política y
pasar revisión; las firmas design-review-only no la sustituyen. Producción sigue
bloqueada. Sin publicaciones, contactos, commits ni despliegues reales.

## Historial de ejecución (todos los estados ACTIVO inferiores ya vencieron)

## MPC completo y replay histórico (ya terminó)

**Los dos dominios completaron ambas fases del MPC local.** Opening terminó
extracción a las **05:21:11 UTC del 5/11**. No repetir contribuciones ni setup.
Nuevas claves opening:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run3/23-phase2-keys/public/`.
Manifest SHA-256 `e1c210611c3c110ff45027f7fc7f2459c2b065ee3ffcb3a1b9ed38a4dfcc1455`;
PK `1d86e86939e4404c3c82d8b73cbe7444665914abbc6ab9977c3fd58bbb0dcf05`;
VK `10a9f756efb0bfe85d2a12abca3461be6eec02ac7aa03f1688ccdbffb6e590c4`;
Verifier.sol `5bcd76e107a434e642d3547527c44f1bf30b6aed81a93eff71a21f76d19bb41c`.

V7 secuencia sesión16383 ya terminó con sequence-complete. Opening: primera
contribución 487584ms/RSS2000293888; verify1 172532ms/RSS5370855424;
verify2 166578ms/RSS5369675776; sellado 698594ms/RSS4877393920 (~4,54GiB).
Todas sus contribuciones/verificaciones nativas y sellado pasaron. El pico de
la verificación es ~5,00GiB, dentro del perfil observado5,5. Init completa v6
pico2,92GiB; no confundir con el pico histórico fase1 de ~8,43GiB.

**Watcher/replay sesión1897 ACTIVO**, tool monitor **g2:512**:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-replay-20261105-run3/`.
replay.jsonl ya tiene replay-start a las **05:21:43 UTC**; fuente508 y herramientas
comprobadas, manifests opening e1c210... e invalid-point c4798... validados.
GoMemory5GiB/GOGC25/threads4, Anvil privado, evidencia nueva independiente.
`run.txt` llegó a `stage: real certificate valid-fresh-packet-round-1001-max-salt`.
Último productor nativo PID1899824, leyendo/probando primera petición (~2,9GiB
RSS observado inicial; no pico final). Hay que esperar y resolver lo que falle,
no finalizar antes de comprobar pruebas/consumidores/Game/H3/WorldEqual.
`certificate request will retry: ResolutionInvalidContext` previo es una
comprobación esperada del escenario, no declarar por esa línea que falló.

Las claves siguen unsafeLocalSetup=true, beacons fijos conocidos,
productionApproved=false. No despliegue real ni aprobación independiente.
Copias de informes/meta de todas las etapas v7 en el benchmark local-mpc-staged,
con digests originales en v7-opening-records.json.

## Historial de continuación v7 (MPC completo; sólo replay sigue activo): 5 de noviembre, fase 2 de opening

**Secuencia activa sesión 16383**, watcher activo **1897**:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run3/sequence.jsonl`
y `local-mpc-staged-replay-20261105-run3/replay.jsonl` bajo el mismo padre.
Primer worker de contribución arrancó **04:46:06 UTC**, PID **1844007**.
Reutiliza por hashes claves22, commons23 y la inicialización23 completa de v6:
metadata SHA-256 `f23056da6aac64466512dea6496a098dbdb5562b208ff4d326a9c8f9de0f0675`.
`run3/23-phase2-init` enlaza a run2/23-phase2-init. **NO repetir Initialize/FFT.**

Herramientas congeladas:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-20261105-v7-tools/`.
Binario pipeline-v7 SHA-256
`e7d920d4c1f3b676740dc52d2e0a6ba1f9d17ec3e5409e4e8456bb362a88af3e`;
source-v7-at-launch.tar.gz SHA-256
`abfb7f58e5f6d46b6caeeffda9654d1a3d681c745f679572edf1c02d9a3cc401`.
Reproducción offline idéntica en reproduction-v7.json; argv/pins completos en
sequence-v7-launch.json y replay-v7-launch.json. **508 fuentes ejecutables**
comprobadas. Código no debe cambiar sin nueva congelación/reprogramación de
watcher. Documentación puede avanzar.

V7 ya integra los 11 archivos propios del prototipo, validado en árbol real:
**149 eventos Go / 4 paquetes, 31 Python y vet aprobados**. Sellado filtra
A/B/B2 en buffers propios; conserva contribución beacon y construcción de
campos restantes con código nativo. Comparación exacta de PK/VK contra
VerifyPhase2 nativo y pruebas reales positivas/negativas, con/sin compromisos.
Preflight10 para estas etapas; Go5, AS10 y RSS observado5,5 cada100ms; piso
host4. Watcher usa Go5/GOGC25/threads4, preflight10, AS14 y mismo piso host4.
Son objetivos/observaciones de memoria, no cuotas kernel de RSS. La prueba
completa Game/H3 con las dos nuevas claves sigue pendiente de terminar fase2.

V6 y watcher anterior ya terminaron después de completar Initialize; interrupción
intencional de su controlador mientras esperaba12GiB. No reutilizar sus sesiones.
Todos los archivos viejos se conservan. No se cerró el servidor del otro proyecto,
ni se cambió swap/hardware/configuración del equipo. Continuar sin preguntar sigue.

## Resultado completo de inicialización v6 (conservado)

**Opening 2²³ completó la inicialización entera en esta PC.** Reporte:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run2/23-phase2-init/report.json`.
Status phase2-initialized, exited=true, MaxRSS **3.132.063.744 bytes (~2,92 GiB)**,
wall **18.502.786 ms = 5 h 8 min 22,786 s**. CPU user 57.396.239 ms,
system 270.723 ms. Las cuatro FFT, acumuladores, initial.bin y evaluations.bin
están completos; no repetirlos. Toda la inicialización usó adaptador v6,
AS 10 GiB / Go target4/GOGC25 y piso host4. No se cambió swap ni hardware.

V6 se quedó esperando 12 GiB antes de contribuir; había ~10,35 GiB. Se paró
**sólo el controlador en espera**, después de confirmar worker 1337214 salido.
Sesión 3212 termina por interrupción intencional; watcher 9219 verá sequence-stopped
y terminará sin usar claves parciales. No están activos para continuar etapas.

Se adoptaron los **11 archivos propios** del plan selectivo del prototipo,
comprobando antes todos sus hashes base v6 y propuestos. Recibo externo:
`.../local-mpc-staged-seal-20261105-prototype/adoption-v7.json`.
Ahora el repo incluye `mpcstaged.Seal` con filtrado en buffers, preflight10,
Go5/RSS observado5,5 para contribución/verificación/sellado, y reanudación desde
inicialización terminada. El replay local usa Go5/GOGC25 y preflight10. Ningún
archivo de setup anterior se reemplaza. No hay todavía claves opening ni replay
final con ambos juegos nuevos. La seguridad de producción sigue bloqueada.

Validación del código adoptado: 4 paquetes / **149 eventos Go**, **31 tests
Python**, vet aprobados en copia aislada; repetir checks pertinentes del árbol
real, congelar nuevas fuentes/binario **v7**, comprobar reproducción y lanzar
nuevo controlador con keys22 + commons23 + **--resume-initialization23** (stage
v6 completo) y pin de phase2-init.json. Watcher nuevo con archivo fuente v7.
No usar --resume-cache ni volver a ejecutar Initialize para esta continuación.
Las copias públicas del informe/info/checkpoints de v6 están en
`docs/benchmarks/timelock-opening/local-mpc-staged/`.

## Historial v6 (inicialización completada; controlador ya detenido)

## Ejecución v6 histórica: 5 de noviembre, 02:31 Arabia

**Secuencia activa sesión 3212**, watcher activo **9219**. Estado:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run2/sequence.jsonl`;
replay en `local-mpc-staged-replay-20261105-run2/replay.jsonl` bajo el mismo padre.
La secuencia esperó margen de 10 GiB y arrancó el worker a las **23:31:10 UTC**
del 4 de noviembre. Worker PID **1337214**. Reutiliza claves22, sellado23 y
cache z index-01 autenticada del intento staged run1. No interrumpir para
repetir etapas ni para aplicar ajustes opcionales mientras esté calculando.

Herramientas:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-20261105-v6-tools/`.
Binario pipeline-v6 SHA-256
`7168c4854ea52665d96ab9e0933b3328708bc1885c8305ff45f6170605c325b1`;
source-v6-at-launch.tar.gz SHA-256
`57f67bd53b9f799766cf04c5ee2386bb054e857c857fcdaa56ad11b32e6c57d5`.
Reconstrucción offline idéntica y comandos/pins en reproduction-v6.json,
sequence-v6-launch.json y replay-v6-launch.json. 506 fuentes ejecutables
comprobadas tras el arranque; código actual coincide exactamente con v6.

Perfil realmente activo: tabla inversa única, Go target **4 GiB**, GOGC=25,
AS 10 GiB, preflight inicial 10 GiB y piso host 4 GiB; las etapas posteriores
mantienen preflight 12 GiB. Se consideró un perfil de 9 GiB/techo RSS 4,5 GiB,
pero **no se aplicó**: el worker arrancó solo mientras se preparaba. No anunciar
ese perfil como activo. Propuesta no lanzada preservada fuera de Git en tools,
sin cambios al código congelado.

**Primera FFT v6 terminada y cacheada a las 00:30:37 UTC**, tras empezar a
las 23:34:47 UTC (55 min 50 s incluyendo persistencia). El worker continúa en
`accumulate-start-tau1`. MaxRSS hasta ese checkpoint: 2.958.163.968 bytes
(~2,75 GiB); no es el pico final del circuito. Índice recuperable más nuevo:
`run2/23-phase2-init/public/staged-cache/index-02.json` bajo el root staged,
SHA-256 `50084422534811d744eb3b6e9b3899704bd4fde61946f4bd827a94816a54a0d6`.
Contiene z del run1 y lagrange-tau1 del run2. Si hay un corte posterior, usar
el último índice PUBLICADO con pin en checkpoints, sin repetir esa FFT.
Evidencia pública v6-first-fft-observation.json / v6-first-fft-index.json.

**Primera pasada completa**, índices 03/04/05 para A/B/C guardados a
00:38:26/27/28 UTC. Índice 05 SHA-256
`c4e6d79f06e51123fc876f0fa80fe896419883321eda3bfb3605815a5bd1870e`.
Pico hasta esa pasada: 3.017.117.696 bytes (~2,81 GiB). Después empezó
`fft-start-alpha` a las 00:40:09 UTC. Observación temprana de alpha:
RSS ~1,96 GiB; inicialización completa aún pendiente. Revisar siempre los
últimos checkpoints, porque pueden haber avanzado desde esta nota.

**Avance más reciente:** las tres FFT G1 y sus acumuladores están completos.
Beta empezó a las 01:39:58 UTC, quedó cacheada a las 02:35:56; K final guardado
a las 02:41:06. Último índice COMPLETO publicado:
`run2/23-phase2-init/public/staged-cache/index-09.json`, SHA-256
`37912145ae622a9585f181cd8568d3c714f84b513b51831721a1eaa601c82b15`.
G2 se leyó/validó de 02:41:06 a 02:55:34 UTC; **`fft-start-tau2` activo desde
02:55:34 UTC**. RSS inicial de esa FFT ~2,18 GiB, pico hasta entonces
3.017.117.696 bytes (~2,81 GiB). Inicialización completa aún pendiente.
Monitor de progreso activo en tool cell **g2:489** (si termina el bucle, iniciar
otro monitor; no confundirlo con el worker/sesiones de cálculo). PID 1337214
continúa siendo el worker. Los artefactos completos anteriores no se repiten.

## Historial de preparación aislada (ya adoptada y congelada en v7)

Mientras v6 calcula, se preparó una optimización adicional fuera del repo en:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-seal-20261105-prototype/source/`.
No modifica fuentes/binary/controladores v6 activos. El inventario activo sigue
siendo exactamente el congelado en source-v6-at-launch.tar.gz.

- Nuevo `mpcstaged/seal.go`: filtra A/B/B2 en sus buffers originales y usa
  `Phase2.Seal` nativo para beacon, estado, dominio, compromisos y VK; repone
  las mismas flags/vectores en PK. Evita las tres copias nativas de esos
  vectores (~1,64 GiB de payload en opening). Es otro adaptador experimental,
  no una llamada Seal nativa sin cambios. Claves serializadas iguales contra
  VerifyPhase2 nativo y pruebas reales positivas/negativas en 0/1/2 compromisos.
- 42 eventos Go del paquete con casos de forma/máscara inválida rechazados
  antes de actualizar p; 67 eventos de paquete+procesos aprobados al integrar
  el helper en el CLI aislado. Logs tests-with-negatives.jsonl/process-tests.jsonl
  en el directorio padre del prototipo. No se ejecutó otro worker grande.
- CLI/controlador aislados preparan preflight **10 GiB** para contribución,
  verificación y sellado fase 2, Go target 5 GiB y RSS observado 5,5 GiB
  (cada 100 ms), manteniendo el piso host de 4 GiB. El preflight activo v6
  para estas etapas sigue siendo **12 GiB**. Validar este perfil en dominio
  grande antes de afirmar capacidad; límites muestreados no son cuotas kernel.
- Controlador aislado acepta `--resume-initialization23` +
  `--resume-initialization23-sha256` junto con commons23/keys22. Valida metadata,
  contexto y ambos cuerpos de la inicialización, la enlaza en el nuevo run y
  empieza directamente con contribución fase 2. 17 tests Python locales de
  secuencia/replay del prototipo aprobados (incluida sustitución de cuerpos/contexto).
- Watcher aislado preparado con preflight 10 GiB y env PROVER_MEMORY=5GiB,
  GOGC=25 (service.ts propaga ambos al worker). Conserva AS14/CPU/wall y piso
  global4. Es configuración pendiente de medición, no afirmar capacidad nueva.
  Pruebas de espera de memoria actualizadas; 17 tests locales siguen pasando.
- `selective-adoption-plan.json` en el padre del prototipo enumera **11 archivos**
  con hashes base v6 y propuestos. Usarlo para comprobar todos los originales
  antes de copiar sólo esos archivos. El mapa incluye los dos scripts/tests
  de replay; no importar documentos u otras fuentes antiguas de todo el shadow.

Si v6 termina inicialización pero espera indefinidamente margen de 12 GiB,
esta preparación permite continuar sin repetir inicialización ni FFT. Sólo
interrumpir el controlador cuando no haya worker en ejecución; aplicar/adaptar
estos archivos al repo, completar tests/vet, congelar nueva versión con archivo
fuente reproducido y reprogramar watcher. No importar todos los archivos del
shadow indiscriminadamente: contiene una copia completa del archivo v6 anterior.
Comparar y copiar sólo cambios propios enumerados. Si v6 avanza sin bloqueo,
no interrumpir cálculos completables para aplicar la optimización opcional.

## Segundo ajuste de memoria: v6 preparado (5 de noviembre)

**V5 y su watcher terminaron**, sesiones 21151/62351. La inicialización staged
fue cortada por presión del host tras 42 min 30,965 s; MaxRSS
4.801.347.584 bytes (~4,47 GiB). El evento `memory-stop` prueba MemAvailable
4.249.939.968 bytes (<4 GiB) y RSS 4.801.982.464 bytes. El campo failure final
v5 fue sobreescrito por una carrera de observación al salir; conservarlo intacto,
interpretarlo junto con el evento. V6 conserva la primera causa de parada.

Cache reutilizable: sólo `z` (la primera FFT aún no terminó), índice
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run1/23-phase2-init/public/staged-cache/index-01.json`,
SHA-256 `ae7f9aa2c09c46a01c4cb2542532c4f4b906d42097f83a1110745e12aee57471`.
No afirmar que se guardó la tabla FFT: esa parte sí debe recalcularse.

V6 evita tres tablas auxiliares no usadas por la FFT inversa (forward y dos
cosets, ~768 MiB en opening). Construye sólo los twiddles inversos con la
misma fórmula y BuildExpTable nativa; comparación exacta de tablas hasta dominio
16384, y bytes exactos de inicialización/claves y pruebas reales en circuitos
pequeños. Target Go 4 GiB/GOGC=25 para staged, AS 10 GiB; preflight staged
10 GiB, piso del host 4 GiB. Las etapas posteriores mantienen preflight 12 GiB.

V6: 4 paquetes/143 eventos Go aprobados; 30 Python; vet aprobado. Race no
pudo ejecutarse por falta de cgo/CC; no se instaló nada. Evidencia v6 en
`docs/benchmarks/timelock-opening/local-mpc-staged/`. Aún no hay medida de
finalización del opening completo. Congelar binario/fuentes v6 y reanudar con
commons23 y la caché z autenticada en otro directorio; watcher nuevo.

## Historial v5 (terminado)

## Ejecución optimizada arrancada: 5 de noviembre (22:41 UTC del día 4)

**Secuencia v5 histórica, terminada**, sesión **21151**, estado:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run1/sequence.jsonl`.
Reutilizó y validó las claves22 y el commons23 sellado. Inicialización staged,
dos contribuciones/verificaciones de fase 2 y extracción de claves en serie;
`--wait-for-memory` espera tres muestras >=12 GiB antes de cada etapa.
No repetir fase 1. Inicio de secuencia a las 22:41:32 UTC / 01:41:32 Arabia.
Worker phase2-init arrancó a las 22:41:55 UTC: supervisor PID 1151737,
worker PID 1151743. Última observación temprana: ~2,5 min activos,
RSS ~3,05 GiB durante read-powers-tau1; no es el pico final.
Consultar último evento y heartbeat antes de inferir si está calculando o
esperando memoria. **Todavía sin medida final del dominio opening.**

**Watcher v5 histórico, terminado**, sesión **62351**:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-replay-20261105-run1/replay.jsonl`.
Esperará sequence-complete; después valida fuentes/herramientas y ambos juegos
de claves y ejecuta Game/H3. Si la secuencia falla, no usa resultados parciales.

Herramientas congeladas:
`/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-20261105-tools/`.
`pipeline-v5` SHA-256
`196e7497e1da023aeb0a90940ff4d522bcf45b4eef281dc0041dd0b9a78c0c42`;
archivo `source-v5-at-launch.tar.gz` SHA-256
`90e23dc01eb627a84bb0f66cbbd70f246d0bb18ae5f91af198637a183790e195`.
Reconstrucción offline desde ese archivo dio el mismo hash binario:
`reproduction-v5.json`. Comandos y pins completos en sequence-v5-launch.json
y replay-v5-launch.json. Watcher comprobó previamente 506 fuentes ejecutables.
No modificar código sin congelar/reprogramar el watcher. Docs pueden avanzar.

Si el worker se corta, conservar caches y localizar el último `index-NN.json`
publicado en `23-phase2-init/public/staged-cache/`; verificar su pin contra
checkpoints.jsonl y usar los flags de reanudación en otra ejecución exclusiva.
No volver a declarar como activos los controladores v4 del historial.

## Implementación y validación de la optimización: 5 de noviembre, adaptador por etapas

El usuario autorizó implementar la ruta de menor memoria. Nuevo paquete
`apps/web/scripts/experiments/opening-zk/mpcstaged/`: FFT aritméticamente derivada
de gnark v0.16.4, acumulación por pasadas y cachés públicas con hashes. Es un
**adaptador experimental**, no la llamada nativa Initialize sin cambios.

Validación terminada: 4 paquetes Go / 134 eventos de test aprobados, 30 tests
Python aprobados, vet aprobado. Compara bytes de inicialización/evaluaciones y
claves finales contra gnark nativo, con 0/1/2 compromisos y varios tamaños;
pruebas Groth16 positivas y negativas, cortes tras cada uno de los 11 guardados,
reanudación de caché completa en proceso separado y cachés alteradas rechazadas.
Evidencia pública `docs/benchmarks/timelock-opening/local-mpc-staged/`.

Flags nuevos: `phase2-init --staged-initialization`; para recuperar un corte,
`--resume-cache /ruta/index-NN.json --resume-cache-sha256 PIN` en **otro**
directorio nuevo. El índice vincula algoritmo, CS, commons y cada vector. Nunca
sobrescribir directorios/cachés/binaries. Las tablas FFT terminadas se guardan
antes de acumular: un corte posterior ya no obliga a repetir ese cálculo.

El sellado usa ahora `mpcstream.ReadSealCommons`, que conserva sólo los campos
que Phase2.Seal nativo lee. Las comparaciones de claves exactas y los tests de
procesos usan esta lectura reducida. No usar ese commons parcial en Initialize
ni en fase 1. Preflight fase 2 optimizada: 12 GiB disponibles, mismo piso de
presión 4 GiB. Inicialización por etapas y sellado: AS 10 GiB, Go target 5 GiB;
contribución/verificación fase 2: AS 10 GiB, Go target 7 GiB. CPU/wall y límites
de archivos siguen acotados. Todavía no se midió el pico del dominio opening.

Controladores actualizados pueden esperar 3 muestras seguidas de margen de
memoria antes de cada etapa (máximo 48 h activas), en vez de crear un intento
fallido cuando otro proceso ocupa memoria. `--wait-for-memory` requiere la
reanudación desde commons23. El watcher también espera margen de 12 GiB antes
del replay, revalida herramientas/fuentes/claves después de esperar y conserva
su parada bajo presión del host. No se paran otros procesos del usuario.

La ejecución v5 indicada arriba congela herramientas/fuentes nuevas, reutiliza
claves22 y run3/23-seal y empieza fase 2 con el flag staged y un watcher nuevo. Los controladores v4 del historial **terminaron**. No reutilizar sus
sesiones como si estuvieran activas. Actualizar esta sección tras el arranque.

## Estado comprobado: 5 de noviembre, ejecución detenida

**No hay un worker ni replay automático activo.** Run3 se detuvo el
4 de noviembre a las 22:16:48 UTC durante `23-phase2-init`, después de
12.363.595 ms (3 h 26 min 3,595 s). El watcher terminó a las 22:16:50 UTC
sin usar claves parciales. Los PID/sesiones indicados en el historial inferior
ya no están activos.

El informe v4 dice `sampled-memory-budget-exceeded`, pero ese binario usa
el mismo mensaje para RSS >10,5 GiB, fallo de lectura de memoria del host y
MemAvailable <4 GiB. Su máximo RSS fue 8.594.599.936 bytes (~8,00 GiB),
por debajo del límite. El último heartbeat, cuatro segundos antes del corte,
tenía 4.464.144.384 bytes disponibles (~4,16 GiB). La presión de memoria
del host es la explicación probable; el informe no permite distinguirla
con certeza de un fallo de observación. No hubo resultado criptográfico
ni caché de inicialización persistida. Informe original intacto y copia
`local-mpc-pipeline/phase2-init23-v4-failed-report.json`.

Cambios preparados, todavía **sin nueva ejecución grande** (tests Go del
paquete y vet aprobados; 11 tests Python de secuencia/replay aprobados):

- El supervisor distingue presión del host, observación fallida y exceso
  del RSS del proceso, y registra la muestra que provoca el corte.
- `scripts/hidden-v2-local-sequence.py` acepta `--resume-commons23` y
  `--resume-commons23-sha256`, junto con los dos argumentos `--resume-keys22`.
  Valida hashes del commons y de todas las claves de invalid-point; empieza
  directamente en `phase2-init` de opening. No repetir fase 1 ni dominio 22.
- La inicialización nativa no tiene checkpoint intermedio: esa etapa fallida
  sí debe recalcularse. No se modificó la matemática criptográfica.

En la comprobación inicial del día 5 había ~12 GiB disponibles, por debajo
del preflight de 14,5 GiB. **No iniciar otro intento hasta disponer de
ese margen**, o hasta implementar y validar una alternativa que use menos
memoria. No matar otros procesos del usuario ni modificar swap/configuración
para forzarlo. Conservar los outputs, binarios y recibos anteriores.
Para un nuevo intento: congelar fuentes/binario/controlador nuevos, usar un
directorio exclusivo, reanudar con `run3/23-seal` y las claves22 de run2, y
programar un watcher nuevo con sus pins. El watcher antiguo ya terminó.
Después siguen las dos contribuciones/verificaciones de fase 2, claves23 y
replay Game/H3. La estimación previa de 4–6 h ya no aplica al intento fallido.

## Historial anterior (estado de actividad ya vencido)

## Trabajo en curso: 4 de noviembre, pipeline MPC local

**Continuar sin pedir «sigue» entre pasos.** El usuario autorizó completar todo
lo posible y pidió probarlo en esta PC. El protocolo completo de **invalid-point,
dominio 2²², ya terminó**: dos contribuciones verificadas por fase, sellados,
PK/VK nuevas, Verifier.sol y manifest.json. Pico entre todos sus workers:
**7.740.268.544 bytes (~7,21 GiB)**. Inicialización fase 2: 2 h 27 min 50,933 s,
pico 6.672.801.792 bytes. No se necesitan 64 GiB para este recorrido ya medido.

**ACTIVO ahora:** inicialización de fase 2 de opening (2²³), con v4,
`/home/rodrigo/.cache/vendetta-audit/local-mpc-sequence-20261104-run3/23-phase2-init/`.
Parent PID 606766 / worker 606772, controlador **46719**. Fase 1 de ambos
dominios completa. Sellado 23 terminado en 105 min 11,012 s,
pico 5.372.522.496 bytes. Commons SHA-256
`65abc486a3a255849d4735f06d5664775b4a8129c6f90643702e426d5ce2ac82`;
commons.json SHA-256
`8869842524ab18c47dadf74da6ab1a2267e98109005483f8a6a5a35926266972`.
Observación provisional a las 20:50 UTC: ~120 min activos / ~328 min CPU,
RSS ~7,75 GiB; sin resultado final ni fallo.
Consultar heartbeat.jsonl y public/checkpoints.jsonl. No iniciar otro worker
pesado, no repetir etapas terminadas. Después: dos contribuciones y sus
verificaciones fase 2, extracción de claves y replay completo Game/H3.

Primera verificación v4: 26 min 29,553 s / 9.051.721.728 bytes (~8,43 GiB),
recibo SHA-256
`ac865fa2166a134993200eb74cc5cc22d19d37c6c9358e09a472e826787492f6`.
Segunda contribución: 117 min 20,356 s / 5.373.382.656 bytes; artifact.json
SHA-256 `52f4be3a4319772f03a5945ac6fb38088ad032a6004697e79ea41a6d72bd1ec0`.
Segunda verificación: 22 min 59,443 s / 9.038.798.848 bytes; recibo SHA-256
`00a07b24629ee08f53461def4096112e280958021800b430c276dc921f2813b1`.

Se observó un **salto de UTC de ~9 h 6 min** durante verify2:
07:40:11 -> 16:46:31 UTC, elapsedSeconds sólo +10 s. Causa no determinada
(posible pausa del entorno/ajuste del reloj); no contar esas horas como CPU
ejecutada. Informado al usuario. Las estimaciones previas eran de ejecución
activa; user preguntó ETA y se estimaron 12–14 h restantes antes de esa pausa.
No hay instrucción de parar: mantener el trabajo y actualizar con tiempos
medidos. Observación pública clock-discontinuity.json en el benchmark.

La primera contribución de 2²³ ya terminó (82 min 19,626 s,
pico 5.218.168.832 bytes). Está en run2/23-first; artifact.json SHA-256
`48c5f26ccea9f47b7c69253e99644b791f33e7016275692194d74f2d1b1b7677`,
transcript SHA-256
`1b390bb4d3471a51ee2fbe320f3b9e26631a00c1f7c95994f5897a28b09cb0bf`.
Verificación v3 detenida en SameRatioMany: no pudo reservar otro bloque
de 2 GiB dentro de AS 10 GiB; pico RSS 7.516.946.432 bytes. Datos preservados,
sin fallo criptográfico declarado ni requisito demostrado de otro host.
**No repetir la primera contribución ni el protocolo 22.**

- Secuencia v4 ACTIVA, sesión **46719**, estado sequence.jsonl en run3
  bajo el directorio padre anterior. Reutiliza por pins todo el dominio 22 y
  la primera contribución 23; después verify/continue/verify/seal y fase 2 de 23.
  `run3/22-phase2-keys` es un enlace al resultado completo de run2, sólo lectura.
  Los outputs nuevos son externos/exclusivos. Código de reanudación probado con
  sustitución de cuerpo de clave rechazada antes de arrancar workers.
  Controlador anterior run2/sesión 74724 terminó por fallo de AS; no reiniciarlo.

- Nuevas claves de invalid-point:
  `.../local-mpc-sequence-20261104-run2/22-phase2-keys/public/`.
  keys.json vincula toda la cadena; manifest.json SHA-256
  `c4798b4f3ddc81c535c680a420b437fec9107ea007bc5c39c9504ff86a13a2c8`.
  PK SHA-256 `043bfd715700598d8903b715f54c8a6cf4b2a4ffbdba84beb98e2b8cbf26d47e`;
  VK SHA-256 `4e48f997b91826ad31a52fc1b836da68890d7b615974409e4576ff1eddc3f959`.
  Beacons fijos conocidos; unsafeLocalSetup=true, productionApproved=false.
  **Ya pasó prueba real del productor y verificador Solidity/consumidor.**
  Informe `.../local-mpc-invalid-point-proof-20261104-run1/report.json`: 237,498 s,
  pico 5.329.436.672 bytes. evm-report.json confirma positivos y rechazos de
  prueba/input/statement sustituidos en Anvil privado; check ~356525 gas.
  Falta el replay completo Game/H3 con los dos nuevos juegos de claves.
  Petición invalid-U y prueba verificadas fuera de Git en
  `/home/rodrigo/.cache/vendetta-audit/local-mpc-invalid-point-proof-20261104-run1/`.
  input.json deriva de un fixture público; prepared.json fija su hash y el
  nuevo manifest. --inspect-v2 confirmó kind=invalid-point. proof.json es público
  y ya se probó; no repetir por defecto. No correr otro worker pesado a la vez.
  Sí se comprobaron todos sus hashes y compiló su Verifier.sol con solc 0.8.28
  (runtime 6609 bytes); recibo público solidity22-compile.json en el benchmark.
- Watcher v4 del replay ACTIVO, sesión **50039**, estado replay.jsonl en
  `/home/rodrigo/.cache/vendetta-audit/local-mpc-replay-20261104-run2/`.
  Espera sequence-complete de run3, valida claves/manifest, 501 fuentes
  ejecutables/inventario y herramientas, luego --worker-replay en Anvil privado.
  El watcher v3 (sesión 63526, replay run1) ya terminó al fallar run2.
  No modificar código sin congelar y reprogramar el watcher; documentación
  de estado sí puede avanzar. El replay completo Game/H3 sigue pendiente.

- Herramientas/fuentes congeladas en
  `/home/rodrigo/.cache/vendetta-audit/local-mpc-pipeline-20261104-tools/`.
  Binario activo pipeline-v4 SHA-256
  `376a2ea1c3c48dbaf083c27a47c17709eccceb0f7dfc2f5bf0b9334e4e50d680`;
  source-v4-at-launch.tar.gz SHA-256
  `19558c0fac70d4b6a2021e33f002666b8baf9d9fc826cdc5b6c2a963e62fce8a`.
  Binario reproducido offline con SHA idéntico, pipeline-v4-reproduction.json.
  Controladores congelados sequence-v4.py/sequence-v4-launch.json y
  replay-v4.py/replay-v4-launch.json; sus comandos/pins están en esos recibos.
  V4 mantiene GOMAXPROCS=4; no cambia la criptografía. Tests: 3 paquetes Go/94
  eventos v4 y 24 Python aprobados, vet pasa. Versiones anteriores intactas.

- Historial preservado: primera contribución 22 en
  `.../local-mpc-phase1-22-first-20261104/`, primera verificación en
  `.../local-mpc-phase1-22-verify1-20261104/`, segunda contribución en
  `.../local-mpc-phase1-22-second-20261104/`. Sus binarios pipeline y pipeline-v2
  permanecen intactos en tools, junto con recibos de arranque. El runner run1
  fue interrumpido mientras esperaba (no el worker) para corregir una carrera
  al leer report.json: ahora espera salida del supervisor antes de leerlo.
- CS copiados sin leer PK/VK ni modificar los setups originales:
  `/home/rodrigo/.cache/vendetta-audit/local-mpc-game-cs-20261104/`.
  invalid-point.bin SHA-256
  `89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898`;
  opening.bin SHA-256
  `06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f`.
  Son los mismos CS reproducidos previamente dos veces desde fuente congelada.
- Informes y metadata públicos normalizados con hashes originales en
  [local-mpc-pipeline](../benchmarks/timelock-opening/local-mpc-pipeline/README.md).
  El helper conserva una etiqueta informativa verify-first-contribution en el
  reporte de verify2; el recibo sí vincula el artifact de la segunda contribución
  y la verificación anterior. No editar informes originales para cambiarla.

Presupuestos: fase 1 contribución inicial AS 8 GiB/6000 s CPU/7200 s wall,
verificación v3 AS 10 GiB; v4 AS 14 GiB/6000 s CPU/7200 s wall, continue/seal AS 8 GiB/9000 s
CPU/10800 s wall. MemAvailable inicial 12 GiB (14,5 verify v4), disco >=32 GiB,
archivo 2 GiB/core cero y presión host mínima 4 GiB. Minúsculos tests usan N=8.
Fase 2 init/seal AS 14 GiB, umbral RSS **observado** 10,5 GiB cada 100 ms,
minavailable 14,5 GiB, Go target 8 GiB, CPU 86400 s; wall 12 h init/6 h seal.
Contribuir/verificar fase 2 AS 10 GiB/18000 s CPU/wall 6 h/Go target 7 GiB.
El RSS muestreado no es una cuota kernel. Se mata grupo y espera salida.
Replay posterior AS 14 GiB/CPU 10800 s por proceso/wall 2 h/archivo 2 GiB/core
cero, PROVER_MEMORY=6GiB/PROVER_THREADS=4, presión host mínima 4 GiB.

La verificación de fase 1 conserva un anchor público y un SRS nuevo, usando
UpdateProof.Verify/SameRatioMany nativos. **El dominio 23 todavía no está
medido completo**: no inferir que necesita 64 GiB ni modificar el verificador
sin observar primero un fallo real. Fase 2 separa CS frío, commons y caché de
evaluaciones para liberar heaps entre procesos. Tests entre procesos con/sin
compromiso completan ambas fases, export Solidity y prove/verify positivo y
negativo; 7 paquetes Go/133 eventos aprobados, 22 tests Python, vet y tipos
pasan. Inventario de apertura se regenera mediante snapshot:opening.

Continuar supervisando la secuencia y el replay, sin detenerse en cada subpaso.
No hay commits, despliegues reales ni cambios de setups existentes. Producción
sigue bloqueada por ceremonia independiente, cierre/beacon futuro, aprobación
de procedencia y auditoría. No falsificar esas evidencias para cerrar el hito 6.

Actualizado el 4 de noviembre de 2026, después de las barreras de despliegue,
validación de claves, ensayo MPC pequeño y escalera acotada de capacidad. Leer este archivo y `CLAUDE.md` al retomar.

## Punto de reanudación: sesión cerrada el 3 de noviembre de 2026

**Última continuación: 4 de noviembre, prueba local de dominios reales.** El
usuario pidió probar en esta PC. Se inicializaron y hashearon por streaming
2²²/2²³ bajo límites: 2,414/4,742 GiB MaxRSS, ambos terminados. Ya no se exige
un servidor de 64 GiB para continuar: era un presupuesto conservador, no una
necesidad demostrada. Seguir por operaciones locales con presupuestos nuevos;
no ampliar los límites de las herramientas pequeñas. Ver última continuación.

Actualización posterior: ver las continuaciones «Reproducción acotada del CS real»
y «Inspección nativa en streaming» al final y el [presupuesto del CS](hidden-v2-cs-capacity.md). Ya se compilaron ambos
circuitos dos veces desde fuentes congeladas verificadas, con supervisor y
digests históricos idénticos. MPC en dominios del juego y fase 2 siguen sin medir.
El nuevo inspector sólo revisa formato/hash; no valida puntos/MPC ni habilita
importación o producción.
La continuación más reciente, «Lectura protegida, CS y protocolo completo pequeño»,
añade la API nativa protegida y la integra en el ensayo supervisado. La CLI
independiente de formato conserva su alcance anterior. A escala del juego siguen
faltando host reservado y transcripts de la ceremonia; no se habilitó producción.

El usuario pidió guardar el estado para continuar en otra sesión. No queda
ningún worker MPC en ejecución. Leer primero este bloque y `CLAUDE.md`, después
las dos últimas continuaciones de este archivo y los README de
[mpc-rehearsal](../benchmarks/timelock-opening/mpc-rehearsal/README.md) y
[mpc-capacity](../benchmarks/timelock-opening/mpc-capacity/README.md).

- Etapas 1–5 cerradas históricamente; hito 6 sigue abierto. Barreras de despliegue,
  parser Ed25519 y ensayo pequeño entre ocho procesos implementados y probados.
- Último avance: fase 1 medida en 2¹⁰/2¹²/2¹⁴ bajo límites, tres workers terminados.
  Dominios 2²²/2²³ y fase 2 del juego **no medidos**; no extrapolar capacidad.
- Próximo trabajo: medir contribución y verificación por separado en esta PC,
  con presupuestos explícitos y procesos separados; después fase 2 con CS real.
  Compilación de CS e inicialización de fase 1 ya están medidas localmente.
  Evitar buffers/objetos retenidos innecesariamente. Un host de 64 GiB sigue
  siendo una opción si las operaciones superan el presupuesto local, sin
  declararlo necesario antes de medir.
- Producción continúa bloqueada: falta ceremonia independiente con cierre
  autenticado y beacon futuro, importación/aprobación de artefactos y auditoría.
  No regenerar ni modificar setups existentes. No hacer commits ni despliegues
  reales sin instrucción. Hay MUCHOS cambios previos y archivos sin rastrear:
  conservarlos; no asumir que HEAD contiene el trabajo de esta sesión.
- SDK persistente: `/home/rodrigo/.cache/vendetta-tools/go/bin/go`. Las rutas
  antiguas de SDK/logs en /tmp pueden desaparecer. Setups del juego siguen fuera
  de Git en `/home/rodrigo/.cache/vendetta-v2-local-20261029/`.
- Logs finales y feedback de Claude copiados fuera de /tmp en
  `/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261103-session-close/`;
  `evidence-receipt.json` fija sus hashes. Ese directorio contiene además el
  nuevo `source.tar.gz` del cierre y su `receipt.json` externo. Los paquetes de
  continuaciones anteriores permanecen intactos y describen sus propios snapshots.

## Roadmap de cierre de hidden v2

Estado actualizado el 3 de noviembre de 2026. El cierre local comprende etapas
1–5; producción es el hito separado 6. Las optimizaciones adicionales sólo
entran si bloquean estos criterios. Cada continuación debe actualizar este
estado y registrar evidencia, evitando ampliar indefinidamente el alcance.

| Etapa                          | Estado                                                                                                                      | Criterio de cierre                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Supervisor de worker        | Completada en tests de procesos; ver continuación del 31/10                                                                 | Timeout por trabajo, crash/aborto/cierre recuperables, confirmaciones ligadas al job y salida del proceso anterior antes de reinicio/cambio de circuito |
| 2. Integración del worker      | Completada; replay real y 178 tests web                                                                                     | Productor usa supervisor con lifecycle y cierre; ambos circuitos y replay EVM/H3 reales pasan, con World puntual/tardío idéntico                        |
| 3. Resistencia operativa       | Completada localmente; soak y fallos sostenidos del 31/10                                                                   | Carga prolongada representativa y fallos RPC/beacon/H3 documentados; cola recuperable, recursos medidos y ningún fallo operativo convertido en INVALID  |
| 4. Recuperación on-chain       | Completada con política conservadora y rotación manual; ver continuación                                                    | Política de transacciones atascadas/reorg definida y probada con historiales de recuperación                                                            |
| 5. Versión candidata local     | Completada; checks y límites en local-candidate                                                                             | Checks completos, revisión de pendientes y documentación reproducible con límites conocidos                                                             |
| 6. Preparación para producción | En preparación; ensayo MPC pequeño entre procesos y barreras de despliegue validados; ceremonia/procedencia real pendientes | Setup seguro, auditoría y correcciones resueltos antes de desplegar                                                                                     |

Las etapas 1–5 están cerradas localmente con evidencias separadas: lifecycle,
replay real, soak/fallos sostenidos, recuperación de journals/índice/keeper y
checks del candidato. El siguiente hito es el 6: preparación para producción. Permanecen vigentes las evidencias anteriores; los contadores
y límites de cada ejecución se conservan por separado.

## Objetivo y decisiones vigentes

Un ataque válido no debe perderse por publicar tarde su revelación/certificado.
Debe resolverse en su llegada y orden originales. Sólo la invalidez demostrada
criptográficamente permite descartar un paquete. Un fallo del productor, RPC o
beacon mantiene pendiente la misión: nunca implica INVALID.

El usuario autorizó avanzar autónomamente. No hay despliegues existentes: v2 es
obligatoria desde génesis, sin v1, activación opcional ni compatibilidad. Drand
libera el secreto; ZK certifica la apertura/validez. La frontera global detiene
acciones dependientes cuando la cabeza oculta está pendiente. TS y Solidity
deben mantener la misma máquina de estados.

## Último resultado confirmado

Cierre local 1–5 aprobado el 31 de octubre de 2026. El
[candidato local](../benchmarks/timelock-opening/game-producer/local-candidate/README.md)
registra checks, hashes y límites. Soak real: 35 pruebas/62,54 minutos, seis
contextos; replay sostenido: tres pruebas nuevas y caídas RPC/beacon/H3 de al
menos un minuto. En ambos, cola recuperada, H3 reconstruido y World completo
puntual/tardío idéntico. Los 16 workers observados terminaron. Observación HTTPS
separada: 61/61 muestras correctas por dependencia.

Validación final: 763 rules, 206 contratos, 188 web, 11 layout, seis tests Go
principales con subtests, cinco e2e estándar y dos AA; builds, tipos y formato
aprobados. Los setups siguen siendo inseguros/exclusivamente locales. No se
crearon commits ni hubo despliegues reales. Producción requiere el hito 6.

El servicio HTTP deriva el contexto de Game, autentica beacon, elige el circuito,
genera prueba, verifica con VK, prepara H3 y comprueba el consumidor desplegado.
La caché se separa por statement y setup. El solicitante no aporta una decisión
de validez. Comandos Go: `--inspect-v2`, `--prove-v2`,
`--unsafe-local-setup-v2`. CLI Node: `scripts/prover.ts` y
`scripts/compile-prover.ts`. Código nuevo en `scripts/prover/` y archivos
`producer_*.go` del experimento opening-zk.

## Recursos locales: no regenerar setups

Estas rutas son externas al repositorio y deben mantenerse fuera de Git:

- Binario actual del supervisor/servicio: `/home/rodrigo/.cache/vendetta-producer-v2-supervisor`.
  `/home/rodrigo/.cache/vendetta-producer-v2` es el binario histórico por subproceso.
- Claves: `/home/rodrigo/.cache/vendetta-v2-local-20261029/opening` y
  `/home/rodrigo/.cache/vendetta-v2-local-20261029/invalid-point`.
- Cada directorio contiene CS, PK, VK, Verifier.sol y manifest.json.
  `verifier-runtime.json` en el directorio padre vincula setup y bytecode.
- SDK Go: `/tmp/vendetta-opening-tools/go/bin/go`; solc:
  `/tmp/vendetta-opening-tools/solc-0.8.28`.
- Logs: `/tmp/vendetta-opening-tools/producer-game-replay.log`,
  `producer-native-tests.log`, `producer-final-rules.log` y
  `producer-final-types.log`.

Ambos setups finalizaron y son inseguros, exclusivamente locales. Opening:
5139537 constraints/55 inputs; invalid-point: 3760005/2. La generación tardó
aproximadamente 17 y 12 minutos respectivamente. No repetirla por cambios de
witness que no alteren el circuito. Ejecutar pruebas pesadas secuencialmente,
con GOMEMLIMIT=6GiB y GOMAXPROCS=8; evitar guardar claves en /tmp (tmpfs).

## Validaciones y pendientes inmediatos (histórico del productor inicial)

La integración real anterior está verde. La suite nativa Go del productor pasó
antes de la integración. El typecheck de scripts pasó después de ella. Antes de
cerrar esta sesión se ejecuta además la suite completa de rules; consultar el
resultado al final de este archivo. Antes de este bloque estaban verdes 744
tests rules, 188 contratos y 107 web, además de diferenciales y layout. No
confundir esos resultados previos con una nueva ejecución de todas las suites.

Siguiente trabajo, sin reimplementar lo ya terminado:

1. Completar revisión y pruebas específicas del productor: firma auténtica de
   ronda incorrecta, integridad de artefactos y protección contra sobrescritura
   de setups. Revisar formato y tipado de los nuevos archivos.
2. Añadir scripts de package y variables documentadas en `.env.example` para
   binario, claves, caché, clave H3 y puerto; mantener rechazo de setup inseguro
   en redes reales. La CLI existe y el keeper ya consume HIDDEN_PROVER_URL.
3. Actualizar B-22/propuesta y el estado de `v2-only` para reflejar que el
   productor y replay en contextos nuevos ya funcionan. Conservar límites:
   setup seguro, auditoría y endurecimiento operativo siguen pendientes.
4. Actualizar `snapshot-opening.ts` para incluir Node prover fuera de la carpeta
   experiments y regenerar manifest de fuentes/resultados. No incluir claves.
5. Ejecutar checks relevantes para los cambios adicionales. La extracción pura
   encodeMission en rules no cambió la semántica. No hubo cambios Solidity en
   este último bloque de productor.

El árbol tiene MUCHOS cambios anteriores, incluidos archivos aún no rastreados.
No descartar cambios, no asumir que todo el diff pertenece al último bloque y
no hacer commits ni despliegues reales sin una instrucción para ello. No hay
procesos de prueba pesados pendientes al cerrar, una vez terminada rules.

Resultado final de esta sesión: 744/744 tests rules (13 archivos) y typecheck
de scripts aprobados; ambas ejecuciones finalizaron con código 0. La integración
real también finalizó con código 0. Se puede iniciar una sesión nueva.

## Continuación: revisión y operación del productor (29 de octubre de 2026)

Completados los pendientes inmediatos 1–4: pruebas nativas de firma auténtica de
ronda incorrecta, integridad de cada artefacto, manifiesto incompleto y protección
contra sobrescritura del setup; tipado del contexto Game y eliminación de `any`
en el productor; scripts package para prover, compilación, replay, typecheck y
snapshot; variables server-only documentadas en `.env.example` e instrucciones
de operación en game-producer/README.md. El servicio exige un boolean explícito
`unsafeLocalSetup`: ausencia o tipo incorrecto ya no evitan la política local.
Diez tests TS cubren esa política, incluidos chain IDs reales con opt-in.

B-22, propuesta y v2-only reflejan el replay real ya completado. El snapshot
incluye ahora la CLI y los módulos Node del productor, sus tests y resultados de
revisión. Las cifras originales de suites permanecen identificadas como previas.
No se regeneraron setups ni se repitió el replay pesado; no hubo cambios de
Solidity ni de reglas en esta continuación. Ver game-producer/review-checks.json.

Pendientes para producción: setup seguro, auditoría, endurecimiento operativo,
capacidad/costes y más historiales adversarios. No hay commits ni despliegues
reales en esta continuación.

La revisión adicional del loader detectó un problema en el fixture de gas:
la estimación automática falló al enviar; durante el diagnóstico, un límite
explícito de 5M permitió enviar pero el drenaje revirtió con Backlog() porque
exige una reserva de 7M. Se fijó 12M en su helper sendV2. El caso de evidencia tardía volvió
a pasar contra Anvil; los otros dos casos del loader también pasaron en la
primera ejecución. No se alteró la lógica de juego para corregir el fixture.

Validación final de esta continuación: **117/117 tests web, 16 archivos, sin
skips**, con Foundry en PATH; incluye los tres tests Anvil del loader y diez de
política de setup. Tests Go `^TestProducer`, typecheck de scripts, Prettier de
archivos revisados y `git diff --check` aprobados. No se repitieron las suites de
reglas ni contratos, ni el replay criptográfico pesado ya aprobado. Log web:
`/tmp/vendetta-producer-review-web.log`. Se regeneró y verificó el manifest de
fuentes/resultados; los setups y claves permanecen fuera del repositorio.

## Continuación: límites de procesos y recuperación de cola (30 de octubre de 2026)

Se avanzó en endurecimiento operativo sin regenerar setups. Inspección y prueba
nativas tienen un límite configurable `HIDDEN_PROVER_TIMEOUT_MS` (900000 ms por
defecto); la configuración inválida falla antes de conectar al RPC. El proceso
se termina con SIGKILL antes de liberar el turno, evitando que un timeout deje
un prover residente mientras comienza el siguiente. El fallo conserva el 503
reintentable y nunca declara INVALID. El límite es por subproceso, no cubre la
espera en cola, RPC ni transacciones H3.

La cola serial existente se extrajo a `scripts/prover/jobs.ts`. Las pruebas
verifican deduplicación incluso con capacidad agotada, rechazo de exceso de
trabajos, serialización, recuperación y reintento tras fallo, además de matar
un subproceso Node bloqueado real y ejecutar el siguiente trabajo. No se usan
claves ni pruebas criptográficas pesadas para estos checks.

Checks específicos: 19/19 tests de jobs y política de setup, typecheck de scripts,
Prettier de los archivos TS tocados y `git diff --check` aprobados. Variables e
instrucciones documentadas en `.env.example` y game-producer/README.md.

Próximos pasos operativos concretos: límites de almacenamiento/retención de
caché, clientes/cuerpos lentos, métricas y recuperación ante fallos RPC/H3;
después, carga sostenida y más historiales adversarios. Setup seguro y auditoría
siguen pendientes. No hubo cambios Solidity/reglas, commits ni despliegues.

Validación completa adicional: **126/126 tests web, 17 archivos, sin skips**,
con Foundry en PATH; código 0. Log: `/tmp/vendetta-producer-jobs-web.log`.
No se repitieron suites rules/contratos ni el replay Groth16 pesado. Se regeneró
y verificó el manifest de fuentes/resultados incluyendo jobs y sus tests.

## Continuación: límites HTTP y clientes desconectados (30 de octubre de 2026)

Se extrajo el listener a `scripts/prover/http.ts`. Límites por proceso: 32 sockets
simultáneos, 32 handlers activos (incluidos trabajos cuyo cliente se desconectó),
una petición por conexión, headers de hasta 8 KiB y cuerpo de hasta 16 KiB.
Un plazo absoluto de subida de 10 segundos destruye cuerpos incompletos aunque
el cliente siga enviando bytes; se elimina antes de esperar/generar la prueba.
Los plazos Node de headers/recepción son 10/15 segundos con revisión cada segundo.
La cola serial de ocho trabajos y su deduplicación permanecen sin cambios.

Cuatro tests HTTP con sockets reales cubren exceso de conexiones, desconexión y
reconexión durante un trabajo, recuperación del presupuesto tras terminarlo,
cuerpo lento/incompleto, cuerpos inválidos/grandes y generación más larga que
el plazo de subida. Typecheck de scripts, Prettier de los archivos TS tocados y
`git diff --check` aprobados. README operativo actualizado. No se regeneraron
setups ni se ejecutó el replay criptográfico pesado; sin cambios Solidity/reglas,
commits ni despliegues.

Siguiente trabajo: retención/límites de caché, métricas, recuperación RPC/H3,
autenticación/cuotas por cliente y carga sostenida/historiales adversarios.
Setup seguro y auditoría siguen pendientes.

Validación completa: **130/130 tests web, 18 archivos, sin skips**, código 0,
Foundry en PATH. Log: `/tmp/vendetta-producer-http-web.log`. No se repitieron
suites rules/contratos. Manifest de fuentes/resultados regenerado y verificado.

## Continuación: retención y presupuestos de caché (30 de octubre de 2026)

Se añadió `scripts/prover/cache.ts`: presupuesto de 64 MiB, 4096 pruebas y siete
días desde escritura, configurables mediante `HIDDEN_PROVER_CACHE_MAX_BYTES`,
`HIDDEN_PROVER_CACHE_MAX_FILES` y `HIDDEN_PROVER_CACHE_MAX_AGE_MS`. Configuración
inválida falla antes del RPC. Limpieza al iniciar y antes/después de trabajos
serializados, incluso ante fallos: elimina temporales, pruebas expiradas y las
más antiguas hasta cumplir ambos presupuestos. Una salida de proving fallido
se elimina antes de liberar el turno. La expulsión sólo exige regenerar la prueba;
no declara INVALID ni cambia el orden de resolución.

La carpeta debe ser exclusiva de un proceso. Se reconocen sólo nombres propios,
se preservan archivos ajenos y se rechazan symlinks propios sin seguirlos.
Estos presupuestos se aplican entre trabajos, no durante escrituras nativas;
para un límite físico estricto hace falta una cuota de filesystem. No hay
limpieza periódica mientras el servicio está ocioso. README y `.env.example`
documentan estos límites.

Siguientes pendientes: métricas, recuperación RPC/H3, autenticación/cuotas por
cliente, carga sostenida e historiales adversarios. Setup seguro y auditoría
siguen pendientes. No se regeneraron setups, no hubo cambios de reglas/Solidity,
commits ni despliegues; no se repitió el replay Groth16 pesado.

Validación: **140/140 tests web, 19 archivos, sin skips**, con Foundry en PATH,
código 0. Log: `/tmp/vendetta-producer-cache-web.log`. Los 33 tests específicos
de caché/cola/HTTP/setup también pasaron. Typecheck de scripts, Prettier y
`git diff --check` aprobados. Manifest de fuentes/resultados regenerado y
verificado; no se repitieron suites de reglas ni contratos.

## Continuación: métricas y recuperación RPC/H3 (30 de octubre de 2026)

El listener loopback expone `GET /metrics` con JSON agregado de handlers,
cola/capacidad/deduplicaciones/rechazos, caché, memoria y llamadas/fallos/tiempos
por etapa. No expone entradas de misiones, secretos ni errores. Contadores en
memoria, reiniciados con el proceso; no hay percentiles ni exportador externo.

RPC tiene timeout de 15 segundos sin retry de transporte. H3 espera recibo
hasta 60 segundos. Antes de enviar, se prepara/firma la transacción localmente
y se guarda mediante rename un journal privado en la carpeta de caché,
separado por chain/Game/signer y excluido de la retención de pruebas. Si se
pierde la respuesta o falla la consulta del recibo, el siguiente trabajo recupera
los mismos bytes/hash antes de leer estado. No crea otra transacción/nonce por
ese fallo, incluso después de reiniciar el proceso. Un recibo revertido limpia
el journal y falla de forma reintentable; el próximo intento vuelve a leer
estado. Una cuenta H3 dedicada y carpeta exclusiva de un proceso son necesarias.

Pruebas de recuperación cubren respuesta perdida, fallo RPC del recibo,
reanudación desde disco sin preparar otro nonce, revert y journal corrupto.
Una prueba adicional sobre Anvil real transmite la transacción, simula esos
fallos y confirma un único nonce consumido al recuperar. No es un nuevo replay
criptográfico completo de H3/Groth16. Tests HTTP y cola verifican métricas.

Límites: transacciones atascadas por tarifas pueden bloquear la cola; no hay
reemplazo/cancelación automática, failover RPC ni manejo de reorg profundo.
El journal protege reinicios de proceso, sin garantizar fsync ante pérdida de
energía. README operativo documenta métricas, recuperación y estos límites.

Siguientes pendientes: autenticación/cuotas por cliente, carga sostenida,
historiales adversarios y capacidad/costes; profundizar reemplazos de
transacciones/failover y observabilidad según los resultados. Setup seguro y
auditoría siguen pendientes. Sin regeneración de setups, cambios de reglas o
Solidity, commits ni despliegues reales.

Validación: **146/146 tests web, 21 archivos, sin skips**, Foundry en PATH,
código 0. Log: `/tmp/vendetta-producer-recovery-web.log`. Los 19 tests específicos
de recuperación/RPC/HTTP/cola también pasaron. Typecheck de scripts, Prettier y
`git diff --check` aprobados. Manifest de fuentes/resultados regenerado y
verificado. No se repitieron las suites rules/contratos ni el replay Groth16.

## Continuación: autenticación y cuotas por cliente (30 de octubre de 2026)

El productor exige una lista privada de clientes mediante
`HIDDEN_PROVER_CLIENTS_FILE` (JSON, fuera de Git); se valida antes del RPC.
Tokens Bearer únicos de 32–128 caracteres, scopes `prove`/`metrics` y presupuestos
explícitos de peticiones por minuto y concurrencia. La comparación usa hashes
SHA-256 de tamaño fijo y timingSafeEqual, recorriendo todos los clientes.
El listener comprueba token/scope/cuota antes de leer el cuerpo o encolar:
401 sin credencial válida, 403 sin scope, 429 con Retry-After al agotar cuota.

Cuotas por token mediante token bucket con recarga continua, independientes
entre clientes y locales al proceso. Se cuentan peticiones admitidas, incluidos
errores posteriores, duplicados e hits de caché. Concurrencia cubre uploads,
cola y trabajo; un cliente desconectado conserva su turno hasta que termina
el handler. Los límites globales HTTP/cola serial siguen aplicándose.
`/metrics` también exige credencial y añade contadores agregados de accesos
denegados, scopes insuficientes y cuotas agotadas, sin identificar clientes.

El keeper requiere `HIDDEN_PROVER_TOKEN`; requestCertificate lo transmite en
Authorization y rechaza redirecciones. 401/403/429 siguen siendo errores de
operación reintentables, nunca evidencia INVALID. Replay local adaptado al
contrato autenticado, sin ejecutar de nuevo su proving pesado. `.env.example`,
README operativo, guía de despliegue y arranque local documentan los requisitos.

Tests específicos: configuración inválida, permisos, rechazo antes de completar
upload, métricas agregadas, cuotas independientes/recarga y cliente desconectado
hasta terminar un trabajo fallido. No se crean secretos operativos en Git ni
se regeneran setups. Sin cambios de reglas/Solidity, commits o despliegues.

Límites: credenciales estáticas con rotación mediante reinicio, cuotas que se
reinician con el proceso, sin reparto equitativo de CPU ni límites distribuidos.
El listener sigue en loopback; acceso remoto requiere proxy TLS y controles de
conexión. Próximos pendientes: carga sostenida, historiales adversarios,
capacidad/costes y mejoras de reemplazo/failover según resultados. Setup seguro
y auditoría siguen pendientes.

Validación: **161/161 tests web, 22 archivos, sin skips**, Foundry en PATH,
código 0. Log: `/tmp/vendetta-producer-access-web.log`. Los 24 tests específicos
de acceso/HTTP/transporte de certificados también pasaron. Typecheck de scripts,
Prettier, `bash -n scripts/dev-local.sh` y `git diff --check` aprobados. Manifest
de fuentes/resultados regenerado y verificado. No se repitieron suites
rules/contratos ni replay Groth16 pesado.

## Continuación: carga operativa e historiales adversarios (30 de octubre de 2026)

Nuevo comando `pnpm --filter @vendetta/web prover:load <segundos> <reporte.json>`:
harness de HTTP/acceso/cola/caché reales, sin RPC ni criptografía, con 20 workers,
claves compartidas, saturación, rechazos 401/403/429/503, caché y fallos inyectados.
Una ejecución de 60 segundos y recuperación de las 256 claves terminó en 65,1 s:
1313 trabajos completados, 16 fallos inyectados, 1282 deduplicaciones y 170 hits.
Máximo un trabajo activo y ocho pendientes; al terminar, cero handlers/trabajos
pendientes y caché de 32 archivos/8192 bytes dentro de ambos presupuestos.
Resultado: `../benchmarks/timelock-opening/game-producer/load-results.json`.
Los percentiles mezclan rechazos, métricas y recuperación; no son latencia de
proving. Memoria observada no demuestra ausencia de fugas ni un techo estricto.

Se añadieron 18 historiales a `packages/rules/test/hidden-histories.test.ts`:
seis permutaciones de evidencia, presupuestos de drenaje 1/2/20, certificados
válidos e inválidos, duplicados, recall, ataque público empatado en llegada y
fallos de verificador. Tras siete días de demora, todo el World coincide con
procesar puntualmente cada llegada/retorno. Modelo TS con verificador confiable
de tests; no implica un nuevo replay Groth16 ni un diferencial Solidity.

No hubo cambios de lógica de juego/Solidity ni setups regenerados. No hay
commits o despliegues reales. Siguientes pendientes: carga prolongada con
proving/RPC/H3 reales, capacidad/costes por circuito y misión, más escenarios
diferenciales y recuperación ante transacciones atascadas/reorg. Setup seguro
y auditoría siguen pendientes.

Validación: **762/762 tests rules, 14 archivos**, con typecheck, código 0;
log `/tmp/vendetta-hidden-histories-rules.log`. Los 18 historiales también pasaron
por separado. Typecheck de scripts, Prettier y `git diff --check` aprobados.
La carga operativa terminó con código 0; log `/tmp/vendetta-producer-load.log`.
Manifest de fuentes/resultados regenerado y verificado. No se repitieron suites
web/contratos, al no cambiar módulos del servicio, ni el replay Groth16 pesado.

## Continuación: historiales diferenciales TS/Solidity (30 de octubre de 2026)

Se añadieron 18 escenarios deterministas (36–53) al generador de rules y sus
18 tests Foundry: seis permutaciones de certificados por drenaje 1/2/20.
Incluyen certificados válidos e invalid-point, duplicados, recall y evidencia
posterior a su retorno, ataque público empatado en llegada y siete días de
retraso. El generador compara el World TS completo con un oráculo puntual;
Foundry compara después de cada acción los campos del snapshot diferencial
existente. No equivale a comparar todos los slots, receipts y logs de Solidity.
Se usan consumidores de test, sin un nuevo replay Groth16 ni fallos RPC reales.

Validación: **43/43 tests ScenariosTest**, que cubren los 54 escenarios y 8345
pasos, y **762/762 tests rules, 14 archivos**, incluido typecheck. Logs:
`/tmp/vendetta-hidden-differential.log`,
`/tmp/vendetta-hidden-differential-rules.log` y
`/tmp/vendetta-hidden-differential-generation.log`. Resultados persistentes en
`../benchmarks/timelock-opening/game-producer/differential-histories-results.json`.
Prettier, forge fmt, typecheck final y git diff --check aprobados; manifest de
fuentes/resultados regenerado y verificado. No se repitieron suites web ni
contratos fuera de ScenariosTest; sin cambios de lógica de juego, regeneración
de setups, commits o despliegues reales.

Próximos pendientes: carga prolongada con proving/RPC/H3 reales, capacidad y
costes por circuito/misión, recuperación de transacciones atascadas/reorg y
extender el diferencial a otros historiales. Setup seguro y auditoría siguen
pendientes.

## Continuación: lote concurrente con proving/RPC/H3 reales (30 de octubre de 2026)

Nuevo comando `pnpm --filter @vendetta/web prover:capacity`: reutiliza el replay
sobre Anvil privado y los setups existentes, con seis misiones distintas
(dos válidas recién cifradas, dos compromisos inválidos y dos U inválidos),
doce peticiones simultáneas y proving serial. Mantiene el modo original de tres
misiones y escribe los nuevos reportes en game-producer/capacity, sin sobrescribir
sus resultados anteriores. `prover:capacity:summary` reconstruye offline los
recibos H3, atribuye todas las transacciones y reconcilia gas por contexto/misión.

Resultado real: **6 pruebas nuevas, 6 deduplicaciones, cero hits durante proving,
cola final vacía**, en **1385,65 s (23,09 min), 15,59 misiones/hora observadas**.
Opening (4 pruebas): 241,59–306,09 s nativos; invalid-point (2): 166,01–168,23 s.
El tiempo nativo incluye integridad/carga de claves, witness, proving y VK.
El muestreo Linux cada segundo observó seis procesos nativos y máximo uno a la
vez: pico RSS 5,94 GiB, Node separado 162,58 MiB. CPU/RSS pueden subcontar y no
son límites estrictos. Ryzen 7 5825U compartido, 16 CPUs lógicas, 18,95 GiB RAM,
GOMAXPROCS=8/GOMEMLIMIT=6GiB. Entorno y hashes capturados durante el primer proving.

H3: seis transacciones, tres contextos, **517120 gas**. Un contexto se comparte
entre dos compromisos inválidos. Total admisión + H3 + certificados:
**7527257 gas**; excluye despliegues, reverts deliberados y drenaje/ejecución.
El resumen expresa la amortización H3 por misión y no estima tarifas reales.
El benchmark usa un transporte HTTP sólo loopback con plazo explícito de 91
minutos para peticiones en cola; no altera límites del servicio/keeper ni el
control de PID/SIGKILL. El primer certificado tardó más de cinco minutos.

Los consumidores reales aceptaron los seis certificados; rechazaron la prueba
manipulada/cruzada. Tras revertir Anvil se recuperaron seis hits de caché, se
reconstruyó H3 y coincidió el World completo puntual/tardío. El salto inicial es
de dos horas antes del proving; no es medición del timestamp de cada envío.
Firmas drand archivadas auténticas, no disponibilidad del beacon público.

Validación: **163/163 tests web, 23 archivos, sin skips**, Foundry en PATH,
incluidos dos tests nuevos de recursos/transporte; typecheck de scripts,
Prettier y git diff --check aprobados. Benchmark y resumen terminaron con código 0. Logs: `/tmp/vendetta-producer-capacity.log` y
`/tmp/vendetta-producer-capacity-web.log`. Manifest de fuentes/resultados
regenerado y verificado. No se repitieron suites rules/contratos ni el replay
original de tres misiones. Sin cambios de lógica de juego/Solidity, nuevos
setups, commits o despliegues reales.

Próximos pendientes: carga de horas/días con mezcla representativa, RPC/beacon
remotos y fallos prolongados; perfilado de integridad/carga/witness/proving para
fundamentar mejoras de capacidad y costes de infraestructura; recuperación ante
transacciones atascadas/reorg. Setup seguro y auditoría siguen pendientes.

## Continuación: perfil nativo por etapas (30 de octubre de 2026)

Se añadió `profileMs` a las salidas nuevas de `--prove-v2`: integridad, preparación
nativa de asignación, carga CS/PK/VK, witness, proving, VK y encoding. Reloj
monotónico, etapas disjuntas, sin datos de witness. El benchmark de capacidad
conserva esos tiempos cuando existen; las pruebas cacheadas antiguas no los
inventan. No cambian circuitos, claves, inputs públicos ni semántica de juego.

Nuevo comando `pnpm --filter @vendetta/web prover:profile <reporte-nuevo.json>`:
dos pruebas nuevas secuenciales (opening válido y punto inválido), setups
existentes, VK local, sin RPC/H3/EVM. Usa 8 hilos, GOMEMLIMIT=6GiB y el helper
con timeout/SIGKILL; rechaza sobrescribir informes antes de lanzar el binario.
Requests/pruebas temporales se eliminan al terminar. Binario separado:
`/home/rodrigo/.cache/vendetta-producer-v2-profile`; no se reemplazó el anterior.

Resultado real en `../benchmarks/timelock-opening/game-producer/phase-profile.json`:
550,22 s de lote. Opening 309,25 s: integridad 38,48, carga 202,42, proving 68,32.
Punto inválido 238,52 s: integridad 15,46, carga 183,16, proving 39,90.
La carga domina (65,5 %/76,8 %). Las demás etapas suman menos de 15 ms por prueba.
Picos RSS muestreados 5,85/5,29 GiB y Node separado 109,88 MiB; un único prover
activo. Una muestra por circuito, hardware compartido y cachés sin vaciar:
no es garantía de capacidad ni atribución de CPU por etapa.

Siguiente paso de rendimiento: evaluar reutilización controlada de artefactos
deserializados, conservando integridad, aislamiento de requests y presupuesto
de memoria al cambiar de circuito. No se implementó aún ese worker residente.
Siguen pendientes carga de horas/días, RPC/beacon remotos y fallos prolongados,
transacciones atascadas/reorg, setup seguro y auditoría. Sin regeneración de
setups, cambios Solidity/reglas, commits o despliegues reales.

Validación: cuatro tests Go `^TestProducer` con sus subtests, incluidos perfil,
integridad y no sobrescritura; 11/11 tests TS de recursos/jobs; typecheck de
scripts y rechazo de informe existente antes de ejecutar el binario. Perfil
real terminó con código 0 y reconcilió las etapas con los totales de ambas
pruebas. Prettier, gofmt y git diff --check aprobados. Manifest regenerado y
verificado. Logs: `/tmp/vendetta-producer-profile.log`,
`/tmp/vendetta-producer-profile-native.log` y
`/tmp/vendetta-producer-profile-tests.log`. No se repitieron suites completas
web/rules/contratos ni el replay EVM/H3, al no cambiar esos módulos.

## Continuación: reutilización experimental de CS/PK/VK (30 de octubre de 2026)

Nuevo CLI nativo `--prove-worker-v2 <setup-dir>`: trabajos JSON por stdin con
rutas input/output, uno por línea, hasta EOF; control limitado a 64 KiB. Fija
un setup por proceso, deserializa CS/PK/VK una sola vez y vuelve a comprobar
los cuatro hashes antes de cada trabajo. Fija el digest del manifiesto y lo
comprueba también tras proving. Cada petición autentica/deriva asignación y
witness propios, genera prueba y verifica con VK. Cualquier error aborta el
proceso; no se recupera/reutiliza estado tras fallos. La ruta `--prove-v2`
continúa disponible y carga artefactos por invocación. No cambian los circuitos.

Nuevo comando `pnpm --filter @vendetta/web prover:worker:profile <informe-nuevo>`.
Experimento separado del servicio: un worker opening, secuencia de statements
válido → compromiso inválido → válido con cinco candidatos. Tres pruebas nuevas
verificadas localmente, con decisiones/statements correctos en inputs públicos.
Una carga fría y dos reutilizaciones; el muestreador sólo observó un proceso.
Resultado `../benchmarks/timelock-opening/game-producer/worker-profile.json`:
468,53 s total; peticiones 347,14 / 61,98 / 58,26 s. Carga inicial 266,28 s,
reutilizaciones <1 ms; integridad se mantuvo (5,88 / 3,50 / 2,22 s).
Proving 74,94 / 58,48 / 56,03 s. RSS máximo muestreado 6,00 GiB, Node separado
85,33 MiB. Una secuencia corta y witnesses distintos, sin cachés vaciadas:
no es garantía de memoria/throughput ni prueba de estabilidad prolongada.

Binario independiente `/home/rodrigo/.cache/vendetta-producer-v2-worker`.
Se reutilizaron los setups existentes. Sin cambios de servicio HTTP, keeper,
reglas o Solidity; no hubo commits ni despliegues reales. No se repitió replay
EVM/H3 ni se probaron todavía dos circuitos en este modo. El harness conserva
el timeout/SIGKILL para el proceso completo de tres trabajos (45 min); todavía
no implementa un supervisor con plazo por trabajo para producción.

Siguiente trabajo concreto: supervisor de worker con timeout por job y espera
de salida antes de reinicio/cambio de circuito; pruebas de crash, bloqueo,
cancelación/cierre y recuperación sin dos setups residentes. Después, medir
ambos circuitos y replay EVM/H3 real en este modo, carga prolongada y RPC/beacon
remotos. Transacciones atascadas/reorg, setup seguro y auditoría siguen pendientes.

Validación: seis tests Go `^TestProducer` con sus subtests (protocolo, manifiesto
fijado, integridad también en estado reutilizable y no sobrescritura); 11/11
TS de recursos/jobs; typecheck de scripts, Prettier, gofmt y git diff --check.
EOF limpio y fallo de protocolo comprobados además con el binario real.
Benchmark y observador independiente de inputs públicos terminaron con código 0.
Temporales eliminados y worker terminado. Manifest regenerado/verificado.
Logs `/tmp/vendetta-producer-worker{,-binding,-native,-tests}.log`.
No se repitieron las suites completas web/rules/contratos.

## Continuación: supervisor y roadmap de cierre (31 de octubre de 2026)

Etapa 1 cerrada según tests de lifecycle de procesos. El roadmap vigente está
al principio de este archivo; la siguiente etapa es integrar el supervisor y
validarlo con proving, ambos circuitos y consumidores EVM/H3 reales.

Nuevo `scripts/prover/worker.ts`: un solo proceso residente, rechazo de llamadas
concurrentes (la cola sigue siendo responsabilidad del caller), timeout por job,
AbortSignal y cierre terminal/idempotente. Timeout, fallo de proceso, protocolo
incorrecto o exceso de logs causan SIGKILL y espera de `close` antes de rechazar
el job, limpiar prueba/temporal o arrancar otro proceso. El cambio de circuito
espera también la muerte del anterior. Los fallos son de operación reintentable;
el supervisor no declara INVALID ni verifica por sí mismo certificados.

Se endureció el protocolo nativo: requiere id por job y lo devuelve en la
confirmación. El supervisor usa UUIDs y rechaza confirmaciones ajenas, tardías,
duplicadas o del protocolo anterior. Es necesario recompilar el binario para
este supervisor. Se limita stdout+stderr a 1 MiB por job y se drena sin conservar
logs. El CLI nativo exige id alfanumérico/guion/underscore de hasta 64 caracteres.
El límite de control sigue siendo 64 KiB. Circuitos y setups no cambian.

El benchmark `prover:worker:profile` usa ahora el supervisor y quince minutos
por job. Su informe anterior sigue identificado como histórico: no se repitió
el proving pesado en esta continuación. Se incluyeron explícitamente ambos
scripts de perfilado en el typecheck de scripts y se corrigieron dos accesos
indexados que éste señaló. El servicio HTTP todavía usa el modo por subproceso.
Binario actualizado separado: `/home/rodrigo/.cache/vendetta-producer-v2-supervisor`.

Validación: 22/22 tests TS en tres archivos, incluidos once nuevos de supervisor
con hijos Node reales. Cubren reutilización, cambio de circuito verificando PID
anterior muerto, crash, bloqueo/timeout, presupuesto renovado por job, aborto,
cierre, error de spawn, crash ocioso, confirmación tardía/duplicada y exceso de
salida. Seis tests Go `^TestProducer` con subtests, incluidos ids ausentes o con
inyección. Smoke con binario Go real verificó fallo de setup, limpieza y reinicio
sin proving pesado. Typecheck de scripts, Prettier, gofmt y git diff --check
aprobados; manifest regenerado y verificado, incluyendo el test del supervisor.
Logs: `/tmp/vendetta-producer-supervisor-{tests,native,smoke}.log`.

No se repitieron suites completas web/rules/contratos ni replay criptográfico.
Sin cambios de reglas/Solidity, regeneración de setups, commits o despliegues.
No hay procesos pesados pendientes. Los límites y pendientes de producción
(setup seguro, auditoría) continúan vigentes.

## Continuación: worker integrado y replay EVM/H3 (31 de octubre de 2026)

Etapa 2 cerrada. El servicio HTTP genera pruebas mediante `ProducerWorker`, con
un solo setup residente y espera de salida al cambiar de circuito. Mantiene
cola serial, deduplicación, cuotas/auth, caché e integridad, contexto derivado
de Game, autenticación beacon y validación del consumidor desplegado. La
inspección ligera sigue en subproceso, sin CS/PK/VK. Desconectar el cliente no
aborta el proving ni libera su presupuesto antes de terminar.

`producer.close()` detiene admisiones/listener y conexiones, aborta/espera
inspecciones, cierra worker y drena cola; se conecta a SIGINT/SIGTERM y errores
del listener. Los trabajos en cola no empiezan RPC tras cierre. Una RPC/H3 ya
iniciada puede consumir su timeout; el journal conserva resultados ambiguos.
`runProducer` espera ahora `close` también ante AbortSignal, porque el callback
de aborto puede llegar antes de morir el hijo. Tests verifican esa barrera.
El control de hijos tras SIGKILL del padre corresponde al supervisor de procesos
externo (p. ej. cgroup); el cierre ordenado no cubre muerte abrupta/energía.

Nuevo `pnpm --filter @vendetta/web prover:worker:replay`, separado en
`../benchmarks/timelock-opening/game-producer/worker-replay/`.
Replay real con producción Deploy.s.sol, consumidores reales y Anvil privado:
tres certificados Groth16 nuevos, apertura válida recién cifrada ronda 1001/salt
máximo/origen en fila no cero, compromiso inválido y U inválido. Reutilización
opening y cambio a invalid-point; dos procesos observados, máximo uno a la vez.
Se verificó que ambos PIDs habían muerto después de `producer.close()`.

Lote 586,44 s (9,77 min). HTTP con H3: 315,79 / 59,94 / 210,71 s; nativo:
315,45 / 59,73 / 209,42 s. Carga fría 249,06 s opening y 170,21 s invalid-point;
reutilización <1 ms, sin omitir hashes. RSS pico muestreado 6,10 GiB, Node
separado 157,87 MiB (GOMEMLIMIT=6GiB no limita RSS físicamente). Tras revertir
Anvil: tres hits, H3 reconstruido y World completo puntual/tardío idéntico.
Rechazo de request manipulado, prueba cruzada y flag de invalidez forjado.
Firmas drand auténticas archivadas; sin disponibilidad remota medida, carga
prolongada ni reutilización caliente invalid-point. El salto inicial es de dos
horas antes del proving; no mide timestamp por envío.

Los resúmenes de capacidad distinguen ahora latencia por misión y CPU/RSS por
proceso residente, contando cargas frías en vez de asumir un proceso por prueba.
No se regeneraron resultados históricos de capacidad/perfiles. `.env.example`,
README, B-22/propuesta/v2-only y roadmap actualizados. Binario usado:
`/home/rodrigo/.cache/vendetta-producer-v2-supervisor`; setups existentes intactos.

Validación: 178/178 tests web, 25 archivos, sin skips, Foundry en PATH; incluye
los tres tests nuevos del ciclo de vida del servicio y el aborto de inspección.
Los 24 tests específicos también pasaron. Typecheck de scripts, Prettier y
`git diff --check` aprobados. Replay código 0. Manifest regenerado y verificado,
incluyendo nuevo test de servicio, resultados y entorno capturado durante la
primera prueba. Logs: `/tmp/vendetta-producer-worker-replay.log` y
`/tmp/vendetta-producer-worker-integration-{tests,types,web}.log`.
No se repitieron suites rules/contratos/Go, al no modificar esas fuentes.
Sin regeneración de setups, commits ni despliegues reales. No quedan pruebas
pesadas pendientes.

Siguiente trabajo: etapa 3, carga prolongada representativa y fallos sostenidos
RPC/beacon/H3, con recuperación de cola y recursos medidos. No añadir nuevas
optimizaciones salvo que bloqueen sus criterios. Luego etapas 4 (transacciones
atascadas/reorg), 5 (candidato local) y 6 separado (setup seguro/auditoría).

## Continuación: fallos repetidos sobre transporte HTTP (31 de octubre de 2026)

Avance acotado de etapa 3; permanece pendiente de cierre. Se extrajo el cliente
beacon a `scripts/prover/beacon.ts`, con máximo de 4 KiB recibido por streaming
(independiente de Content-Length) y el plazo existente de 15 segundos también
para el cuerpo. Errores HTTP, tamaño excesivo, lectura bloqueada y ronda
incorrecta siguen siendo errores operativos; nunca se convierten en INVALID.
El productor nativo conserva la autenticación criptográfica de la firma.

Nueva prueba RPC con Anvil real y proxy HTTP: 16 ciclos de caída/recuperación,
ocho trabajos serializados por ciclo, 128 respuestas de broadcast perdidas tras
entregar al nodo y 128 consultas de recibo rechazadas. Cada ciclo conserva los
bytes firmados del journal durante el fallo y recupera con un único nonce;
al terminar hay 16 transacciones efectivas, ninguna preparación adicional y
cola vacía. Nueva prueba beacon con servidor local: cuatro fallos consecutivos
y recuperación para cada modo 503, cuerpo excesivo, cuerpo bloqueado y ronda
incorrecta. La prueba no demuestra autenticidad de firma (usa firma sintética).

Estas pruebas ejercitan transporte, cola y journal reales, pero no proving ni
contratos H3 en el mismo historial. No sustituyen carga de horas/días,
RPC/beacon remotos, recursos medidos bajo carga representativa ni recuperación
ante reorg/transacciones atascadas. Éstos siguen siendo los siguientes pendientes
(etapas 3 y 4), antes del candidato local; setup seguro/auditoría siguen en 6.
No se regeneraron setups ni se ejecutó replay Groth16. Sin cambios de reglas o
Solidity, commits ni despliegues reales.

Validación: **180/180 tests web, 26 archivos, sin skips**, Foundry en PATH,
código 0; log `/tmp/vendetta-producer-wire-web.log`. Los seis tests específicos
RPC/beacon/lifecycle también pasaron. Typecheck de scripts, Prettier de TS
modificado y `git diff --check` aprobados. Manifest de fuentes/resultados
regenerado y verificado, incluyendo el nuevo test beacon. No se repitieron
suites rules/contratos/Go, al no cambiar esas fuentes. Sin procesos de prueba
pendientes.

## Continuación: carga prolongada real y recuperación del keeper (31 de octubre de 2026)

Se añadió `prover:soak <3600..86400>`: seis contextos admitidos por Game con
consumidores reales/Deploy.s.sol sobre Anvil privado, firmas auténticas archivadas
servidas por HTTP local y proving Groth16 de ambos circuitos. Inyecta fallos RPC,
beacon y H3 (envío minado con respuesta perdida/recibo indisponible), conserva
misiones pendientes, recupera el journal y continúa. Repite pruebas sin caché
con peticiones duplicadas, witnesses distintos y cambios de circuito. Escribe
progreso por iteración; el resultado final exige replay desde caché/H3 tras
revertir Anvil, rechazo de certificados alterados/cruzados y World puntual/tardío
idéntico. No hay setups nuevos. El primer intento no llegó al proving por un
revert en la admisión con gas estimado; el modo soak simula ahora cada acción
Game y envía con 12M para cubrir la reserva, sin cambiar el contrato.

Se añadió el resumen offline `prover:soak:summary` y la observación HTTPS
independiente `prover:probe:remotes`: cada minuto, chain id del RPC público de
Gnosis y firma archivada de drand 1001. No es un Game remoto ni una prueba de
latencia de publicación de rondas futuras. La mezcla del soak repite seis
contextos; no extrapola capacidad de admisión ni demuestra ausencia de fugas.
Los episodios de fallo preceden al bucle sostenido; no cubren todos los
intercalados ni una caída prolongada de cada dependencia.

También se avanzó en etapa 4: el keeper guarda bytes firmados antes de transmitir,
recupera el envío ambiguo antes de leer nuevas misiones o preparar otro nonce,
y usa RPC/recibos con plazos de 15/60 segundos. `scripts/keeper/transactions.ts`
rechaza operaciones concurrentes con el mismo journal. `KEEPER_STATE_DIR`
es persistente y privado; por defecto queda fuera del árbol web, en
XDG_STATE_HOME/vendetta/keeper o ~/.local/state/vendetta/keeper. Los stacks Anvil
nuevos usan rutas temporales distintas. La política sigue siendo retransmitir
los mismos bytes, sin reemplazo automático de tarifas ni cancelación de nonces.
Status de recibo desconocido mantiene el journal; no equivale a revert confirmado.

`CiphertextIndex` valida el hash del bloque escaneado incluso al consultar un
id cacheado; limpia/reconstruye desde despliegue ante reorg, comparte escaneos
concurrentes y rechaza rangos que cambian de rama durante la lectura. Nuevos
historiales Anvil prueban minería detenida/reintentos, tx minada eliminada antes
de resolver el journal, reinicio de keeper con bloqueo de la acción siguiente,
forks más cortos/de igual altura y reorg durante consulta de logs. Las pruebas
de settlement usan transferencias simples y las de logs un emisor EVM del evento;
no sustituyen un historial integral del CLI keeper/H3 bajo reorg. Siguen pendientes
ese historial y la recuperación de nonces reemplazados externamente.

Se corrigió la frontera de fixtures Playwright: los flujos ocultos aportan
certificados mock explícitos desde test-evidence.ts, con guard de chain id,
RPC loopback y bytecode de los consumidores DeployTest. Los drafts del navegador
se usan sólo en tests; no se incorporan a app/keeper/Deploy.s.sol. Un salto de
reloj no autentica un beacon futuro. AA/dev-local arrancan keeper únicamente con
proveedor/token explícitos. B-22, deploy docs, CLAUDE.md, .env.example y README
operativo reflejan el journal y estos límites. No hay cambios de lógica Solidity;
se normalizó formato en Account.sol y Scenarios.t.sol para los checks finales.

Resultado de etapa 3: soak **35 pruebas nuevas en 3752,48 s (62,54 min)**,
seis contextos distintos y 29 repeticiones sin caché/deduplicadas; 14 procesos
observados, máximo uno simultáneo, todos terminados. RSS máximo muestreado
6,17 GiB nativo/165,18 MiB Node. Ambos circuitos tienen reutilizaciones calientes;
los seis certificados finales se consumieron en Game y el World completo
puntual/tardío coincidió tras revertir Anvil/reconstruir H3. Observación HTTPS
separada completada: 61/61 muestras correctas de RPC Gnosis y beacon archivado.

Replay sostenido separado: **tres pruebas nuevas en 615,68 s**, sin solapar el
soak. RPC: 39 fallos/60,67 s; beacon: 39/63,35 s; H3: envío minado con respuesta
perdida y 13 reintentos durante 60,64 s adicionales, mismos bytes/prueba y ninguna
misión invalidada por el fallo. Recuperación cacheada en 139 ms, dos workers
terminados, cola vacía, H3 reconstruido y World completo puntual/tardío idéntico.
Ver worker-soak/README.md y worker-faults/README.md bajo game-producer.

Etapa 4: además de las pruebas anteriores, `keeper-reorg.test.ts` ejecuta el CLI
real y Game con certificados mock explícitos. Tras perder el recibo de una
certificación minada, revierte la cadena y reemplaza la admisión con otro packet
para el mismo id. El keeper retransmite el raw anterior, recibe su revert,
reindexa el packet canónico, certifica/resuelve la misión nueva y coincide en
World completo con TS. El caso de nonce reemplazado externamente demuestra
bloqueo/preservación del journal y recuperación con signer distinto y archivo
nuevo. Política: detener instancia antigua, preservar su estado, configurar otro
signer dedicado/fondeado; no borrar journal, no fee bump ni cancelación automática.
Los límites de finalidad, pérdida de energía/cgroup y durabilidad de filesystem
siguen explícitos para producción. Los fixtures no son pruebas criptográficas;
la criptografía/H3 real está documentada en los benchmarks separados.

La suite paralela descubrió que Forge compartía un recovery file incluso con
broadcast distinto; los tests Anvil ahora aíslan también FOUNDRY_CACHE_PATH,
reutilizando sólo metadatos de compilación. `pnpm test` completo pasó entonces:
762 rules, 206 contratos, 188 web, 11 checks layout, sin skips. Codegen reprodujo
75 artefactos exactamente. Builds web/indexer y seis tests Go `^TestProducer`
con subtests pasaron. Logs `/tmp/vendetta-v2-candidate-{tests-final,codegen,web-build,indexer-build,go}.log`.

El e2e detectó después un bloqueo real de previsión: forecastAttack repetía
processDue aunque el head oculto no certificado devolviera cero. Se corrigió
sólo la previsión cliente: retorna null en esa frontera, no simula un resultado
sin evidencia. No cambia la máquina de estados ni necesita contraparte Solidity.
La regresión prueba un ataque anterior, bloqueo posterior sin mutar World y
reanudación tras certificado. **763/763 tests rules** y typecheck pasaron;
log `/tmp/vendetta-v2-candidate-forecast-rules.log`. Los cinco e2e estándar y los
dos AA completos pasaron después de la corrección y actualizar selectores AA
antiguos (sin relajar prompts/sesión).

Etapa 5 cerrada: `pnpm test` final aprobó 763 rules/14 archivos, 206 contratos/26
suites, 188 web/30 archivos y 11 checks layout, sin skips. Después del formato
Solidity se repitieron contratos/layout con código 0; codegen dejó sin cambios
los 75 artefactos comparados. Builds web/indexer, typecheck scripts, seis tests
Go ^TestProducer con subtests, Prettier, forge fmt y git diff --check aprobados.
Build web conserva avisos no bloqueantes de chunks/imports tlock; no se amplió
el alcance para optimizarlos.

Evidencia persistente y comandos reproducibles en
[local-candidate](../benchmarks/timelock-opening/game-producer/local-candidate/README.md)
y checks.json. Logs finales `/tmp/vendetta-v2-release-*.log`, e2e estándar
`/tmp/vendetta-v2-candidate-e2e-final.log` y AA
`/tmp/vendetta-v2-candidate-e2e-aa-complete.log`. Se verificaron fuentes/artefactos
y se regeneró el manifest. Se validó el árbol actual; no se ejecutó ci-local.sh
sobre HEAD porque excluiría los cambios no comprometidos. No hubo commits,
regeneración de setups o despliegues reales. No quedan pruebas pesadas pendientes.

Siguiente trabajo: hito 6 separado. Setup seguro, auditoría independiente y
correcciones antes de desplegar; revisar capacidad/costes/disponibilidad reales,
supervisión externa y durabilidad de operador según los límites del candidato.
No reabrir etapas 1–5 ni añadir optimizaciones sin un defecto/criterio concreto.

## Continuación: procedencia de setup y alcance de producción (31 de octubre de 2026)

Se inició el hito 6 sin reabrir las etapas 1–5. La revisión del servicio encontró
que bastaba declarar `unsafeLocalSetup: false` para superar su política de
seguridad. No existe importador de ceremonia ni registro de aprobación: ese
boolean no demuestra procedencia. El productor ahora rechaza ese valor en
cualquier red, incluso con opt-in local. Mantiene los setups inseguros existentes
con opt-in explícito sólo en 1337/31337. No se regeneraron claves ni circuitos.

El [plan de producción](hidden-v2-production-readiness.md) concreta evidencias
para setup, importación/aprobación, auditoría independiente y operación. También
explicita que Deploy.s.sol sólo comprueba código y no queda protegido por la
política del servicio. La guía Gnosis ya refleja productor/replay local completos;
el README operativo documenta la barrera de procedencia. Se incorporó el plan
al snapshot de fuentes y se regeneró/verificó el manifest.

Validación: 20/20 tests específicos en producer-setup y producer-service,
incluidos ambos circuitos y rechazo al arrancar antes de crear worker/consultar
consumidores; typecheck scripts, Prettier de TS modificado y git diff --check
aprobados. No se repitieron suites completas ni proving pesado: no hay cambios
Solidity, reglas ni Go. Los resultados del candidato local siguen identificados
como históricos, sin atribuirles esta modificación.

Pendiente: seleccionar/revisar procedimiento y participantes de setup, congelar
la revisión para auditoría independiente, implementar importación y aprobación
de procedencia con pruebas adversarias, resolver hallazgos y validar operación
sobre hardware/proveedores objetivos. No se contrató auditoría ni se simuló
una ceremonia segura. Sin commits ni despliegues reales.

## Continuación: MPC nativo y paquete reproducible de auditoría (31 de octubre de 2026)

Se revisó la API MPC BN254 del backend fijado, gnark v0.16.4 / commit
`e974abb44722dd201a7f1949baeabca0fef5866e`. La candidata usa las dos fases nativas,
con lectura/verificación de transcripts y extracción de claves reproducible.
`TestSetupMPCCompatibility` comprueba una relación pequeña con compromiso,
dos contribuciones por fase, rechazo de challenges alterados, PK/VK idénticas
al reverificar bytes originales, serialización/exportación Solidity y prueba
Groth16 real con rechazo de input público sustituido. Todo sucede en un proceso
con beacons fijos de test; no es una ceremonia, no mide los dominios reales y no
habilita setups seguros. No se generaron claves del juego ni se tocaron las existentes.

Resultados, hashes de fuentes upstream y límites en
[setup-mpc](../benchmarks/timelock-opening/setup-mpc/README.md). La revisión
advierte que las APIs verificadoras no exigen contribuciones mínimas y mutan
la última contribución al sellar. La futura CLI debe verificar desde bytes
originales, imponer límites y exigir orden/digest final/participantes aprobados
fuera del transcript, con desafíos finales auténticos posteriores al cierre.
No se presupone compatibilidad de archivos nativos con ptau/zkey externos.

Nuevo `pnpm audit:hidden-v2 create|verify <archivo-fuera-del-repo>`: congela
fuentes modernas visibles para Git, incluso nuevas o modificadas sin commit,
con hashes/tamaños/modos y commit base. Excluye rutas de estado/claves/cachés,
rechaza symlinks, no sobrescribe y aborta ante cambios detectados en el inventario.
Verifica sin extraer y produce tar/gzip determinista. No detecta secretos dentro
de cualquier contenido ni acredita aprobación: revisar el inventario antes de
compartir. Lockfiles incluidos; dependencias instaladas y PHP legado excluidos.
[Comandos y alcance](hidden-v2-audit-bundle.md).

Validación: cinco tests Python (incluyen sustitución de fuentes durante creación,
alteración/duplicación/path traversal/symlinks en archivo y reproducción exacta),
siete tests Go principales con subtests (seis Producer y MPC nuevo), go mod verify,
compilación Python, Prettier de TS/package modificado, gofmt y git diff --check
aprobados. No se repitieron suites completas ni proving del juego porque no
cambiaron reglas, contratos, servicio TS ni circuitos existentes. Se regeneró y
verificó el manifest de fuentes; los resultados del candidato local permanecen
históricos y separados.

Paquete congelado de esta continuación fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261031-mpc-review/source.tar.gz`.
Su digest y número de archivos se conservan en `receipt.json` junto a él, fuera
del paquete para evitar autorreferencia. Se verificó el archivo y se comparó
con una segunda creación del mismo árbol. No se compartió con terceros.

Siguiente paso técnico: especificar/revisar la CLI de ceremonia y el registro
externo de aprobación de procedencia, incluyendo límites de transcripts y
medición de recursos antes de ejecutar dominios completos. Pendientes externos:
participantes independientes, auditoría/contratación y objetivos concretos de
hardware/carga/proveedores. Producción permanece bloqueada. Sin commits ni
despliegues reales; no quedan procesos pesados en ejecución.

## Continuación: planes y revisiones firmadas de diseño (31 de octubre de 2026)

Se concretó la [especificación de la CLI y del registro de revisión](hidden-v2-ceremony.md)
y se implementó su primera parte offline en el paquete Go `opening-zk/ceremony`
y `cmd/ceremony`. Nuevos comandos `pnpm ceremony:hidden-v2 inspect-plan` y
`verify-review`, con VENDETTA_GO_BIN para seleccionar SDK. El wrapper preserva
rutas relativas del llamador. No genera claves ni contacta servicios; go run
puede resolver dependencias si la caché no está preparada.

El plan fija ambos circuitos, fuente congelada, backend/commit, dominios mínimos,
participantes identificados y políticas candidatas de fase 1 separada y beacon
posterior al cierre. Son metadatos declarados, no bytes verificados ni identidades
autenticadas. Se exigen pins SHA-256 externos para plan y registro de confianza.
Las revisiones Ed25519 cubren un payload exacto con dominio exclusivo, digest de
plan/registro, propósito design-review-only y fechas. Se exige quórum de al
menos dos claves distintas, sin firmantes desconocidos/duplicados ni firmas
inválidas adicionales. Registro y revisión deben estar vigentes; retirar claves
requiere distribuir un pin nuevo por canal independiente. No hay autoridad real
instalada ni detección offline de pins antiguos todavía vigentes.

Los documentos tienen límite de 64 KiB y profundidad 16; se rechazan campos
desconocidos/duplicados, aliases de mayúsculas, null, tipos incorrectos y trailing
data. La lectura de archivos rechaza FIFO sin bloquear, directorios y symlinks
finales. Los resultados conservan productionApproved, mpcTranscriptVerified y
artifactBytesVerified en false. La política del productor no cambia: no acepta
un setup declarado seguro. Esta revisión firmada no habilita importación ni
sustituye ceremonia/auditoría.

Validación: seis tests Go principales y 54 subtests, 60 eventos de test en total,
incluyendo la CLI por shell real y rutas relativas; go vet, gofmt, sintaxis Bash,
Prettier y git diff --check aprobados. Evidencia y hashes en
[ceremony-design/results.json](../benchmarks/timelock-opening/ceremony-design/results.json).
Log JSON `/tmp/vendetta-v2-ceremony-design-tests.jsonl`. Race no ejecutado por
CGO deshabilitado y ausencia de compilador C. No se repitieron suites completas,
proving ni checks del candidato anterior; no hay cambios en circuitos existentes,
reglas, Solidity ni servicio TS. Los tests generan claves de identidad efímeras
sólo en memoria, ninguna clave nueva del juego.

Manifest regenerado/verificado. Nueva entrega de fuentes (la anterior permanece
intacta): `/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261031-ceremony-design/source.tar.gz`,
con receipt.json externo y reproducción idéntica. Se creó fuera de Git un plan
de diseño borrador que referencia ese paquete y los digests CS declarados por
los manifiestos locales, con participantes sin asignar. El comando inspect-plan
real lo acepta con sus tres flags de evidencia/aprobación en false; no se creó
registro de autoridades ni revisión firmada reales. La aprobación del plan no
se presume a partir de ese smoke.

Siguiente paso: formato de ejecución con claves de participantes, cierre/beacon
con evidencia autenticada y presupuestos concretos; lectura nativa acotada de
transcripts antes de asignar memoria y ensayos pequeños entre procesos. La
secuencia de contribución/verificación/sellado y los requisitos del posterior
registro de producción están especificados, pero su implementación y revisión
independiente siguen pendientes. Sin commits, cambios de setups existentes ni
despliegues reales. No quedan procesos pesados pendientes.

## Continuación: propuesta de ejecución con pins (31 de octubre de 2026)

Se añadió `inspect-execution` a la CLI offline. El schema independiente
`vendetta-hidden-v2-execution-plan-1` vincula el digest del diseño, todas sus
identidades en orden con claves Ed25519 distintas, presupuestos explícitos de
RAM/CPU/tiempo/transcript/almacenamiento y cuatro calendarios de fase. Exige
cierre anterior a disponibilidad del beacon y fase 2 posterior al deadline de
beacon de fase 1. Pins externos obligatorios tanto para diseño como ejecución;
lectura y JSON estrictos existentes. Los pins de políticas de cierre/beacon son
referencias declaradas, sin lectura ni autenticación de sus documentos.

El resultado conserva aprobación y evidencia en false e identifica también que
no autentica participantes/beacon ni aplica límites de recursos. Las revisiones
firmadas anteriores no cubren la nueva propuesta. No hay comando de ejecución ni
claves nuevas del juego; no se tocaron setups locales ni política del productor.
El formato y límites se documentan en hidden-v2-ceremony.md.

Validación: ocho tests Go principales y 83 subtests, **91 eventos aprobados**,
incluyendo nuevo test de CLI con rechazo de pin sin salida de éxito y casos
adversarios de bindings, claves, recursos, calendarios y JSON. Go vet y sintaxis
Bash aprobados. Evidencia/hash de fuentes en
[ceremony-execution/results.json](../benchmarks/timelock-opening/ceremony-execution/results.json),
log `/tmp/vendetta-v2-execution-tests.jsonl`. Sin suites completas de juego ni
proving pesado: no cambiaron circuitos, reglas, Solidity ni servicio TS.

Sigue pendiente: lectura nativa de transcripts con dimensiones acotadas antes de
asignar memoria, ensayos pequeños entre procesos, autenticación efectiva de
contribuciones/cierre/beacon y supervisor que aplique presupuestos. Después,
registro de aprobación de artefactos e importación adversaria. Autoridades,
participantes independientes, auditoría y hardware/proveedores reales siguen
pendientes externos; producción continúa bloqueada. Sin commits ni despliegues.

## Continuación: barreras y ensayo MPC entre procesos (3 de noviembre de 2026)

Tras feedback de Claude se priorizó probar el procedimiento ejecutable y cerrar
fronteras actuales, sin ampliar propuestas abstractas. Se corrigió un matiz de
su informe: disponer de archivos PK/VK no implica conservar el secreto tóxico
ni poder falsificar pruebas; los setups locales siguen sin procedencia segura.

`deploy:gnosis` ahora aborta antes de leer .env/contactar RPC, incluso con --yes;
Deploy.s.sol rechaza toda cadena salvo 1337/31337 antes de consultar el entorno.
Dos tests Foundry comprueban rechazo de redes externas y despliegues locales.
No hay bypass mediante un flag. Habilitar producción exigirá verificar un
registro de artefactos aprobados en lugar de estas barreras temporales.

El parser compartido Ed25519 rechaza puntos inválidos, codificaciones no
canónicas y orden pequeño en revisores/participantes. Se fijó la dependencia
filippo.io/edwards25519 v1.1.0. Un caso adversario usa una firma falsificada
válida para la clave identidad en Go y un segundo firmante legítimo: el roster
ahora se rechaza antes de aceptar ese quórum. El wrapper corrige rutas relativas
vía pnpm/INIT_CWD y flags de uno/dos guiones. No se añadió --at: validar para una
fecha elegida no prueba publicación entonces ni concede autorización vigente.

Nuevo `pnpm rehearse:hidden-v2 --directory /ruta/externa/nueva --unsafe-test-only`.
Build offline con módulo fijado y binario temporal; ocho procesos separados
(init, dos contribuciones/cierre por fase, verify), identidades efímeras privadas
fuera de Git y archivos exclusivos con fsync. Sólo admite una relación fija de
cinco restricciones/dominio 8, con compromiso, no los circuitos del juego.
Cada participante valida el historial anterior y firma un payload exacto ligado
a run/config/CS, fase/índice/identidad, cierre de fase 1 y hashes previos/nuevos.
Cierres fijados por digest exigen la lista completa en orden. Antes de ReadFrom,
un cursor comprueba tamaños/dominio/vectores/compromisos y forma comprimida;
el decoder nativo valida puntos y se exige reserialización idéntica/EOF.

Se autentican firmas drand archivadas quicknet 1000/1001 y se vinculan a los
challenges nativos. No prueban posterioridad/impredecibilidad tras el cierre;
un único operador controla ambas identidades y cierres. Esos flags y aprobación
de producción permanecen false. PK/VK se extraen dos veces desde bytes frescos,
coinciden, exportan Solidity y verifican una prueba Groth16 nueva con rechazo
de input público sustituido. No hay consumo EVM ni claves del juego nuevas.

El supervisor espera cada salida, mata el grupo en timeout y configura muerte
al perder el padre. Límites Linux por worker: 30 s wall, 20 s CPU, 4 GiB espacio
virtual y 64 KiB/archivo; core dumps deshabilitados. GC 256 MiB es objetivo, no
techo RSS; GOMAXPROCS=2 no es cuota CPU. La ejecución final registró ocho workers
terminados, 755 ms sumados de worker wall y 29.584 KiB RSS máximo entre workers.
Estos números sólo describen el circuito pequeño. No prueban durabilidad física,
aislamiento de operadores ni capacidad de los dominios completos.

Validación: **20 tests Go principales y 112 subtests (132 eventos)** en ceremony,
cmd/ceremony, mpcrehearsal y cmd/mpc-rehearsal. Adversarios incluyen truncado,
omisión, reordenación, firma/contexto cruzados y bombas de longitudes firmadas
por un participante; no producen informe de éxito. Timeout y límite de archivo
kernel probados. Regresión nativa separada: siete tests principales y 21
subtests (28 eventos), Producer y MPC pequeño original. Dos tests de despliegue
aprobados. Go vet, go mod verify, gofmt, forge fmt y sintaxis Bash aprobados.
No se repitieron suites completas web/rules/contratos ni proving del juego.

Fuentes/evidencias y comandos en
[mpc-rehearsal](../benchmarks/timelock-opening/mpc-rehearsal/README.md) y results.json;
logs /tmp/vendetta-v2-mpc-{rehearsal-tests-final,producer-regression}.jsonl,
/tmp/vendetta-v2-mpc-rehearsal-release.log y /tmp/vendetta-v2-deploy-policy.log.
Artifacts públicos del ensayo archivados, sin seeds de identidad ni PK/VK
serializadas. Estado privado en
/home/rodrigo/.cache/vendetta-audit/mpc-rehearsal-20261103-release.
SDK recuperado en /home/rodrigo/.cache/vendetta-tools/go/bin/go, mismo Go1.27.3
con hash de archivo previamente fijado; las rutas antiguas en /tmp ya no existían.

Siguiente criterio: diseñar y acotar una medición de capacidad por circuito/fase
antes de probar dominios completos. La máquina tenía ~18,95 GiB RAM total y
~14,82 GiB disponible; un SRS de dominio 2²³ requiere ~3 GiB sólo para arrays
de puntos, y la verificación puede mantener varios objetos más CS/temporales.
No se extrapola desde este ensayo ni se reabren etapas 1–5. Siguen pendientes
publicación autenticada de cierres y beacon futuro impredecible, participantes
independientes/autoridades, compilación del CS del juego desde bundle congelado,
importación/aprobación de artefactos y auditoría. Sin commits ni despliegues reales,
sin regeneración de setups existentes ni procesos pesados pendientes.

Manifest de fuentes/artefactos regenerado y verificado. Prettier y git diff --check
aprobados. Entrega de fuentes fuera de Git en
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261103-mpc-rehearsal/source.tar.gz,
con receipt.json externo; no se compartió con terceros.

## Continuación: capacidad de fase 1 con presupuesto y parada (3 de noviembre de 2026)

Se concretó el criterio anterior con una herramienta independiente, sin ampliar
la CLI de ceremonia ni los límites del ensayo de protocolo. Nuevo comando
`pnpm capacity:hidden-v2 --directory /ruta/externa/nueva --max-log2 14
--unsafe-test-only`, build offline fijado. Mide fase 1 nativa BN254 sin compilar
CS del juego, generar PK/VK ni persistir SRS/transcripts voluminosos. Sólo guarda
checkpoints, hashes y medidas; no lee ni modifica setups existentes. El challenge
es fijo y conocido, exclusivamente para medir capacidad, no para una ceremonia.

Un worker por tamaño, dos contribuciones y serialización, lectura de dos
transcripts frescos y verificación/sellado/hash del SRS. Se comprueba el tamaño
wire contra el modelo y el consumo completo del lector nativo. Los únicos bytes
nativos que se leen son los generados dentro del mismo proceso, nunca archivos
aportados por terceros; no sustituye al importador acotado de producción.

Presupuesto: máximo log2=16 en CLI, escalera ejecutada 10/12/14; 120 s wall,
90 s CPU, 4 GiB espacio virtual y 64 KiB/log por worker, cores deshabilitados.
Stop al observar RSS >512 MiB cada 25 ms y chequeo del pico rusage al salir.
Es muestreo con posible sobrepaso, no techo kernel RSS. La pérdida de observación
de un proceso vivo también lo termina; zombies/PID desaparecidos se distinguen.
GC 256 MiB y GOMAXPROCS=4 no son cuotas duras de RSS/CPU. Se exige MemAvailable
host >=2 GiB antes de cada muestra; no se presume reserva ni cuota de contenedor.
Cualquier fallo conserva informe incomplete/logs, espera salida y detiene toda
la escalera. No sobrescribe rutas existentes; sin aprobación de producción.

Resultado final en procesos separados: 2¹⁰ **2,242 s / 13,33 MiB RSS pico**;
2¹² **8,838 s / 21,75 MiB**; 2¹⁴ **34,968 s / 82,52 MiB**. Tres workers
terminados, seis checkpoints por worker. Los tiempos incluyen operaciones
identificadas en el informe; RSS pico acumulado incluye arranque/transitorios.
No se mezclan las ejecuciones de desarrollo con ésta ni se extrapola un SLA.

El modelo usa tamaños reales de tipos y wire del backend fijado, contrastados
en tests y muestras. Para dos contribuciones, el verificador mantiene tres
arrays de SRS durante su primera comparación; esta herramienta además retiene
dos buffers serializados. Subtotales del camino modelado: invalid-point 2²²
~4,5 GiB arrays + ~1,5 GiB buffers; opening 2²³ ~9 GiB + ~3 GiB. Se excluyen
runtime/GC/temporales/CS/proofs. Ambos figuran not-run-exceeds-experiment-budget;
no se lanzaron. Eso no demuestra incapacidad de la máquina. Los dominios y
circuitos son referencias declaradas, no CS del juego verificados.

Fase 2 sigue not-measured-requires-budgeted-game-cs: N no determina variables
privadas/compromisos del CS real. productionApproved, gameCircuitBytesVerified,
gameDomainMpcMeasured y phase2Measured permanecen false. Sigue pendiente definir
hardware/presupuesto con margen, reproducir/verificar CS desde fuentes congeladas
y medir ambas fases reales bajo supervisor; los números pequeños no lo cierran.
Ceremonia independiente, cierre público autenticado, beacon futuro impredecible,
importación/aprobación y auditoría siguen pendientes del hito 6.

Validación: **cinco tests Go principales y tres subtests (ocho eventos)** del
nuevo cmd/mpc-capacity; binario real en dominio 8, modelo wire, rechazo de dominios
grandes, timeout/RSS, espera de salida, parada tras fallo, informe incomplete y
no sobrescritura. Go vet, gofmt y sintaxis Bash aprobados. No se repitieron las
suites del juego ni los tests de la continuación anterior: no cambiaron sus
fuentes, circuitos, contratos, servicio ni dependencias.

Evidencia persistente, checkpoints originales y resultados en
[mpc-capacity](../benchmarks/timelock-opening/mpc-capacity/README.md).
Logs /tmp/vendetta-v2-mpc-capacity-{tests.jsonl,final.log}; estado externo
/home/rodrigo/.cache/vendetta-audit/mpc-capacity-20261103-final. El snapshot incluye
ahora también los pequeños logs públicos jsonl. Manifest regenerado/verificado,
Prettier y git diff --check aprobados. Paquete de fuentes separado fuera de Git:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261103-mpc-capacity/source.tar.gz,
con receipt.json externo, sin compartir con terceros. Sin commits, despliegues,
claves del juego nuevas ni procesos pesados pendientes.

## Continuación: ruta de compilación sin setup (3 de noviembre de 2026)

Se añadió `--compile-cs-v2 opening|invalid-point salida.json` al binario Go
principal. Compila la misma forma que el productor y calcula SHA-256 directamente
desde WriteTo, sin setup, claves, decodificación nativa ni buffer serializado
adicional. Registra tamaño, restricciones, dominio, variables y compromisos.
Salida exclusiva: fallos pueden dejar archivo vacío; exigir JSON completo y
salida cero. No impone límites de recursos por sí mismo.

El [procedimiento y presupuesto candidato](hidden-v2-cs-capacity.md) fija comparación
doble desde un nuevo bundle, digests históricos esperados, propuesta de compilación
con techo duro de 10 GiB y hardware dedicado de 64 GiB para futuros experimentos
MPC completos. Son presupuestos propuestos, sin capacidad real demostrada.

Validación: `go test -count=1 -run '^TestCompileCS' .` aprobó dos tests (digest y
metadatos contrastados con serialización/decodificación nativa pequeña, rechazo de
sobrescritura antes de compilar); `go vet .`, gofmt, Prettier del procedimiento y
git diff --check aprobados. No se ejecutaron suites completas ni compilación del
juego. Los tests pequeños no acreditan reproducción del CS del juego.

Próximo paso: implementar/probar supervisor de compilación con cuotas efectivas
y parada del grupo; congelar nuevas fuentes que incluyan esta CLI y ejecutar las
cuatro compilaciones bajo ese supervisor. El bundle de cierre anterior queda
intacto y no incluye este cambio. Aún no se creó un bundle de esta continuación.
Producción sigue bloqueada; sin cambios de setups, commits ni despliegues.

## Continuación: reproducción acotada del CS real (3 de noviembre de 2026)

El usuario autorizó continuar todos los puntos posibles sin esperar nuevas
instrucciones. Se implementó y probó el supervisor Python
`capacity:cs-hidden-v2`: pins de binario/fuentes, salida externa exclusiva,
dos compilaciones por circuito, comparación histórica y entre repeticiones,
informe incomplete y parada tras fallo. Los compromisos se resumen por tamaños,
sin volcar listas voluminosas de wires.

No había delegación cgroup disponible. Se eligió una alternativa kernel por
proceso: RLIMIT_AS=10 GiB, RLIMIT_CPU=2400 s, RLIMIT_FSIZE=1 MiB, cores cero,
wall=600 s y MemAvailable>=14 GiB antes de cada worker. Soft/hard se releen antes
de exec. El techo virtual también acota RSS del proceso, pero puede agotar las
reservas virtuales de Go antes; no es una cuota cgroup de RSS/CPU/swap para grupos.
La ruta de compilación fijada es un proceso Go sin hijos. GOMEMLIMIT=6GiB y
GOMAXPROCS=4 son objetivos del runtime. Timeout mata grupo y espera; Pdeathsig
termina el worker si pierde al padre. No es sandbox para binarios no confiables.

Se congeló/verificó el bundle de entrada
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-cs-compile-20261103-source.tar.gz`,
SHA-256 `db07990896e9ba8d39502fdb40046708f948a403454eeadbbdb3443c04570d02`,
698 fuentes. Se compiló offline desde su árbol extraído. Dos builds con
-trimpath/-buildvcs=false coinciden byte a byte; los 698 archivos extraídos
conservan sus hashes tras el build y las compilaciones.

Cuatro workers secuenciales terminaron. invalid-point: 50,903/35,398 s wall y
4,125/4,147 GiB MaxRSS; opening: 50,255/45,141 s y 5,336/5,570 GiB.
Cada par coincide exactamente en digest, tamaño y dimensiones del CS. SHA-256
coincide con los circuit.bin históricos, sin leer ni modificar esos setups.
`gameCircuitBytesVerified=true` para esta reproducción; MPC completo, fase 2 y
aprobación de producción siguen false. No se persistieron CS ni claves nuevas.

Nuevo `model:phase2-hidden-v2`: inventario de payloads de arrays desde dimensiones
reales del informe fijado por digest. Se contrasta contra arrays nativos de dos
circuitos pequeños, con/sin compromiso. Sumas listadas 5,795/9,448 GiB para
invalid-point/opening: no representan pico simultáneo ni presupuesto suficiente;
excluyen CS decodificado, runtime/GC/allocator, FFT, temporales, transcripts,
verificación/extracción. El host dedicado de 64 GiB continúa como candidato sin
reserva ni medición de capacidad real. No se amplía la herramienta MPC pequeña.

Evidencia pública y comandos en
[cs-reproduction](../benchmarks/timelock-opening/cs-reproduction/README.md).
Estado original y build/logs bajo
`/home/rodrigo/.cache/vendetta-audit/cs-compile-20261103-{run1,build,validation}/`.
Los *.log públicos se copian como *.stdout.txt con bytes idénticos; JSON nativos
no se reformatean para conservar pins. Las pruebas y el modelo adicionales son
posteriores al bundle de entrada; la entrega final conserva el árbol de cierre.

Validación: 11 tests Go principales y 23 subtests, **34 eventos aprobados** en
Producer/SetupMPC/CompileCS. Nueve tests Python, con tres subcasos de límites
kernel. Incluyen timeout/reap, muerte al perder padre, pin/margen incorrectos,
fallo persistido, diferencia entre repeticiones y no sobrescritura. Go vet,
go mod verify, gofmt, compilación Python, Prettier y git diff --check aprobados.
No se repitieron suites web/rules/Solidity porque no cambió su implementación.

Siguiente criterio: hardware reservado y supervisor por operación para fase 1
y fase 2 del juego; después procedimiento independiente/cierre autenticado/beacon
futuro, importación y registro de aprobación de artifacts, auditoría y retests
con artifacts finales. No confundir esta reproducción con procedencia segura de
claves. Mantener producción bloqueada. Sin commits, cambios de setups existentes
ni despliegues reales. Ningún worker pesado queda en ejecución.

Entrega de cierre fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261103-cs-reproduction/source.tar.gz`,
con receipt.json externo. Su digest se conserva allí para evitar autorreferencia.

## Continuación: inspección nativa en streaming (3 de noviembre de 2026)

Se avanzó una parte del importador que no requiere el host reservado: paquete
Go `mpcinspect`, CLI independiente `cmd/mpc-inspect` y comando
`pnpm inspect:mpc-hidden-v2`. No cambia el ensayo pequeño, circuitos, servicio,
setups existentes ni barreras de producción.

Dos pins externos: política dimensional JSON (shape) y bytes del transcript.
El parser de shape reutiliza JSON estricto de ceremony (64 KiB/profundidad 16),
exige seis campos y acota dominio/PKK/compromisos/sumas antes de leer. La CLI
rechaza symlinks finales, FIFO y directorios; comprueba tamaño exacto de archivo.
El scanner usa buffer fijo de 64 KiB, lee como máximo tamaño calculado+1 y
comprueba tags comprimidos, dominio, longitudes, challenge de 32 bytes, EOF/hash.
Nunca llama ReadFrom ni asigna arrays nativos. Default 64 KiB, techo 2 GiB de
lectura explícita: no es permiso para ejecutar esos dominios ni un límite de
CPU/I/O. El wrapper hace build offline y conserva rutas relativas de Bash/pnpm.

El éxito se llama framing-only. pointsValidated, circuitBytesVerified,
mpcTranscriptVerified, artifactBytesVerified y productionApproved siguen false.
Se prueba expresamente que un punto inválido para el decoder nativo puede pasar
el formato, conservando esos flags. El hash de CS de la shape es declarado,
sin autenticación de su relación con esos bytes. Este inspector no es todavía
un importador seguro ni sustituye el registro de aprobación.

Smoke del binario real: fase 1 archivada del ensayo pequeño, dominio 8,
1801 bytes y hash correcto; presupuesto de un byte rechazado con salida no cero
y sin JSON de éxito. No se volvieron a verificar firmas en este smoke. Las shapes
de ambos circuitos/fases se derivan del informe de reproducción fijado por digest;
los tests comprueban sus límites y el rechazo previo a leer por defecto. No se
leyó ningún transcript del juego ni se midió MPC real.

Validación: 12 tests principales y 49 subtests nuevos (**61 eventos**), más
regresión mpcrehearsal con siete principales y 22 subtests (**29 eventos**).
**90 eventos aprobados**, ningún fallo. Serialización nativa real pequeña en
ambas fases con cero/uno/dos compromisos, todos los truncados, longitudes y sumas
maliciosos, codificación, pins/JSON, presupuesto previo a lectura, archivos
especiales y CLI/wrappers reales. Entrada sintética de ~3 MiB con asignaciones
adicionales <=512 KiB en test, sin afirmar RSS total. Go vet, gofmt, sintaxis Bash,
go mod verify, Prettier y git diff --check aprobados. Sin repetir suites de juego.

Comandos, shapes y evidencias en
[native-inspection](../benchmarks/timelock-opening/native-inspection/README.md) y
[procedimiento](hidden-v2-native-inspection.md). Estado/logs originales fuera de
Git: `/home/rodrigo/.cache/vendetta-audit/mpc-inspect-20261103/`.

Pendientes de software: derivar dimensiones desde CS autenticado para importación,
decodificar/verificar puntos y canonicalidad bajo presupuesto sobre los mismos
bytes fijados, comprobar MPC y vincular cierres/beacons/artefactos a una aprobación
independiente. Hardware reservado sigue pendiente para mediciones MPC completas.
No se amplían las herramientas pequeñas ni se presentan estos checks como
ceremonia/auditoría. Sin claves nuevas del juego, commits o despliegues reales.

Entrega de cierre fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261103-native-inspection/source.tar.gz`,
con receipt.json externo que fija su digest. La entrega de CS anterior queda intacta.

## Continuación: lectura protegida, CS y protocolo completo pequeño (3 de noviembre de 2026)

El usuario corrigió las paradas después de subtareas y reiteró que se debe
continuar todo lo posible sin esperar otro «continúa». Se avanzó la ruta completa
de entrada nativa hasta integrarla y ejecutarla en el protocolo MPC pequeño.

Nuevas APIs en mpcinspect: ShapeFromCS deriva dimensiones desde un R1CS BN254
compilado y comprueba su digest por streaming; NewGuard no entrega un prefijo al
decoder antes de validarlo contra esa shape; Decode utiliza exactamente esos
bytes para ReadFrom, comprueba puntos/subgrupos, consumo/EOF/hash y reserialización
canónica por streaming. No se reabre un archivo después de un preflight. Ante
cualquier fallo no devuelve objeto nativo utilizable.

Decode exige presupuestos wire y de payload de puntos; este último es sólo un
subtotal, no techo RSS (refs/proofs/runtime/temporales adicionales). El protocolo
pequeño llama a estas APIs dentro de los workers existentes con 4 GiB AS,
20 s CPU, 30 s wall, 64 KiB/archivo, sin cores; payload <=1 MiB y wire <=32 KiB.
Las shapes se derivan del CS fijo compilado y ligado al config pin; no proceden
de las longitudes aportadas por el contribuyente. La API aislada sólo acredita
puntos/canonicalidad, sin atribuirse MPC, aprobación o autenticidad del pin.

La prueba integrada verifica ambas fases MPC sobre entradas protegidas, extrae
claves y genera/verifica una prueba Groth16 nueva, rechazando input público
sustituido. El ensayo final real repite ocho procesos separados, ambos
contribuyentes/fases/cierres y extracción idéntica desde objetos frescos.
793 ms sumados de worker wall, 30084 KiB MaxRSS entre workers, ocho salidas
confirmadas. Son sólo cinco restricciones y dominio 8; no se extrapola al juego.
guardedNativeDecoding=true; productionApproved, independentParticipants y
beaconAfterClosureProven permanecen false. No hay claves nuevas del juego.

Validación final: 28 principales contando el corpus fuzz y 88 subpruebas,
**116 eventos aprobados** entre mpcinspect/mpcrehearsal y sus CLI. Incluye bombas
de longitudes antes de entregarse al decoder, proceso adversario con límites
kernel, cero/uno/dos compromisos, CS/digest incorrectos, puntos inválidos,
canonicalidad, consumo incompleto y regresiones del protocolo. Fuzz acotado a
10 s/dos workers: **6247 evaluaciones** sin fallo, comparando Scan y Guard sin
decoder nativo y con entradas <=64 KiB. Go vet, go mod verify, gofmt, Prettier
y git diff --check aprobados. Sin repetir suites del juego al no cambiarlo.

Evidencias públicas en
[guarded-native-import](../benchmarks/timelock-opening/guarded-native-import/README.md)
y [API/procedimiento](hidden-v2-guarded-native-import.md). Estado privado final:
`/home/rodrigo/.cache/vendetta-audit/mpc-guarded-import-20261103-buffered-final/`;
logs `/home/rodrigo/.cache/vendetta-audit/guarded-native-import-20261103-validation/`.
Se copiaron sólo config/contribuciones/cierres/informes públicos; ninguna seed
de identidad. Intentos de desarrollo anteriores permanecen separados.

La siguiente ejecución verificable requiere transcripts reales del juego y
hardware reservado con presupuestos/supervisor revisados. No hay acceso a ese
host configurado en esta sesión; se preguntó de forma asíncrona si existe, sin
detener el trabajo local. No usar falta de respuesta como autorización o acceso.
No ampliar los límites pequeños para suplirlo. También siguen pendientes
participantes/cierre/beacon independientes, importación y aprobación de artefactos
finales, auditoría y retests. No simular esas evidencias con identidades locales.

Fuente de cierre fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261103-guarded-native-import/source.tar.gz`,
receipt.json externo con digest. Entregas previas intactas. Sin commits, cambios
de setups existentes ni despliegues reales; todos los workers del ensayo salieron.

## Continuación: dominios reales en esta PC (4 de noviembre de 2026)

El usuario cuestionó la exigencia de otro servidor. Se corrigió: 64 GiB era una
propuesta conservadora, no un mínimo demostrado. La PC tenía ~18,95 GiB totales,
~15,1 GiB disponibles y swap existente de 5 GiB, sin modificar su configuración.
Se ejecutó una prueba separada y acotada de inicialización/hash de fase 1 en
ambos dominios reales; no se elevaron los límites de capacity:hidden-v2.

Nuevo `pnpm probe:local-hidden-v2 --directory /ruta/externa/nueva --unsafe-test-only`.
Un worker a la vez; 8 GiB de espacio virtual, 90 s CPU, 120 s wall, 64 KiB por
archivo, cores cero, readback soft/hard y MemAvailable>=12 GiB antes de cada
worker/dominio real. GOMEMLIMIT=5GiB y GOMAXPROCS=4 son objetivos, no cuotas.
Se reutiliza timeout de grupo/Pdeathsig/espera de salida del supervisor existente
mediante SuperviseWorker; no se cambian los límites del ensayo MPC pequeño.

Operación única: NewPhase1(N) y WriteTo directamente a SHA-256, sin buffers wire
completos, contribuciones, verificación, lectura de CS ni generación de PK/VK.
Sólo persiste checkpoints y metadatos. El estado inicial tiene challenge vacío;
wire=192N+233, no el tamaño de contribución con challenge de 32 bytes.

Resultado: 2²², **8,939 s / 2,414 GiB MaxRSS**; 2²³, **15,210 s / 4,742 GiB**.
Los dos workers terminaron y sus PID ya no existen. Esto demuestra que esas
operaciones reales caben localmente bajo el presupuesto elegido. No demuestra
capacidad de contribuciones/verificación/fase 2 ni SLA. gameDomainInitializationMeasured
es true; gameDomainMpcMeasured, contributionsMeasured, phase2Measured y
productionApproved permanecen false.

Evidencia en [local-domain-probe](../benchmarks/timelock-opening/local-domain-probe/README.md),
estado original `/home/rodrigo/.cache/vendetta-audit/local-domain-probe-20261104-run1/`
y logs bajo `local-domain-probe-20261104-evidence/` en el mismo padre. Validación:
tres tests nuevos y regresión mpcrehearsal, diez principales/22 subtests,
**32 eventos aprobados**. Worker/binario real pequeño, wire nativo, flags/dominios,
margen insuficiente, parada tras fallo, informe incomplete, no sobrescritura y
lifecycle. Go vet, gofmt, Bash, Prettier y git diff --check aprobados.

Siguiente criterio: presupuesto por operación para una contribución (primero
dominio menor), después verificación con lectura streaming y sólo los objetos
necesarios residentes. Fase 2 debe separar compilación/persistencia del CS y
lectura en worker fresco para liberar transitorios. Se mantiene la autorización
de continuar localmente sin pedir otro «continúa». La consulta previa sobre un
host remoto ya no bloquea esta línea de trabajo. Sólo decidir otra máquina tras
medir una operación que supere el presupuesto local. La ceremonia independiente,
procedencia/aprobación y auditoría siguen pendientes, producción bloqueada.
Sin cambios de setups existentes, claves nuevas del juego, commits ni despliegues.

Entrega de cierre fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261104-local-domain-probe/source.tar.gz`,
con receipt.json externo. Entregas anteriores intactas.
