# Continuidad de sesión: hidden v2

Estado vigente: transporte acotado de certificados (10 de noviembre).
El propietario confirmó trabajar sin colaboradores externos, entre Codex y Claude.
Anvil local sigue efímero; todos los ACTIVO históricos están vencidos.

## Nota documental posterior: especificación integradora de hidden v2

Por solicitud del propietario se creó
[la especificación de implementación](../hidden-v2-implementation-spec.md), para
que otro implementador disponga de arquitectura, formatos binarios/ABI, contexto,
circuitos/H3, estados/frontera, productor/keeper, operación, pruebas y gates finales.
Describe la implementación actual y separa requisitos de producción no acreditados.
Se contrastó con fuentes y feedback real de Claude; véanse revisión y metadata
`docs/reviews/hidden-v2-claude-implementation-spec-20261110*`.
No se cambió lógica ni se repitieron suites, setup o proving del juego: los33/5 y
182/27 anteriores conservan sus alcances. Se comprobaron formato, enlaces, tamaños,
constantes y preservación de fuentes. La especificación advierte sobre resúmenes/
comentarios históricos obsoletos; no copiar de ellos aparcado/reveal directo ni
helpers V1 de contexto/armor.

Cierre documental nuevo, sin sustituir recibos anteriores:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261110-implementation-spec/receipt.json.
El guardado inferior sigue siendo el punto de implementación; esta petición sólo
añade documentación, revisión e inventario. No autoriza trabajo en segundo plano
ni retira gates de producción. La próxima sesión debe leer también la especificación.

## Guardado vigente por solicitud del propietario: 10 de noviembre de 2026

Sesión guardada para continuar en otra sesión por solicitud explícita. No quedan
trabajos autorizados para seguir en segundo plano. Retomar implementación sólo
ante una nueva instrucción del propietario. El cierre vigente de implementación
es hidden-v2-20261110-certificate-transport/receipt.json:33 tests/5 archivos,
ambos typechecks, tres revisiones reales de Claude y sus límites documentados.
Este guardado sólo actualiza documentación e inventario; no repite tests ni añade
revisión de implementación. Los cierres anteriores y sus evidencias se conservan.

Rama comprobada feat/hidden-v2-local-mpc-review; HEAD
c84b9f6393e57025df4c3648ec59f7fe4dc6c040. Se conservan los cambios tracked/untracked,
sin commits, push, limpieza ni operaciones criptográficas o despliegues.
Al retomar comprobar estado real y leer este handoff, CLAUDE.md, el prompt siguiente
y docs/service-operations.md. No interpretar los ACTIVO históricos como vigentes.
Elegir otra carencia demostrable de producción resoluble localmente; la línea de
transporte está cerrada con sus pruebas y revisiones, no repetirla para conteos.
Anvil sigue efímero; conservar journals/leases de cadenas persistentes. Sólo
Codex/Claude, sin volver a preguntar por colaboradores. Host con usuarios separados
y hardening, recursos/alertas/cadena/candidato y procedencia/aprobación final
siguen sin acreditarse. Mantener gates y exclusiones de MPC/setup/proving del juego.

Guardado documental reproducible nuevo:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261110-session-save/receipt.json.
Enlaza el cierre de implementación sin sustituirlo; conserva fuentes y evidencia
originales. El prompt de próxima sesión fija ese punto de continuidad.

## Continuación vigente: transporte de certificados, 10 de noviembre de 2026

Se retomó el bloque interrumpido del7 por instrucciones nuevas del propietario.
Rama feat/hidden-v2-local-mpc-review; HEAD real c84b9f6393e57025df4c3648ec59f7fe4dc6c040,
posterior a la referencia fe95eab. No se hicieron commits en esta continuación.
Al retomar había sólo src/chain/certificates.ts y su test
modificados; se conservaron. Las evidencias /tmp del7 ya no existían y no se
atribuye resultado alguno a esa consulta Claude perdida. Los cierres anteriores
service-operations-close y session-save permanecen intactos y con su alcance.

Defectos reproducidos contra HEAD mediante fixture finito sin red/criptografía:
requestCertificate aceptaba un array convertido por regex y un JSON65573 bytes
con certificado pequeño. Ahora retiene <=65536 bytes decodificados antes del
parseo, exige string y conserva máximo16384 bytes de certificado. Cancela cuerpo
excesivo sin EOF y respuestas fallidas sin parsearlas. UTF-8 inválido/JSON/forma
fallidos son errores reintentables; jamás INVALID. No cambia el timeout120s,
señales de parada, journals, leases ni protocolo criptográfico.

Claude confirmó que el resumen seguro ocultaba el nuevo error de exceso; se
corrigió con categorías estáticas para401/403/429/otros HTTP/exceso, sin URLs,
bodies ni mensajes remotos. Su duda sobre tamaño de proof se contrastó con
proof-cache.ts: exige384 bytes antes de codificar; ambos sobres ABI caben.
Las sugerencias sobre timers de Node no demostraron defecto nuevo; Node>=22
ya es requisito. Un fallo real que coincide con parada mantiene exit no cero
por política vigente. TLS sigue siendo requisito de despliegue, no autorización.

Validación propia final:33 tests/5 archivos (certificates, keeper-certificate-stop,
keeper-shutdown, service-errors, service-logging), ambos typechecks y formato.
HTTP real sobre loopback: gzip, rechazo de redirect sin contactar destino,
parada antes/durante body y cancelación de chunked sin EOF; handler productor real
con sobres ABI y proof bytes sintéticos, sin factory criptográfica ni pruebas del
juego. No sumar los17/19 tests preliminares ni los182/27 históricos a este conteo.
Las ejecuciones restringidas sin diagnóstico están separadas de la suite final.
El stdout final se archivó desde la salida original de herramienta. Los29 tests
previos quedaron registrados aparte desde el resultado observado; no reemplazan
la ejecución final33. Véase la revisión y metadata asociada.

Cierre nuevo externo persistente:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261110-certificate-transport/receipt.json.
Incluye fuentes congeladas reproducibles, originales de revisión y pins de entrada.
Los originales de noviembre10 siguen disponibles; no confundirlos con /tmp perdido
del7. La línea de transporte queda acotada; no acredita RSS/capacidad, host con
usuarios separados/hardening, SLA ni aprobación de claves. Seguir por otra carencia
local demostrada de producción; recursos/alertas/cadena/candidato/procedencia
siguen pendientes de entradas reales. Sólo Codex/Claude, sin colaboradores externos.
Anvil efímero, todos los ACTIVO históricos vencidos, gates de producción intactos.
Sin MPC/init/FFT/sellados/setup/replay/proving del juego ni despliegues/publicaciones.

---

Historial preservado: el guardado siguiente fue reanudado por el propietario.

## Punto de continuidad guardado por solicitud del propietario

Sesión detenida por solicitud explícita para continuar luego. No quedan tareas de
esta sesión autorizadas para seguir ejecutándose en segundo plano. El cierre de
implementación vigente es service-operations-close/receipt.json; conserva182 tests/
27 archivos, ambos typechecks, seis revisiones reales de Claude y aceptación de
arranque/cierre sin proving. No repetir esos trabajos para nuevos conteos.

Al retomar: comprobar rama/HEAD y estado real, leer la continuación vigente inferior
y el prompt de próxima sesión. Prioridad de producción, sólo Codex y Claude, sin
colaboradores externos. Anvil efímero y gates de producción intactos. Buscar la
siguiente carencia demostrable que no exija inventar aprobación o repetir las
operaciones criptográficas excluidas. Host privilegiado/recursos/alertas y procedencia
final permanecen limitaciones; no pedir privilegios ni colaboradores por defecto.
Todos los ACTIVO antiguos están vencidos; ningún PID archivado autoriza matarlo.

Guardado documental reproducible nuevo:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-session-save/receipt.json.
No sustituye ni modifica el recibo anterior ni sus fuentes. Sin commits/push.

## Continuación vigente: parada y supervisión de servicios persistentes, 7 de noviembre de 2026

Decisión resuelta: sin colaboradores externos; no volver a preguntar si se contrata
una firma o se incluyen participantes como condición para avanzar software local.
La decisión no acredita independencia ni procedencia segura del setup. Las claves
experimentales siguen unsafeLocalSetup=true y no se retiran los gates de setup.ts,
Deploy.s.sol o deploy-gnosis.sh. No se ejecutó MPC/FFT/setup/sealing/proving/replay
del juego ni despliegue real. Prioridad: necesidades reales de producción; no
recuperación de partidas Anvil descartables.

Carencia operativa demostrada: la CLI anterior del productor usaba process.once
tras construir el servicio; una segunda SIGTERM interrumpía el cierre. Fixture de
fuente baseline con sólo import de factory sustituido: close iniciado/no terminado,
exit por SIGTERM (-15), sin criptografía. El keeper no manejaba parada cooperativa.
No eran agujeros nuevos de seguridad del estado: flock/journals ya protegían
salidas abruptas. Se corrigen operabilidad, admisión de trabajo y estados de salida.

Nueva service-stop.ts mantiene SIGINT/SIGTERM/SIGHUP mientras se drena y hace la
espera de polling interrumpible. Prover serve.ts valida puerto antes del factory,
recuerda parada durante construcción, no abre listener después de ella, maneja
fallo de bind síncrono/asíncrono y listener inesperado, agrega error+limpieza y
cierra recursos una vez. Keeper deja de programar trabajo nuevo, cancela HTTP de
certificados (también body), comprueba parada entre lecturas del índice y conserva
el lease hasta acabar tick. Firma compartida comprueba antes de preparar, antes de
firmar y después de firmar: antes de publicar se puede abortar; tras publicar se
liquida o conserva el journal. No se modificó el protocolo de recovery/journals.

Hallazgo adicional confirmado de Claude: la ruta standalone pasaba process.env a
workers e inspecciones, incluyendo H3/tokens. environment.ts filtra ambos caminos,
incluso nativeEnv explícito; sólo locale/rutas/runtime Go documentados. No es un
sandbox frente a un binario hostil del mismo usuario.

Plantillas inertes en scripts/systemd/: Node directo, KillMode=mixed, directorios
privados, hardening y backoff. No instaladas ni habilitadas. Validación de sintaxis
sobre copias con única sustitución de ruta Node instalada. Probe real del manager
user systemd259 con fixtures Python/flock: stop normal, padre SIGKILL+restart sin
solapamiento, plazo agotado; hijos en grupo separado muertos y lease recuperado.
128MiB/32tasks/1s son presupuestos sintéticos, no de producción. Los recursos del
host real deben fijarse con evidencia y drop-in; TimeoutStopSec150 sólo es presupuesto
de escalamiento, sin SLA de cierre frente a filesystem colgado. Ver
[operación persistente](../service-operations.md).

Verificación conjunta vigente:182 tests/27 archivos, typechecks scripts y web.
Fixtures de entry-source del productor sólo sustituyen factory por HTTP/Nodeworker/
flock: parada repetida en ejecución y construcción, exit0, worker reaped, lease
libre, sin listener tras parada temprana. Keeper child real con RPC/journal
sintéticos conserva lease durante lectura y durante recibo de journal publicado;
liquida y sale sin nuevas consultas. Cancelación prepublicación no escribe journal;
timeout posterior conserva bytes. No afirmar prueba completa de misiones/proving,
aceptación del host objetivo, capacidad o disponibilidad remota.

Feedback real y disposiciones: [revisión operaciones persistentes](../reviews/hidden-v2-claude-service-operations-20261107.md).
Claude no ejecutó tests. Prompts/respuestas originales, pins y ensayos separados
fuera de Git: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-service-operations/.
Cierre reproducible nuevo: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-service-operations-close/receipt.json.
Conservar los cierres previos, incluido ephemeral-local-close. Branch/HEAD siguen
feat/hidden-v2-local-mpc-review / fe95eab652303b5f84d5ec18fb1a4364c8b2880e.
Todos los cambios anteriores tracked/untracked conservados, sin commits/push/limpieza.

Correcciones tras revisión: unidades con UID/grupo distintos, reintento30s sin
lockout permanente y comprobación STATE_DIRECTORY antes de lease/RPC. Cierre
conserva todos los errores de recursos y lease; cleanup de caché no tapa error
primario ni descarta certificado válido (cache.healthy=false y preprune obligatorio
en la próxima petición). Límites Go vacíos usan8/6GiB. Se reprodujo fuga de URL con
API key sintética en stderr; logging ahora sólo categorías/errno/mensajes estáticos,
sin mensajes arbitrarios, stacks ni URLs de terceros. El manejo interno conserva
objetos originales/errores agregados.

Productor CLI/factory reales también arrancaron con artefactos existentes en Anvil
real-consumer efímero, métricas0requests/0proofs, salida natural0 y lease libre,
stack cerrado. Keeper real canceló body de certificado en fixture ABI/logs/vistas
sintético sin firmar/enviar; no es replay Game. Sandbox del system manager no se
ejecutó: denegó autorización no interactiva; no se instalaron servicios ni se
escalaron privilegios. Host objetivo con UIDs distintos y hardening completo sigue
sin aceptación. Los probes user manager sólo prueban su política común de kill/
restart, no toda la plantilla de producción. Addenda interpretan null como N/A
sin reemplazar los resultados originales que usaban false en casos no aplicables.

Cierre adicional de disponibilidad: caché JSON/forma/binding inválido se descarta
como miss. Rechazos deterministas de ambos consumidores se decodifican con ABI
compartida real (incluye InvalidExhaustionClaim/MismatchedScalar), se evicta y se
cuenta proofRejections con kind/reason estáticos; RPC/UnfinishedPrefix/selector
unknown conservan caché. Inputs no canónicos se rechazan antes de H3 packing.
Se probaron los nombres reales exportados y declaraciones de contratos; H3Prefix
confirma estados2/3 y scalar agotado0. False de opening es plaintext inválido
probado, no rechazo de proof. Tres outputs archivados sólo se leyeron para
compatibilidad de esquema/hash intacto; no son tres proofs nuevos. Seis reviews
reales completas, sin atribuir a Claude ejecución de pruebas. Aceptación vigente
real-entry-abi/result.json fija fuentes actuales incluidas state-lease.ts/consumer-abi.ts;
los intentos anteriores conservan sus fuentes y límites, sin reemplazarlos.

Siguiente trabajo: carencias demostradas de producción que puedan implementarse
sin inventar autoridad ni repetir criptografía excluida. No reabrir Anvil recovery,
ni pedir otra vez colaboradores. La procedencia/aprobación final continúa sin
acreditarse; los ensayos operativos no la resuelven. Límites de recursos/host,
alertas y política final de cadena/candidato siguen explícitos, sin simular SLA.

---

Historial preservado; las consultas antiguas sobre colaboradores ya fueron respondidas.

## Continuación vigente: Anvil efímero y prioridad de producción, 7 de noviembre de 2026

El propietario decidió que las partidas locales son descartables y pidió retirar
toda recuperación local. Se eliminan --resume, snapshots/checkpoints/.used,
identidades persistidas para reanudación, pins de fuentes/Anvil para restauración,
attempt-UUID, gateway de congelación y drain del pool para guardar. session.ts y
rpc.ts y sus tres suites específicas de recuperación se retiraron; originales en
before-source.tar.gz externo y cierres previos íntegros. receipts.ts sólo escribe
JSON diagnóstico exclusivo. No confundir esta retirada autorizada con limpieza
del resto de cambios tracked/untracked del usuario.

Cada ejecución exige directorio externo nuevo, despliega nueva Game y crea nuevos
signers de servicio sólo en memoria/entorno. Conserva logs/cache/build privados,
flock y journals del productor/keeper durante la sesión; nunca reutilizarlos contra
otra cadena. No hay borrado automático. Cierre ordenado y grupos de procesos
administrados se mantienen. Tras un crash, se inicia otra sesión. No ampliar esta
ruta ni tratar recuperación efímera como bloqueo de producción.

Anvil escucha directamente en el RPC configurado. Además del preflight, se espera
su propia línea de listener antes de funding/deploy: se corrigió la carrera de
ocupación del puerto señalada por Claude. Cancelación de startup sale1; cierre
normal de una sesión lista sale0 si la limpieza pasa. Los recibos no autorizan
restauración. La CLI rechaza flags adicionales, incluido --resume.

Verificación propia:75 tests/9 archivos y typecheck scripts. Aceptación real final
con verificadores existentes: keeper SIGKILL detiene la sesión, directorio usado
rechazado byte a byte intacto, nueva Game y smoke browser (registro, construcción,
rutas, auth/canary), colisión RPC posterior al preflight rechazada sin una sola
petición al servidor ajeno y cancelación durante build sale1. Cero solicitudes de
certificados/proofs. Los ensayos fallidos de fixtures se conservan separados del
resultado final; no se suman repeticiones. No se ejecutó MPC/FFT/setup/sealing ni
replay/proving del juego. No se desplegó en red real.

Feedback real Claude y disposiciones: [revisión efímera](../reviews/hidden-v2-claude-ephemeral-local-20261107.md).
Claude no ejecutó pruebas. Prompts/respuestas originales e inputs fijados fuera de
Git en /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-ephemeral-local/.
Aceptación final final-acceptance/result.json. Cierre nuevo reproducible y recibo:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-ephemeral-local-close/receipt.json.
Todos los cierres anteriores se conservan y documentan fuentes históricas, no
capacidad actual de resume. Branch/HEAD sin cambios:
feat/hidden-v2-local-mpc-review / fe95eab652303b5f84d5ec18fb1a4364c8b2880e.

El propietario pidió dar prioridad a producción después de esta simplificación.
El [orden vigente de ejecución](hidden-v2-production-readiness.md#prioridad-vigente-del-propietario-producción-7-de-noviembre)
empieza por procedencia y política de confianza, importador/registro y bindings de
artefactos finales; después operación persistente y candidato de lanzamiento.
La preferencia anterior sin colaboradores externos debe conciliarse con
participantes independientes antes de fijar autoridad: se consultó al propietario,
no asumir una respuesta. Las claves actuales siguen unsafeLocalSetup=true; no
renombrarlas ni inventar aprobadores. setup.ts/Deploy.s.sol/deploy-gnosis.sh conservan
sus gates. Prioridad de producción no autoriza repetir operaciones criptográficas
excluidas, contactar terceros, publicar, push o desplegar. Mantener las decisiones
pendientes explícitas y avanzar lo independiente sin redundancias.

---

Historial preservado: los siguientes cierres describen versiones anteriores.

## Continuación vigente: recuperación de arranque y snapshots compactos, 7 de noviembre de 2026

Este apartado sustituye el cierre operativo anterior; los apartados siguientes son historial conservado. Branch/HEAD siguen feat/hidden-v2-local-mpc-review / fe95eab652303b5f84d5ec18fb1a4364c8b2880e. Todos los ACTIVO antiguos están vencidos.

Se corrigió una carencia reproducida: tras consumir un checkpoint, un fallo de productor, web o cancelación dejaba un mundo sano sin reanudación. Ahora la validación de bindings/clientes precede al consumo y un cierre limpio posterior guarda una generación nueva. Nunca se borra `.used` ni se vuelve a un checkpoint consumido. Fresh sólo guarda tras validar el constructor productor. Los recibos diferencian saved/unsaved/unknown; ante publicación ambigua sólo ofrecen candidateCheckpoint y el loader decide. Un error tardío al liberar lease no revoca un cierre autorizado. Se conservan ambos errores si fallan operación y liberación, incluidos setup, servicio, keeper y adquisición de lease.

El smoke lee credenciales de la sesión raíz aunque los recibos estén en attempt-UUID; comprueba mundo sin jugadores antes de abrir Chromium. No repetirlo sobre un mundo jugado: la negativa no cambia nonce/counters. También exige HTTP200 al comprobar el canary.

Otra carencia medida: copias históricas completas del estado dominaban el crecimiento de los dumps. Anvil ya no usa --preserve-historical-states. Conserva estado del dump head, headers/logs/recibos y nuevos estados posteriores; llamadas arbitrarias al estado anterior al dump no están disponibles. El head base permanece legible tras avanzar bloques en Anvil1.8.6 probado. revertName histórico puede devolver error genérico. Los bloques/transacciones siguen creciendo: 512MiB/60s son rechazos, sin duración segura ni garantía de disco. Un rechazo de guardado tras consumo todavía puede perder reanudación. No hay recuperación general de SIGKILL/host/Anvil crash ni de consumo ambiguo.

Verificación: 101 tests/11 archivos (local-hidden, producer-service, state-lease, keeper-lease, producer-worker) y typecheck scripts. Fixtures Node/EVM sintéticos, sin pruebas criptográficas nuevas. Aceptación real en loopback con artefactos consumidores existentes: fallo fresh, constructor con journal pendiente, recuperación de raw sin nonce nuevo, fallo web, cancelación consumida, cierre ambiguo y reanudación de candidato, smoke fresh y attempt, rechazo de mundo jugado. Un addendum restaura nueve snapshots sin minería: el exceso de entradas corresponde a genesis, no altura; genesis canónico y parentHash de bloque1 coinciden y se conservan. No se adopta proyección de duración por tamaño. Múltiples generaciones conservan Game, logs/recibos originales y hash del World (1 jugador, 1 edificio, cola1). loadWorld cruza bloques; pendingFor y CiphertextIndex ejecutados con índices de invitaciones/ciphertext vacíos, sin cobertura de misiones ocultas. Cero solicitudes de certificados/proofs.

Evidencias privadas: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-startup-recovery/. Acceptance final: verified-acceptance/acceptance/result.json; no sustituir los ensayos anteriores. Cierre reproducible nuevo: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-startup-recovery-close/receipt.json. El recibo fija fuentes, hashes, resultados y checkpoint final. El cierre session-resume-close anterior sigue intacto. Credenciales, dumps y journals quedan fuera de Git y prompts. PID antiguos no autorizan matar procesos actuales.

Feedback Claude real: [revisión y disposiciones](../reviews/hidden-v2-claude-startup-recovery-20261107.md), originales y pins asociados. Claude no ejecutó tests. No hay aprobación independiente ni de producción. Se retiró una hipótesis sobre pérdida del base head al contrastarla con Anvil instalado; se corrigieron nonce vacío y errores dobles. No repetir MPC/FFT/setup/sealing/replay/proving para nuevos conteos.

La línea local de recuperación documentada queda agotada con sus límites explícitos. La próxima sesión debe buscar una carencia demostrable distinta en código/operación, sin tratar limitaciones históricas ya corregidas como pendientes. Mantener hobby experimental, barreras de producción, todos los cambios anteriores y cierres originales; sin commits/push/despliegues reales.

## Continuación vigente: reanudación del mismo mundo local, 7 de noviembre de 2026

Branch/HEAD comprobados: feat/hidden-v2-local-mpc-review /
fe95eab652303b5f84d5ec18fb1a4364c8b2880e. Cambios anteriores tracked/untracked y
cierres previos conservados; sin commits, limpieza destructiva, push o publicación.

Carencia elegida: una caída del keeper o cierre normal perdía el mundo aunque
Anvil estuviera sano. Era una limitación documentada, no un bug del cierre anterior.
La ruta ahora conserva identidades Ethereum H3/keeper y permite reanudar un
checkpoint de cierre en la **misma sesión**, con Game, token y journals originales.
No migra sesiones antiguas que carecen de identidades/checkpoint.

- `bash scripts/dev-hidden-v2.sh config session --resume /absolute/checkpoint.json` exige el
  mismo config, pins, ABI, fuentes seleccionadas de ejecución/datos de reglas y
  binarios productor/Anvil. No compila, fondea, despliega ni genera claves de setup.
- Root lease flock heredado por hijos administrados; logs/recibos nuevos en
  attempt-UUID. Los recibos anteriores permanecen byte a byte intactos.
- Antes de consumir el checkpoint, Anvil lo carga sin escritores y con RPC público oculto.
  Hash histórico, head y nonces H3/keeper comprobados por backend privado.
  Fallo de validación conserva el checkpoint. La misma instancia Anvil continúa:
  no expone bloques de una rama temporal. Luego sincroniza `.used` exclusivo antes
  de exponer escrituras o iniciar productor/keeper: no borrarlo.
- Cierre: keeper/productor fuera; gateway bloquea escrituras de pestañas y batches,
  espera forwards ya admitidos y drena pool con bloques normales. No fuerza bloques
  ni tiempo/beacons. Anvil vuelca historial al salir; snapshot, inventario de estado
  y closed/checkpoint se sincronizan. Checkpoint sólo autorizado tras cierre exitoso.
- Stop/load Anvil60s y dump<=512MiB son límites de rechazo, no capacidad/SLA ni cuota
  física. No hay recuperación de SIGKILL/host/Anvil crash. Un startup consumido que
  falla puede perder la reanudación; jamás volver a cadena vieja con journals nuevos.
- CLI usa Node con loader tsx directamente: el wrapper CLI tsx podía enmascarar
  salida tras Ctrl-C de grupo. Cancelación consumida informa mundo no guardado y
  sale con error en el script directo. pnpm9 puede ocultar ese exit al recibir
  Ctrl-C de grupo; no se modifica el vendor. Usar el script directo y closed.json.
  Config fuera de fuentes/keys sigue siendo obligatorio.

Pruebas y revisiones se registran en
[revisión real y disposición](../reviews/hidden-v2-claude-session-resume-20261107.md).
Claude sólo leyó fuentes; las pruebas las ejecutó el agente principal. Prompts,
respuestas originales, pins, intentos de desarrollo y logs están en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-recovery-review/`.
El nombre conserva la fecha de inicio; el trabajo siguió el7 local.

Validación de implementación:65 tests TypeScript/9 archivos de sesión, gateway,
procesos/leases y recuperación real sintética de journals; typecheck. Incluyen
alteración de snapshot/journals/identidades/binario, fuentes/datos cambiados,
checkpoint consumido, validación con hash/nonce incorrectos con retry, generaciones,
pool atascado, dump no cero, fallo de drain y cancelación consumida. Anvil real
recupera journals minados H3/keeper y raw aún no enviado sin preparar otro nonce;
comprueba historial, enlace del bloque siguiente, timestamps y tarifa base.
No son pruebas de corte físico de energía ni de criptografía del juego. Anvil
muerto antes/durante drain da error de mundo no guardado, nunca un éxito silencioso.

Los ensayos completos de navegador y reanudación tienen logs separados por intento.
Run1 quedó rechazado al añadir el vínculo a fuentes durante desarrollo; run2
pasó dos reanudaciones y recuperación de keeper. Run3 confirmó el camino refinado
pero descubrió el exit0 del wrapper durante Ctrl-C; run4 confirmó el handler pnpm9.
Run5 pasó la entrada directa. Se preservan esos intentos y sus límites propios.
Run6 dejó un fallo de construcción: la traza confirmó out-of-gas delegado, no corrupción
del snapshot. Se añadió margen tras estimar en sendPlain (dev/admin local;4337 sin
cambios). La atribución inicial de gas se corrigió: límite177518, consumido173038;
la construcción posterior necesitó190493. Raw y corrección permanecen separados.

Run7/harness-v2 pasó el recorrido final: navegador con construcción, cancelación
previa al consumo con RPC503/checkpoint reutilizable, dos reanudaciones y keeper
SIGKILL,52 lecturas desde pestaña abierta sin retroceso ni head prematuro,
cancelación consumida con exit no cero, identidades/recibos previos idénticos y
cero requests/proofs. El primer harness leyó un stack.json todavía incompleto;
cerró y se reanudó el checkpoint del mismo mundo para completar el ensayo.
El recibo externo fija fuentes, resultados, hashes y límites.
Todos permanecen archivados; no se sustituyeron artefactos ni recibos.

[Guía operativa](../local-hidden-v2.md). La evidencia criptográfica Game/H3 sigue
siendo la archivada. Cero MPC/init/FFT/sellados/generación de claves de setup y
ningún replay/proving del juego nuevo. Producción e independencia siguen bloqueadas;
los snapshots e inventarios locales no acreditan procedencia segura ni aprobación.

Cierre reproducible, inventario, revisión final y recibo externos nuevos:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-session-resume-close/`.
Conservar los cierres anteriores local-stack-close y session-handoff del6.

## Punto de reanudación guardado: 6 de noviembre de 2026

El propietario solicitó guardar estado y un prompt para nueva sesión. Usar el
[prompt de continuación](hidden-v2-next-session-prompt.md), que conserva la
instrucción de feedback real con Claude por bloque significativo y continuidad
autónoma sin parar después de cada etapa. No implica abrir otro ensayo MPC.

Estado real comprobado: branch feat/hidden-v2-local-mpc-review, HEAD
fe95eab652303b5f84d5ec18fb1a4364c8b2880e, con todos los cambios tracked/untracked
anteriores preservados y sin commits. El cierre de implementación permanece en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-local-stack-close/receipt.json`:
bundle SHA20cb8012138dcdf5da56e79e5bff7ae06951dfa8806bb37a212ac5b459bd45aa,
991 fuentes,746 hashes,151 tests TS/21 archivos y38 Python. La evidencia criptográfica
real sigue siendo el replay archivado; no confundir con el flujo browser mock.

No se deja un worker propio trabajando ni un fallo confirmado pendiente de la
línea cerrada. La siguiente sesión debe elegir una carencia local demostrable,
no reabrir por defecto las comprobaciones concluidas. Límite concreto a evaluar:
el launcher es single-use y no conserva el mundo al apagar. Persistencia/reanudación
no está implementada; nunca reciclar journals contra otro Anvil. El recorrido
oculto completo del nuevo launcher tampoco se volvió a ejecutar, por la instrucción
de no repetir proving/replay del juego.

Para repetir la modalidad de revisión con Claude, conservar prompts/respuestas
fuera de Git y entradas fijadas por hash. Invocación utilizada (verificar CLI
actual antes de asumir flags/versiones):

```bash
claude --safe-mode --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --tools '' --permission-mode dontAsk --no-session-persistence \
  --effort medium --output-format json -p < prompt.txt > response.json 2> stderr.txt
```

Claude lee fuentes, sin herramientas en esta modalidad. El agente principal
reproduce los hallazgos y ejecuta las pruebas. No enviar los archivos privados
de credenciales de sesiones ni claves/transcripts; no confundir una respuesta
real archivada con aprobación independiente o tests ejecutados por Claude.

Esta actualización sólo guarda continuidad; no modifica implementación ni vuelve
a ejecutar suites sin justificación. El inventario se actualiza y se congela una
entrega documental nueva en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-session-handoff/`, con receipt
que enlaza el cierre anterior y comprueba que el código/evidencia permanecen idénticos.
Los cierres previos y sus recibos no se sobrescriben.

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

## Continuación local: fronteras del adaptador, 5 de noviembre de 2026

Tras el commit `fe95eab` en `feat/hidden-v2-local-mpc-review`, se continuó con
revisión interna de las APIs de mpcstaged. No se repitió MPC, inicialización/FFT
ni proving del juego. No se cambiaron setups, manifests de claves ni evidencia
raw del replay completado.

Se reprodujeron y corrigieron dos defensas de API:

1. `Prepare` aceptaba un CS de bytes distintos con las mismas dimensiones,
   incluso con toda la caché reanudada. Ahora comprueba SHA-256 del CS en
   streaming contra el contexto del store antes de leer commons, usar caché
   o emitir etapas. La CLI ya comprobaba el CS antes de llamar: no se atribuye
   un bypass a las ejecuciones históricas. También rechaza store nil.
2. `LoadG1`/`LoadG2` devolvían puntos parciales con error de decoder, o puntos
   completos cuando fallaba el callback posterior. Ahora devuelven nil ante
   todo error. Los callers existentes ya comprobaban el error; la corrección
   evita una futura reutilización incorrecta de resultados fallidos.

Las seis variantes adversarias nuevas fallaron antes del parche y pasan
con él. Regresión offline de mpcstaged/mpcstream/mpcinspect/cmd/mpc-local-pipeline:
**158 eventos Go aprobados** (51/18/64/25), cero fallos; incluye circuitos
pequeños con comparación exacta nativa y pruebas positivas/negativas. Go vet,
go mod verify y gofmt aprobados. La evidencia final existente también volvió
a pasar el cotejo de hashes/copias/originales externos, sin reejecutar criptografía.
Prettier y git diff --check aprobados.

Alcance, reproducción y límites en
[revisión interna](../reviews/hidden-v2-staged-boundaries-internal.md).
No es auditoría independiente. No modifica ecuaciones, formatos de caché ni
algoritmo declarado; añade un pase SHA del CS en Prepare, sin buffer serializado.
Ese pase adicional no está medido en dominio completo. Mantener las mediciones
históricas asociadas a sus fuentes/binarios v6/v7. Los CS/layouts siguen siendo
salidas confiables del compilador: esto no habilita deserialización arbitraria
ni autenticación independiente de los pins.

Bundle nuevo de cierre y recibo fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-staged-boundaries/`.
Incluye logs antes/después del parche; el receipt fija digest/número de fuentes.
El inventario del benchmark se actualizó sin reemplazar outputs existentes.
No se hizo nuevo commit ni push en esta continuación.

Siguiente frontera sigue siendo revisión independiente/procedencia. Faltan
identidades de revisores/participantes y política externa de aprobación
(quórum, vigencia, revocación y bindings), publicación autenticada del cierre,
beacon futuro impredecible y objetivo/presupuesto de operación. No hay evidencia
local que permita decidir esas identidades o aprobar nuestros propios cambios.
La preparación de revisión describe las entradas disponibles; producción sigue
bloqueada. Sin publicaciones, contactos o despliegues reales, ni workers pesados.

## Continuación local: inventario de exports, 5 de noviembre de 2026

Se implementó una pieza independiente de la política externa aún pendiente:
`pnpm inspect:artifacts-hidden-v2`. Es inspección offline de integridad sobre
exports locales existentes; no instala/importa setups en el servicio ni concede
aprobación. Recibe pins externos del manifest y de keys.json, kind y presupuesto
de lectura explícito. Sólo soporta el esquema experimental inseguro vigente.

Comprueba inventario exacto de seis archivos, flags/contexto/CS conocidos,
conteos declarados, relación recibo→manifest y SHA-256 streaming de cuatro
cuerpos. Usa descriptor de directorio, opens no bloqueantes/sin symlinks finales,
fstat, presupuesto previo, JSON estricto acotado, EOF y comparación de entradas
y metadatos antes/después. Lista como máximo siete entradas antes de rechazar
un inventario inesperado. No deserializa claves ni CS. Las comprobaciones de
cambio no sustituyen snapshot atómico; mantener fuentes inmutables.

Se ejecutó sobre ambos exports finales existentes con presupuesto 2 GiB por
export. Opening: **1.556.506.446 bytes**, invalid-point: **1.071.059.209 bytes**.
Los hashes de cuerpos coinciden con los manifests ya usados por el replay.
Pins de keys.json: opening
`12d13e25808ac946278b14dfce0d6c78ad39a55439dd251662d0fff322b261fc`;
invalid-point
`dcf669308831f5dd9595c6cedc8e14709df734deb535b07fde17d4cccecb115e`.
Estos pins se cotejaron como inventario local; no se autentican participantes,
cierres, beacons o aprobación por el hecho de calcularlos aquí.

Resultado unsafe-local-export-inventory-verified, artifactBytesVerified=true;
nativeDecodingPerformed, artifactRelationsVerified, mpcTranscriptsVerified,
beaconAfterClosureProven, independentApprovalVerified y productionApproved=false.
Procedimiento/límites en [inventario offline](hidden-v2-artifact-inventory.md),
outputs sin reformatear y contexto en
[benchmark](../benchmarks/timelock-opening/artifact-inventory/README.md).
No se reemplazó evidencia anterior, no hubo setup/FFT/MPC/proving nuevos.

Validación: **8 tests Python nuevos**, con variantes de los cuatro cuerpos
sustituidos, pins, scope/conteos, inventario/campos extra, JSON duplicado/profundo/
no finito, presupuesto anterior a lectura, FIFO/symlinks/vacíos, entrada reemplazada
y CLI sin JSON de éxito ante fallo. Regresiones: cinco tests de evidencia y cinco
del empaquetador aprobados. **15 tests web de setup y dos Solidity DeployPolicy**
aprobados; confirman rechazo de seguridad autodeclarada y redes reales, y acceso
local con opt-in. Prettier y git diff --check aprobados. No se repitieron suites
Go: sus fuentes no cambiaron desde los 158 eventos de la continuación anterior.

Bundle nuevo y recibo de cierre externos en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-artifact-inventory/`.
Outputs grandes y setups anteriores intactos; sin nuevo commit, publicación,
contacto o despliegue real. Las correcciones sin commit de la continuación
anterior se conservaron. No quedan workers del inventario activos.

Lo pendiente de producción no se reduce a cotejar hashes: faltan relaciones
nativas/transcripts sobre CS autenticado, cierres/beacon independientes y
política de aprobación externa ligada a circuito/claves/runtime/red. Antes de
implementar la autoridad del registro hay que fijar revisores/participantes,
quórum, vigencia y revocación; no se deducen de este inventario ni de los tests.
Producción y manifests autodeclarados seguros continúan bloqueados.

## Continuación local: VK → Solidity, 5 de noviembre de 2026

Se avanzó otra relación comprobable sin decisiones de autoridad externa:
paquete Go artifactcheck, CLI cmd/vk-export-check y wrapper
`pnpm check:vk-export-hidden-v2`. Sólo lee la VK comprimida y Verifier.sol
existentes, con pins SHA-256 externos y número esperado de inputs públicos.
No lee PK/CS/transcripts ni ejecuta setup, MPC, proving o EVM.

Presupuestos: VK 64 KiB, fuente/exportación 1 MiB, inputs 0–256 y cero/un
compromiso. Preflight en una copia privada comprueba todos los prefijos de
asignación/tags comprimidos/índices/EOF antes de ReadFrom sobre esos mismos
bytes. Decoder nativo valida puntos/subgrupos; reserialización canónica y
exportación Solidity por defecto se comparan con tamaño/hash originales.
No se escribe una fuente nueva ni se devuelve objeto VK reutilizable.
Más de un compromiso se rechaza explícitamente: gnark fijado advierte que el
exportador Solidity no lo soporta aunque pueda emitir texto.

Ambas VK finales existentes pasaron: opening 2256 bytes/55 inputs y fuente
64723 bytes; invalid-point 560 bytes/2 inputs y fuente 32722 bytes, un compromiso
en cada una. Los pins siguen siendo los de manifests/inventarios anteriores.
Resultado vk-solidity-export-verified, vkPointsValidated/vkCanonical/
solidityExportMatches=true. circuitBindingVerified, provingKeyRelationVerified,
mpcTranscriptsVerified, independentApprovalVerified y productionApproved=false.
Validez de puntos/export no demuestra no degeneración ni procedencia segura.

Wrapper real offline y pnpm probados, con rutas absolutas y relativas en flags
separados/=. Worker acotado con prlimit (4 GiB AS, 20 s CPU, 1 MiB file, cores
cero) y timeout 30 s; Go memory 256 MiB/dos threads son objetivos. Build previo
fuera de esos límites; no es supervisor de producción ni cuota kernel RSS.

Validación: **188 eventos Go aprobados** en seis paquetes (30 nuevos en checker/
CLI, 158 de regresión previa), cero fallos. Tests de claves efímeras pequeñas,
export exacto cero/un compromiso, rechazo de dos, pin/VK/fuente/input sustituidos,
headers/índices/puntos maliciosos, todos los truncados, EOF, presupuestos y CLI
con archivos especiales/fallos sin JSON. No se generaron claves ni pruebas del
juego. Fuzz sólo framing, target 10 s/dos workers, **6117 evaluaciones** sin fallo;
no fuzz de pairing/export ni prueba de RSS. Vet offline, gofmt, sintaxis Bash,
Prettier y git diff --check aprobados.

[Procedimiento](hidden-v2-vk-export-check.md) y
[informes](../benchmarks/timelock-opening/vk-export-check/README.md).
Bundle/receipt/logs externos nuevos:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-vk-export/`.
invalid-point.json conserva exactamente la línea JSON del stdout pnpm;
el banner completo queda en invalid-point-pnpm.txt externo. Outputs existentes,
setups, replay y fuentes de lanzamiento v6/v7 intactos. Se conservaron cambios
sin commit anteriores; no nuevo commit/push, publicación, contacto o despliegue.
Ningún worker de esta comprobación queda activo.

Sigue pendiente importación de producción con CS/PK/VK/transcripts/compilación/
runtime autenticados y aprobación independiente. Las comprobaciones locales no
pueden acreditar participantes independientes, cierre público autenticado ni
beacon futuro impredecible. Faltan identidades/autoridad y política externa de
quórum/vigencia/revocación/bindings antes de activar un registro. Mantener todas
las barreras de producción; estas herramientas sólo entregan evidencia acotada.

## Continuación local: estructura PK y parámetros VK, 5 de noviembre de 2026

Se añadió `pnpm check:pk-structure-hidden-v2`, una relación parcial adicional
sin recomputar claves ni proving. Paquete artifactcheck/pk.go y CLI separada
recorren la PK en streaming: hash/EOF, dominio canónico sin precomputar FFT,
vectores/compromisos/wires contra metadatos compilados fijados, máscaras bool
0/1 y sus contadores, tags comprimidos y cinco puntos compartidos con VK
(alpha/beta/delta G1, beta/delta G2). La VK se decodifica con el lector protegido
y canónico reutilizado del checker anterior; la PK nunca se deserializa.

Los metadatos existentes opening-1.json e invalid-point-1.json de cs-reproduction
se pasan por pin externo, junto al CS esperado declarado, PK y VK. No se lee el
CS ni se acredita autoría de metadatos. Presupuestos de formato: PK <=2 GiB,
metadatos/VK <=64 KiB, wires <=2^25, dominio <=2^23 y cero/un compromiso.
El wrapper ejecuta worker con 4 GiB AS/60 s CPU/90 s wall/1 MiB file/cores cero;
Go memory 256 MiB/dos threads son objetivos, no cuotas RSS/CPU. Build offline
previo fuera de esos límites; sin supervisor de producción ni sandbox.

Ambas PK finales existentes pasaron: opening **1.215.401.903 bytes**, dominio
8388608/wires 6894167; invalid-point **845.623.725 bytes**, dominio4194304/wires5582166.
Los hashes PK/VK siguen siendo los de manifests finales. Pins de metadatos:
opening `a6d95d061df2701f726e6ac7f9464a156070701201c29e6cd02a774dd4715986`;
invalid-point `9399fe0811c4fe51d7ffad8c66dc6d63fd6018e1041f62eeeb7b3fe2e7db620f`.

Resultado pk-structure-and-shared-parameters-verified. Sólo
dimensionsMatchPinnedMetadata/sharedParametersMatchVk/vkPointsValidated=true.
allPkPointsValidated, circuitBindingVerified, fullKeyRelationVerified,
mpcTranscriptsVerified y productionApproved=false. Los puntos de vectores se
recorren por tag/formato, sin comprobar todas sus coordenadas/subgrupos. Un test
confirma que un punto inválido con tag/pin coherentes puede pasar manteniendo
esos flags false. No presentar coincidencia parcial como relación algebraica
completa ni procedencia segura. No hubo lectura de CS del juego, arrays nativos
PK, setup, FFT grande, MPC, prueba del juego o replay nuevos.

Validación: **221 eventos Go aprobados** en siete paquetes, cero fallos:
33 nuevos de scanner/CLI, más regresión VK export y paquetes anteriores. Claves
efímeras pequeñas cero/un compromiso, todos los truncados, headers/dominio/
conteos/máscaras maliciosos, PK/VK/parámetros/pins/metadatos sustituidos,
trailing/hash/presupuestos y CLI/archivos especiales sin JSON de éxito al fallar.
Vet offline, gofmt, sintaxis Bash, Prettier y git diff --check aprobados.

[Procedimiento](hidden-v2-pk-structure-check.md) e
[informes](../benchmarks/timelock-opening/pk-structure-check/README.md).
Bundle/receipt/logs externos nuevos en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-pk-structure/`.
Se conservaron setups, outputs raw/pins y cambios sin commit previos. No se hizo
commit/push, publicación, contacto ni despliegue real. Workers terminados.

Sigue pendiente la relación criptográfica completa y procedencia con transcripts/
CS autenticados, revisión independiente y política externa. Los roles,
quórum/vigencia/revocación/bindings del registro, participantes independientes,
cierre autenticado y beacon futuro no pueden deducirse de estos scans locales.
Mantener producción bloqueada; las comprobaciones existentes son piezas de
validación, no un importador/aprobador final.

## Continuación local: puntos PK acotados, 5 de noviembre de 2026

Se extendió el scanner PK existente, sin otra CLI nueva, con
`--validate-points --max-points N` y API `CheckPKPoints`. El modo por defecto
sigue siendo el scan de estructura/tags ya medido en ambos exports del juego.
El modo opt-in valida cada punto PK con el decoder nativo de curva/subgrupo y
reencoding canónico dentro del buffer que se hashea. No acumula vectores ni
entrega un objeto PK reutilizable; cabeceras compartidas siguen ligadas a VK
comprobada. No deserializa dominio FFT/PK, no lee CS ni genera artefactos.

Presupuesto obligatorio y fijo para exports pequeños: cota conservadora total
PK <=65536 puntos, calculada desde metadatos fijados, no headers de la PK. Se
comprueba antes de construir el lector PK o decodificar la VK. Límites de
worker anteriores (4 GiB AS, 60 s CPU, 90 s wall) intactos; no ampliar el ensayo
pequeño al juego. El presupuesto no demuestra RSS máximo ni capacidad/SLA.

Tests de exports pequeños cero/un compromiso pasaron. Puntos G1/G2 inválidos e
infinito no canónico con hashes coherentes pasan el modo de tags conservando
false y son rechazados por el nuevo modo. Tests de reader que falla al usarse
confirman rechazo previo a lectura/decoder con presupuesto insuficiente o forma
grande. Wrapper y pnpm reales pasaron con fixture sintético de puntos válidos;
no se atribuye relación CS/clave a ese fixture.

Éxito pequeño: pk-points-structure-and-shared-parameters-verified,
allPkPointsValidated=true. circuitBindingVerified/fullKeyRelationVerified/
mpcTranscriptsVerified/productionApproved siguen false. Ambos exports reales del
juego se invocaron con el máximo permitido y se rechazaron por presupuesto antes
del lector PK, sin JSON de éxito. No se repitió validación nativa masiva de sus
puntos ni el MPC/setup/FFT/proving/replay completos; el replay histórico ya había
cargado esas claves. No confundir la prueba de rechazo con nueva validación del
dominio completo. Pins y raw outputs previos permanecen intactos.

Validación: **232 eventos Go aprobados** en siete paquetes: suite de 229 eventos
más tres del test nuevo de wrapper/pnpm (11 eventos nuevos frente a 221 previos).
Vet offline, gofmt, sintaxis Bash, Prettier y git diff --check aprobados. Sin
cambios de dependencias ni suites web/Solidity repetidas al no cambiar esas fuentes.

[Procedimiento ampliado](hidden-v2-pk-structure-check.md) y
[evidencia](../benchmarks/timelock-opening/pk-point-validation/README.md).
Bundle/receipt/logs nuevos fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-pk-points/`.
Se conservaron cambios sin commit anteriores y todos los setups/artefactos de
cierre. Sin nuevo commit/push, publicación, contacto o despliegue real; workers
terminados. Producción sigue bloqueada.

Pendientes de producción: vínculo algebraico con CS/transcripts autenticados,
procedencia/registro con política externa revisada, participantes/cierre/beacon
independientes y aprobación. Las validaciones locales de puntos tampoco deciden
quién aprueba, quórum/vigencia/revocación ni bindings de runtime/red. No sustituir
esas decisiones por flags del operador ni ejecutar cálculos grandes para intentar
acreditar independencia. El importador final continúa sin habilitar producción.

## Continuación local: linaje de recibos, 5 de noviembre de 2026

Se implementó `pnpm check:lineage-hidden-v2`: lectura offline de paquetes de
recibos JSON fijados por hash, sin transcripts/CS/PK/VK binarios. Cada export
final enlaza ahora un paquete autocontenido de **12 documentos**: keys/manifest,
init, dos artifacts/verificaciones de fase 2 y commons con dos artifacts/
verificaciones de fase 1. Sólo se seleccionaron bytes alcanzables desde las
claves finales; se conservaron los originales y los intentos históricos ajenos
al grafo. No se ejecutó MPC, sellado, FFT, setup ni proving.

Ambos paquetes originales pasaron. Opening: **9338 bytes JSON** incluido índice;
invalid-point: **9314 bytes**. Pins de índice:
opening `c83a34751cccd806eeede0cb419c21620c73dea48ce4dbd52a8f90dcc0ca7d03`;
invalid-point `d9979dda311f651298992017d0c92668bfb3ddb3af149e379222d487fa436a25`.
Los pins keys/manifest/CS son los finales ya registrados. El índice, sus 12
recibos y resultados raw se incluyeron en docs/benchmarks para revisión portable;
no se requiere acceso a la caché de binarios para comprobar este grafo JSON.

Validación: inventario del índice <=32 documentos, <=64 KiB/JSON y <=2 MiB
totales, profundidad16, JSON/fields estrictos y paths digest.json relativos a un
fd de directorio. Archivos regulares/no bloqueantes/sin symlinks finales; pins
externos de índice/keys/manifest/CS, contexto dominio/perfil/flags inseguros,
padres/verificaciones hasta raíz, anchors de fase1, shape/evaluaciones y tamaños
wire declarados; rechazo de documentos indexados no alcanzables. El primer
recibo histórico fase1 schema1 sólo se acepta si está enlazado por hash al cierre
final; no confundirlo con una misión v1 ni con estados activos antiguos.

Resultado unsafe-local-receipt-lineage-consistent. nativeMpcReverified,
referencedBinaryBytesVerified, participantIdentitiesAuthenticated,
closurePublicationAuthenticated, beaconAfterClosureProven,
independentApprovalVerified y productionApproved=false. Los flags históricos
nativeTransitionVerified=true se comprueban como claims de recibos, no como
verificación criptográfica nueva. La coherencia de JSON/pins locales no acredita
procedencia independiente ni impide que un operador fabrique un grafo coherente.

Ocho tests Python nuevos aprobados, con 15 variantes semánticas que recalculan
hashes de todos los antecesores para llegar a los rechazos de contexto/enlaces.
Incluyen ramas/padres/verificaciones omitidos/sustituidos, CS/dominio/dimensiones,
beacon/aprobación forjados, pins, cambios de bytes, FIFO/symlink, JSON/path/budgets,
documentos huérfanos y CLI sin JSON de éxito al fallar. Pasaron también 18 tests
previos (inventario8/evidencia5/empaquetador5): **26 tests Python** en total.
CLI y pnpm reales con los paquetes incluidos aprobados. Prettier y git diff
--check aprobados. No se repitieron suites Go/web/Solidity: no cambiaron sus
implementaciones desde los tests anteriores.

[Procedimiento](hidden-v2-receipt-lineage.md) e
[índices/recibos/resultados](../benchmarks/timelock-opening/receipt-lineage/README.md).
Bundle, build receipt de selección de documentos, cierre y logs nuevos fuera
de Git en `/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-receipt-lineage/`.
Sin commits/push, publicaciones, contactos ni despliegues; cambios previos
conservados. No quedan workers activos de esta comprobación.

La importación segura sigue necesitando verificación criptográfica/CS/transcripts
autenticados y autoridad/política de aprobación independiente. Faltan participantes,
publicación autenticada de cierre, beacon posterior impredecible y política de
quórum/vigencia/revocación/bindings. Estos recibos locales sólo aportan trazabilidad
y selección de entradas para revisión; no habilitar producción con ellos.

## Continuación local: preflight conjunto archivado, 5 de noviembre de 2026

Se implementó `pnpm preflight:archived-hidden-v2` (también Python directo) para
unificar la revisión de informes existentes. Plan fijado en
`docs/proposals/hidden-v2-archived-preflight-inputs.json`, SHA-256
`429587c48f8322b08ce1e53836eb1ce91e531b3df26327987e982468dbce0f9e`.
Conecta ambos circuitos y el resumen/replay de tres pruebas con inventarios,
metadatos compilados, reportes PK/VK y paquetes/resultados de linaje.

Se ejecutó con éxito leyendo **41031 bytes de fuentes JSON**; las relecturas de
copias privadas no se incluyen en ese contador. Comprueba identidades/pins,
tamaños, dominios/wires/inputs/compromisos, manifests y claims de alcance, y
vuelve a ejecutar los checkers JSON de linaje y evidencia. Los informes nativos
siguen siendo históricos: no se vuelven a leer/validar sus binarios y no se
exige una misma revisión de software para compilación/init/keys/replay. Los
antiguos flags de medición de compilación tampoco se convierten en pendientes
actuales. No se ejecutó MPC, FFT, setup, proving ni replay del juego.

Lectura de JSON sólo bajo raíz elegida, por fd y sin symlinks en componentes
inferiores, paths canónicos, tamaños/pins antes de parsear, profundidad16 y
JSON/scope estrictos. Topes lógicos: 2 MiB/JSON, 64 KiB/plan/recibo y 8 MiB de
fuentes. Checkers que reabren entradas operan sólo en copias temporales privadas
de bytes ya fijados; no siguen paths externos de originales archivados. Un test
cambia la fuente original tras snapshot y comprueba el uso de la copia fijada.
No se afirma snapshot atómico global, cuotas kernel ni RSS máximo.

Resultado archived-hidden-v2-preflight-consistent, dos circuitos/12 recibos
por circuito y tres pruebas registradas. binaryArtifactsRead/nativeWorkRerun/
currentArtifactsReverified/currentSourceReproductionVerified/
independentApprovalVerified/productionApproved=false. Es coherencia del dossier,
no nueva validación nativa ni procedencia segura del setup.

Ocho tests nuevos, con 16 variantes semánticas re-pinneadas, prueban mezclas de
circuitos, reportes/metadatos/pins/campos de aprobación, presupuesto de archivos,
rutas/FIFO/symlinks, paquetes alterados, snapshots privados y CLI sin JSON al
fallar. Pasaron 26 tests previos: **34 tests Python** en total, Python/pnpm
reales y comparación de sus salidas. Prettier y git diff --check aprobados.
No se repitieron suites Go/web/Solidity, cuyas implementaciones no cambiaron.

[Procedimiento](hidden-v2-archived-preflight.md) y
[resultado portable](../benchmarks/timelock-opening/archived-preflight/README.md).
Bundle/receipt/logs nuevos fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-archived-preflight/`.
Tras verificar el bundle, se extrajo y ejecutó el preflight con Python aislado,
sin Git/pnpm/Go en PATH: stdout idéntico al resultado archivado. Esto prueba la
portabilidad del dossier JSON, no reproducción de circuitos/claves/pruebas.
No commits/push, publicaciones, contactos ni despliegues; cambios previos y
artefactos nativos intactos. Ningún worker pendiente.

La importación/aprobación real sigue requiriendo relaciones criptográficas,
CS/transcripts/autores autenticados y política/autoridad externa revisada. Faltan
participantes independientes, cierre publicado auténtico, beacon posterior
impredecible, quórum/vigencia/revocación/bindings. El dossier coherente no cubre
esas propiedades ni autoriza a cambiar los flags inseguros o las barreras de
producción. No repetir el recorrido nativo completado para generar este informe.

## Continuación local: integración del dossier en CI, 5 de noviembre de 2026

Se confirmó rama `feat/hidden-v2-local-mpc-review`, HEAD `fe95eab` y se
conservaron todos los cambios previos, incluidos los archivos sin seguimiento.
Se leyeron CLAUDE.md y este handoff completos; el estado vigente es el cierre
local más las continuaciones superiores, no los estados ACTIVO históricos.

Carencia concreta cerrada: CI y ci-local no ejecutaban ninguna comprobación del
dossier. Ahora un job separado de `.github/workflows/ci.yml` y ci-local invocan
`scripts/check-hidden-v2-archived.sh`, disponible también como
`pnpm check:archived-hidden-v2`. Reutiliza los cinco módulos/34 tests existentes,
el plan con su pin anterior y comparación byte a byte con result.json archivado.
No se añadió otro checker ni se cambiaron los informes/pins/artefactos históricos.
El job no necesita instalar dependencias Node, Go o Foundry. No se lanzó CI remoto.

Validación local del wrapper: **34 tests Python aprobados**, preflight idéntico
al resultado archivado (41031 bytes JSON), sintaxis Bash, Prettier y diff check.
Se actualizaron los hashes del inventario, incluyendo workflow, ci-local y wrapper.
Bundle/receipt/logs nuevos y exclusivos fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-archived-ci/`.
El recibo externo registra las comprobaciones de cierre y la ejecución extraída.
ci-local completo no se ejecutó: clonaría HEAD sin los cambios de trabajo y
repetiría suites del juego que esta integración no modifica.

Esta línea de integración local queda agotada. Para avanzar a importación y
aprobación de producción faltan identidades/alcance de revisión independiente,
participantes reales, publicación autenticada del cierre/beacon posterior y
autoridad/política externa (quórum, vigencia, revocación y bindings a circuito,
claves, compilación, runtime y red); operación requiere carga/presupuesto/entorno
objetivo. No se pueden deducir esas entradas de nuestros recibos. Coherencia
del dossier no equivale a nueva verificación criptográfica ni aprobación
independiente. Barreras de producción intactas; sin MPC/FFT/setup/sellados/claves/
proving/replay nuevos, commits, push, publicaciones, contactos o despliegues.

## Continuación local: apertura individual de evidencia, 5 de noviembre de 2026

Se conservó rama/HEAD y todo el trabajo sin commit. Al revisar pendientes se
reprodujo un defecto concreto del checker individual de evidencia: entre lstat
y open se podía sustituir el JSON por un symlink final y read_pinned lo seguía
si sus bytes coincidían con el pin. Un FIFO en esa ventana podía bloquear open.
El preflight conjunto usa copias privadas fijadas: no se atribuye un bypass a
sus ejecuciones archivadas ni a los artefactos nativos del MPC/replay.

Se corrigió el lector existente, sin otra CLI/checker: os.open con O_NOFOLLOW y
O_NONBLOCK, fstat del descriptor antes de leer, presupuesto por tamaño y lectura
de tamaño+1 para detectar crecimiento/truncado, cierre en finally. No autentica
componentes padre ni impone snapshot atómico; el hash sigue autenticando sólo
correspondencia al pin, no autoría independiente.

Dos tests nuevos cubren sustitución antes de abrir por symlink/FIFO y rechazo
del presupuesto antes de construir el stream de lectura. Los cinco módulos del
wrapper pasan ahora **36 tests Python**, y su preflight conserva stdout idéntico
al resultado archivado. No se repitieron suites nativas/juego: sus fuentes no
cambian. Inventario actualizado y cierre reproducible con bundle/receipt/logs
externos nuevos en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-evidence-open/`.
El recibo registra el caso aceptado antes del parche, validación y reproducción
del wrapper desde fuentes extraídas, sin modificar los cierres anteriores.

La revisión de apertura queda cerrada; producción permanece bloqueada por
revisión y política externas, participantes/cierre/beacon independientes y
artefactos finales autenticados. Sin MPC, inicializaciones/FFT, sellados, claves,
proving/replay nuevos, commits, push, publicaciones, contactos o despliegues.
Coherencia de evidencia no implica verificación criptográfica ni aprobación.

## Continuación local: apertura de cachés staged, 5 de noviembre de 2026

Se encadenó la revisión del helper regular de mpcstaged al encontrar el mismo
patrón lstat→open. Se corrigió con O_NOFOLLOW/O_NONBLOCK y Stat del descriptor,
cierre ante error y retorno nil; lo usan los índices de reanudación y vectores.
El test del modo nonblocking falló antes del parche y pasó después. También se
prueban archivo regular, symlink, FIFO, directorio y ruta inexistente. No se
afirma que ocurriera una sustitución en las cachés históricas; sus directorios
padre siguen siendo confiables/inmutables, sin promesa de snapshot atómico.

Regresión offline pertinente: **82 eventos Go aprobados**, mpcstaged57 y
cmd/mpc-local-pipeline25, vet y gofmt; sólo fixtures pequeños. Los 36 tests Python
y el cotejo de originales de la corrección inmediatamente anterior conservan
su resultado; no se repitieron porque este parche Go no cambia esas fuentes.
No se ejecutaron MPC/FFT/setup/proving del juego ni se tocaron sus cachés.

Revisión interna e inventario actualizados; bundle/recibo/logs externos finales
de esta continuación en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-cache-open/`.
Este cierre incluye ambas correcciones de apertura y conserva el bundle/receipt
anterior de evidence-open. No se publicaron ni enviaron a terceros.

Agotada la línea concreta de aperturas revisadas, la siguiente frontera sigue
requiriendo revisores/participantes reales y autoridad/política de procedencia,
cierre autenticado/beacon posterior y objetivos operativos externos. No se
fabricaron esas entradas ni se habilitó producción. Sin commits, push o
despliegues. Integridad y defensas de lectura no equivalen a verificación de
transcripts ni aprobación independiente.

## Continuación local: revisión ampliada del dossier y supervisor, 5 de noviembre de 2026

El usuario reiteró que no se debe parar entre arreglos. Se encadenó revisión de
las rutas relacionadas y su integración, conservando rama/HEAD fe95eab, todo el
trabajo sin commit y los cierres anteriores. No se tomó el historial ACTIVO como
estado vigente ni se relanzó el recorrido nativo del juego.

Defectos concretos reproducidos y corregidos en las herramientas existentes:

- Doce variantes semánticas con pins recalculados pasaban el preflight: overflow
  numérico 1e999/perfiles infinitos, RSS negativo, bool/float como contador,
  medición duplicada/ausencia de invalid-point, nombre duplicado, reutilización
  mal tipada, duración negativa, cola pendiente o contadores de prueba/caché
  incongruentes. Ahora se exige distribución por circuito, nombres únicos,
  secuencia frío/caliente, métricas finitas/no negativas y contadores enteros
  coherentes con las tres pruebas y su replay de caché. El checker individual
  también valida pins/statements/valid booleano del inventario de proofs.
- Los parsers existentes rechazan overflow de exponentes además de constantes
  NaN/Infinity. No se añadió otro checker ni otra autoridad de aprobación.
- Dos lectores Python perdían descriptores si fdopen rechazaba un directorio;
  se reprodujeron cuatro fugas en cuatro intentos por lector. Ahora fstat precede
  al stream y finally/ExitStack cierra siempre, incluso si fdopen falla.
- El helper fileHash del pipeline usaba Open/Copy sin cota fuera del worker.
  Ahora reutiliza regular protegido y limita tamaño inicial a 2 GiB y lectura
  a tamaño+1, rechazando cambio de tamaño. El test de symlink falló antes del
  parche. No es una cuota de tiempo/I/O ni un sandbox para directorios hostiles.

Validación pertinente: **38 tests Python**, con las doce variantes re-pinneadas,
FDs sin fugas y regresiones de parsers/CLI; **32 eventos Go** de pipeline y vet,
gofmt y diff check. El preflight original sigue siendo byte a byte idéntico,
41031 bytes JSON; el cotejo de JSON originales externos también pasa.
La reproducción extraída se registra en el recibo, junto a hashes y logs antes/
después. Las suites nativas no afectadas no se repitieron. No se leyeron claves/
transcripts del juego ni se ejecutó MPC/FFT/setup/proving/replay del juego.

Inventario y documentación de alcance actualizados. Bundle/receipt/logs finales
externos y exclusivos en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-dossier-boundaries/`.
Los bytes/pins históricos de informes, plan, resultado y artefactos permanecen
intactos; nuevas fuentes no sustituyen los binarios de las mediciones v6/v7.

Revisadas las aperturas restantes del alcance: Open de readKB sólo se usa sobre
/proc; syncDirectory abre directorios de salida propios; Lstat de outside busca
.git en padres. Las CLIs PK/VK/inspector y lectores staged ya usan descriptores
regulares/no bloqueantes/sin symlinks finales. Los directorios padre confiables
y la inmutabilidad de fuentes siguen siendo precondiciones, no garantías nuevas.

No queda un fallo concreto conocido abierto en esta línea de revisión interna.
Para continuar con el importador/registro real son imprescindibles identidad y
alcance de revisores, participantes independientes, política externa de quórum/
vigencia/revocación/bindings y procedimiento autenticado de cierre/beacon futuro;
operación necesita carga/presupuesto/entorno y responsables. Elegirlos aquí sería
inventar la autoridad/evidencia ausente. Las correcciones sólo mejoran integridad
y coherencia local; no reverifican criptografía del juego ni aprueban procedencia.
Barreras de producción intactas; sin commits, push, publicación, contactos ni
despliegues reales. No dejar estos pendientes externos como órdenes de repetir
los cálculos locales ya completados.

## Continuación local: revisión real con Claude para el hobby, 5 de noviembre de 2026

El propietario indicó que no puede contratar una firma y autorizó usar Claude
como segundo revisor técnico y en otros roles de análisis necesarios. Esa es la
modalidad vigente para seguir el desarrollo hobby: no volver a frenar el trabajo
local exigiendo contratar auditores. Se mantienen los límites reales de evidencia
y las barreras de producción; no inventar independencia, firmas ni aprobaciones.

Se ejecutaron realmente **cuatro llamadas Claude Code 2.1.318 / modelo reportado
claude-opus-5-5**, sin herramientas ni ejecución de comandos, con fuentes
numeradas/fijadas y respuestas originales archivadas. Dos revisiones iniciales
(adaptadores y circuitos/consumidores) y dos seguimientos para contrastar
correcciones y código omitido. Claude no corrió tests: las regresiones son del
agente principal. No se enviaron claves/transcripts; sí fuentes al servicio
Claude por autorización del propietario. No hubo publicación ni contactos con
participantes humanos.

[Disposición vigente y enlaces a respuestas/pins](../reviews/hidden-v2-claude-review-20261105.md).
Los números de línea de cada respuesta describen sus entradas congeladas, no
necesariamente el árbol corregido final. Prompts, JSON raw, inventarios y logs:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-claude-{staged,circuit}-review/`;
seguimientos en followup/. Se preservan todos los cambios sin commit anteriores.

Trabajo concreto encadenado:

- F1/F2 reproducidos antes del parche: Seal podía mutar/panicar con CKK extra;
  Assemble aceptaba layouts truncados/reordenados o con listas sustituidas.
  Se validan forma/particiones antes del beacon; Store conserva layout privado
  profundo sólo tras Prepare exitoso y lo exige antes de cargar vectores.
  Preparación fallida lo invalida. Layouts malformados pineados y opener nil
  se rechazan sin panic/trabajo de caché. Se documenta propiedad exclusiva y
  ausencia de solapamiento entre buffers del Seal optimizado.
- F3: el CS se hashea antes de claves/beacon, reteniendo su descriptor para
  copiarlo y comprobando también el hash final. El test entre procesos con CS
  sustituido no crea directorio público de claves. No es snapshot atómico si
  otro actor escribe posteriormente: salida parcial sin recibo final no vale.
- F4: nota separada initialization-provenance.json y copia exacta del índice
  final v6. Enlazan launch/binario/fuentes/init/checkpoints/keys, sin alterar
  recibos ni leer vectores grandes. Es referencia local, no procedencia segura.
- S1/S3/S4/S5: coeficientes especiales y scheduling secuencial/paralelo pequeño,
  flags resume rechazados correctamente, cota wire anterior al payload y G2 en
  curva fuera de subgrupo rechazado con pin coherente. S2 no justifica repetir
  CS del juego: ShapeFromCS ya hacía WriteTo/hash en el CLI histórico; siguen
  sin nueva medición la pasada adicional y las copias de Layout.
- H1/H2/H3 de la revisión de circuitos se retiraron explícitamente por Claude
  al ver HiddenAdmission/Resolution, comprobación de módulo y AddUnified real.
  Pasaron además el comparador pequeño con hint a+q y los dos tests Foundry de
  binding/configuración. No se cambió ninguna definición de circuito/consumidor.
  Los supuestos genéricos criptográficos no se presentan como pruebas formales.

Las regresiones Go pertinentes conservan bytes nativos exactos en fixtures
pequeños y pruebas positivas/negativas; vet, módulos offline, formato y diff
check aprobados. El recibo final conserva conteos/logs por ejecución, incluidos
casos antes/después y reproducción extraída del dossier. No se volvieron a
ejecutar suites no afectadas sólo por obtener otro número de tests.

Nuevo cierre reproducible con bundle/receipt fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-claude-review-close/`.
Inventario actualizado incluyendo las respuestas reales, metadata y nota de
procedencia local. Sources/binarios históricos v6/v7 y artefactos originales
permanecen intactos. Las nuevas validaciones no se atribuyen a esos binarios.

Este ciclo de revisión no deja hallazgos confirmados abiertos en entradas
soportadas. No se implementó otro verificador algebraico masivo por sugerencia
genérica ni se repitió MPC/FFT/init/sellado/proving/replay del juego. No commits,
push, publicación, despliegue ni cambio de flags de producción. AI-assisted
review no equivale a auditoría profesional, verificación criptográfica nueva
del juego, participación independiente o aprobación de procedencia. Una futura
decisión de riesgo/lanzamiento del propietario es separada y no se presupone.

## Continuación vigente: operación experimental, 6 de noviembre de 2026 (Arabia)

El propietario confirmó que no habrá colaboradores externos y pidió continuar
autónomamente mientras se ausenta. Se trabaja con Claude como segundo revisor
técnico, sin atribuirle independencia, participación MPC ni aprobación. No se
necesita contratar una empresa para continuar este alcance. Branch/HEAD reales:
`feat/hidden-v2-local-mpc-review`, `fe95eab652303b5f84d5ec18fb1a4364c8b2880e`.
Todos los cambios previos, incluidos untracked, se preservan sin commits.

Carencias locales concretas cerradas en esta línea:

- **Ownership entre procesos:** productor y keeper adquieren un lease Linux
  util-linux flock antes de RPC o trabajo de estado. Archivo persistente
  .vendetta-state.lock, fd numérico, validación regular/nlink/inodo, código busy75,
  salida acotada y timeout con reap. Release idempotente. No borrar el lock.
  Los procesos nativos reciben la misma open file description: SIGKILL del padre
  no permite solapamiento mientras viva un hijo. Un huérfano colgado bloquea
  reinicio; diagnosticarlo manualmente. No existe unicidad global de signer
  entre directorios distintos. El keeper exige directorio dedicado por instancia
  simultánea, incluso entre deployments diferentes; defaults/journals no migrados.
- **Shutdown y carrera del worker:** closing antes de enqueue/drain, allSettled
  de HTTP/worker/cola antes de release, assertOpen tras beacon y abort al worker.
  Se reprodujo/corrigió la muerte del worker idle durante await rm: ahora rechaza
  antes de asignar pending y kill rechaza incluso tras exit. Prune conserva el
  inodo del lock y no lo cuenta como caché. Entrypoint libera ante fallo de listen.
- **Compilación sin sobrescritura:** prover:compile exige keys y output fresco
  fuera del árbol real de claves (también targets de symlinks por circuito).
  No escribe keys/evm ni verifier-runtime.json archivado. Captura digest del
  manifest con la fuente antes del build; valida kind y runtime hex no vacío.
  Servicio admite runtimeFile/HIDDEN_PROVER_RUNTIME; fallback histórico de lectura
  conservado, incluido override vacío. CLI, ejemplo y replay caller integrados.
  El caller se actualizó por código/tipos, sin ejecutar replay.
- **Durabilidad de journals compartidos por H3/keeper:** antes de cada envío o
  reintento se republican los mismos bytes firmados mediante temporal exclusivo
  nuevo, fsync/close, rename y fsync de directorio. Un fallo impide broadcast.
  Esto evita confiar sólo en otro fsync de bytes antiguos tras writeback error.
  El borrado confirmado se sincroniza; si falla, el error conserva explícitamente
  success/reverted. Directorios padre preexistentes y storage confiable son
  supuestos: no hay prueba física de corte de corriente ni garantía de hardware.

Validación final: **127 tests TypeScript /18 archivos** de producer/keeper/lease,
con procesos reales pequeños, SIGKILL/orfandad, RPC sintético y recuperación/reorg
en Anvil con certificados mock. Fallos inyectados de sync/rename, ninguna prueba
Groth16 nueva. Typecheck de scripts aprobado. Forge/solc reales compilaron sólo
dos contratos mínimos sintéticos en dos outputs nuevos y produjeron los mismos
hashes por circuito entre roots. Tests de clase/proceso no equivalen a pruebas
criptográficas del juego ni a validación física de durabilidad.

[Revisión y disposición de hallazgos](../reviews/hidden-v2-claude-operations-20261106.md),
con seis llamadas reales, respuestas literales y metadata de entradas/pins. Claude leyó fuentes sin
herramientas y no ejecutó tests. Raw prompts/respuestas/logs están fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-state-lease/`.
La carpeta conserva fecha de inicio; el cierre es del6 local (día5 UTC).
Se enviaron fuentes al servicio Claude con autorización; no claves/transcripts.

Cierre reproducible nuevo, sin reemplazar entregas anteriores:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-operations-close/`.
Bundle y receipt externos fijan inventario final, fuentes, revisiones, logs y
reproducción extraída del preflight archivado. No se reejecutaron suites Go ni
circuitos/consumidores porque no cambiaron en esta continuación; sus resultados
anteriores conservan su propio alcance/pins.

No queda entrada del propietario pendiente para los cambios de esta línea.
La operación local sigue experimental: entorno, util-linux, filesystem estable,
signer dedicado y supervisor confiables. Un error persistente de almacenamiento
o un huérfano real exigiría diagnóstico del operador, no fabricar evidencia ni
quitar el lock. Producción continúa bloqueada por procedencia/garantías que no
se han obtenido; no se convierte la ausencia voluntaria de colaboradores en
impedimento para desarrollar localmente. Sin MPC/init/FFT/sellados/claves/pruebas
reales nuevas, sin reemplazar artefactos/recibos, push, publicación o despliegue real.

## Continuación vigente: stack local jugable y recorrido del jugador, 6 de noviembre de 2026

Se continuó por instrucción del propietario y se consultó realmente con Claude
ante/después de los bloques de integración. Branch/HEAD siguen
`feat/hidden-v2-local-mpc-review` / `fe95eab652303b5f84d5ec18fb1a4364c8b2880e`,
sin commits. Cambios previos y entregas históricas conservados.

Carencia inicial: dev:local despliega HiddenConsumerMock y no inicia un productor
real. Ahora `pnpm dev:hidden-v2 /absolute/config.json /absolute/new-session` inicia
Anvil31337 en loopback, verificadores archivados, consumidores/Game actuales,
productor, keeper y Vite. [Guía y ejemplo](../local-hidden-v2.md). La ruta anterior
con consumidores test se conserva y se distingue expresamente.

- Configuración explícita unsafe, paths absolutos y pins de binario/manifests/
  runtime. No lee PK/CS/transcripts para arrancar. Compara los artifacts públicos
  existentes y el servicio coteja runtime/setup contra los consumidores en cadena.
  Binario nativo copiado y hasheado en el run; su worker sigue siendo perezoso.
- Run nuevo fuera de fuentes/keys/verifiers, puertos propios libres, sin sobrescribir
  deployment.local.json. Game/consumidores Solidity se compilan sólo al output nuevo;
  los verificadores finales no se recompilan. Foundry out/cache/broadcast, estado,
  logs y credenciales quedan allí. Estado nuevo, no resume de Anvil.
- Desplegador/H3/keeper usan cuentas Ethereum efímeras diferentes, financiadas
  desde Anvil0; los roles del Workshop permanecen en0. No son claves de setup.
  La dirección Game cambia entre sesiones, separando borradores del navegador.
- Entorno de CLI/children allowlist; nativeEnv explícito en productor, default
  anterior preservado. Vite no carga .env raíz ni publica VITE_* del shell.
  Un canary ficticio inyectado al segundo arranque no apareció en el navegador.
- Cierre keeper→productor/drain→web→Anvil, señales repetidas y SIGHUP, grupos propios.
  Vite está en middlewareMode con HTTP propio porque su SIGTERM standalone podía
  saltarse el cierre. Descendientes se terminan al salir su padre, sin matar por
  nombre ni usar PIDs acabados horas después. Fallos de receipts no impiden cleanup.
- Tiempo normal, bloques1s, sin reloj acelerado: saltar Anvil no publica drand futuro.
  No se introdujeron beacons falsos ni otro camino de aprobación. UI usa cuentas
  dev, no passkeys; la ruta AA existente no cambió.

Validaciones concretas:

- Dos arranques reales con las claves/verificadores finales existentes, en
  `hidden-v2-20261106-stack-smoke{1,2}` fuera de Git. Chromium registró cuenta1,
  encoló construcción y abrió misiones/informes/ranking. Metrics sin auth401 y
  con auth200; **cero solicitudes de certificados, cero proving nativo nuevo**.
  Game addresses distintos. Primer cierre SIGHUP; segundo TERM+INT+INT: closed.json
  cleanupErrors=0. No se tocó el servidor preexistente del puerto5199.
- SIGKILL al Anvil propio durante startup: error de child identificado, salida1,
  failed.json y closed.json con la causa y cleanupErrors=0. Test de error de disco
  al registrar fallo confirma cleanup y preservación de causas.
- Flujo completo de jugador con consumidores MOCK y certificados explícitos:
  registrar2, construir, entrenar, enviar misión oculta, esperar, resolver y ver
  informe/ranking. Playwright usa puertos alternativos, outputs y capturas nuevos
  fuera de Git. Fixture aislado y fingerprint del mock desde su propio output.
  Esto no equivale a nuevo replay criptográfico con consumidores reales.
- **151 tests TypeScript /21 archivos** de producer/keeper/local launcher, con
  recuperación/reorg existentes y nuevos casos de puertos/pins/cierre/grupos.
  Typecheck de scripts, Bash/formato/diff checks del cierre. No repetir Go/circuitos
  porque no cambiaron en esta continuación.

Cierre adicional contrastado tras la revisión:

- Tercer arranque mediante **pnpm dev:hidden-v2** y smoke estricto: contadores
  numéricos explícitos requests/proofs=0, títulos por ruta y pageerror sin fallos.
  Canary de entorno consta como suministrado y ausente en el módulo del navegador.
- Excepción no capturada inyectada sólo por un preload de test externo: Node
  cierra keeper/productor/web/Anvil, registra causa, todos sus PID desaparecen y
  pnpm termina con código1 después de cleanup. El preload no forma parte del producto.
- SIGINT durante forge build, también por el comando pnpm: salida0 sólo para la
  razón exacta de cancelación, closed.json existente antes de devolver el prompt.
  Fallos reales/cleanup no se ocultan por una señal posterior.
- El flujo Playwright con path implícito pasó y no dejó directorios nuevos en
  /tmp tras añadir gracefulShutdown SIGTERM y trap. Artefactos y capturas de
  intentos anteriores se conservan. No se eliminó el servidor ajeno de5199.
- Durante la edición se sustituyó accidentalmente un test por otro. Se restauró
  desde el bundle anterior verificado por hash y sólo se reaplicaron las dos
  pruebas nuevas. Las151 pruebas finales incluyen todos los casos anteriores.

[Cuatro revisiones reales y disposición final](../reviews/hidden-v2-claude-local-stack-20261106.md).
La última respuesta no vio defectos bloqueantes en sus entradas; dejó checks
concretos de cierre que se ejecutaron después. No interpretarla como aprobación.

Prompts, respuestas reales Claude y logs:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-local-stack/`.
El config específico de esta PC está en stack-config.json allí (paths/pins, no
privadas de setup). Run de fallo chain-failure-run/; pruebas mock bajo browser-fixture*/.
Las credenciales de sesiones están sólo en sus directorios privados, no en Git
ni en los prompts de revisión. Las fuentes sí se enviaron a Claude por autorización.

Cierre reproducible externo de esta continuación:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-local-stack-close/`.
Receipt fija bundle, inventario y logs, con reproducción extraída del dossier
archivado. No hay procesos propios que deban permanecer activos al cerrar.

Límite vigente: cada sesión es un mundo en memoria y no conserva cadena/firmantes
al apagar. Para otra sesión usar directorio nuevo; nunca reciclar journals con
otro Anvil. No se reejecutaron MPC/init/FFT/sellados/generación de claves de setup
ni replay/proving del juego; artefactos y recibos anteriores intactos. La prueba
criptográfica real Game/H3 sigue siendo la archivada. Producción/independencia/
procedencia segura siguen sin acreditarse, y las barreras de producción continúan.

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
