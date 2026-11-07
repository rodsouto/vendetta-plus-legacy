# Revisión Claude: operación persistente de productor y keeper

El propietario confirmó trabajar sólo entre Codex y Claude, sin colaboradores
externos. Se avanzó software necesario para producción sin convertir esa decisión
en independencia, procedencia segura de claves ni aprobación. Anvil sigue efímero.
No se ejecutó MPC/FFT/setup/sealing ni proving/replay del juego o despliegue real.

Feedback por CLI2.1.319 real, tools vacías, MCP vacío estricto y sin persistencia.
Seis consultas: design, implementation, final, followup, closure y abi. Los archivos
por etapa conservan literalmente result; metadata fija prompts, respuestas JSON,
stderr e inputs originales externos. Claude leyó el material suministrado; no
inspeccionó el repositorio mediante herramientas ni ejecutó tests. Los números de
verificación son ejecución propia, no revisión independiente.

## Cambios y contraste

- La CLI anterior del productor instalaba process.once después del constructor.
  Una reproducción con fuente baseline y sólo factory sustituido inició close y
  terminó por la segunda SIGTERM (-15), sin completarlo. serve.ts conserva parada
  temprana, valida puerto antes de factory, maneja bind síncrono/asíncrono y cierre
  inesperado, cierra una vez y conserva error+limpieza. Las señales repetidas no
  fuerzan salida. El fixture posterior usa Node worker y flock reales; no proving.
- Keeper ahora coopera con parada, interrumpe sleep/certificado HTTP incluido body,
  comprueba entre lecturas del índice y mantiene lease hasta terminar tick. Firma
  compartida comprueba antes de preparación, antes de firma y después de firma.
  Tras publicar journal se liquida o conserva, sin abandonar bytes por una señal.
  Una acción que pasó el último check puede publicarse tras la señal. No se
  modificó el protocolo de recovery/journals. El log de certificado sólo aparece
  si call efectivamente envió; se descartó añadir una prueba OS frágil sólo por ese
  mensaje, coherente con el alcance del cambio.
- Hallazgo confirmado: process.env llegaba al worker y la inspección standalone,
  incluidos secretos de servicio. environment.ts filtra ambos caminos, también
  overrides explícitos. Límites Go vacíos usan8/6GiB. No es sandbox del binario
  frente a archivos o datos del padre bajo el mismo usuario.
- Se reprodujo URL con API key sintética en stderr del keeper ante fallo de RPC.
  Las entradas y reintentos controlados registran sólo categorías, errno y
  mensajes estáticos permitidos; misión usa un campo numérico validado. Mensajes,
  stacks, cuerpos y URLs arbitrarios no se serializan. Los errores internos y
  agregados conservan identidad. La política se limita a caminos capturados; no
  se afirma que controle todo fallo inesperado de Node. No hay bypass raw-debug.
- Las unidades usan usuarios/grupos distintos, UMask0077, directorios0700 y
  KillMode=mixed. Se corrigió el lockout tras una caída breve de RPC: reintento30s
  sin límite permanente de arranques. Estado se contrasta con STATE_DIRECTORY;
  esa variable se reserva al manager, no es frontera contra admin que edita ambos
  valores. El env file es del manager, clientes/keys deben ser legibles sólo por
  la cuenta correcta. No se instalaron/habilitaron unidades.
- Cierre conserva todos los rechazos de recursos y release, manteniendo el error
  único cuando sólo hay uno. serialQueue.drain sí espera el tail final; absorbe
  rechazos de jobs cuyos clientes ya los reciben. Los tests de múltiples fallos
  de drain usan inyección sintética y no se presentan como fallo observado real.
- Cleanup de caché no reemplaza error primario ni descarta un resultado válido.
  Fallo sólo de mantenimiento informa cache.healthy=false, errno seguro y exige
  preprune en la próxima petición antes de generar. No se inventa cuota física.
- El writer Go existente usa tmp+rename, pero eso no garantiza durabilidad ante
  corte de energía. proof-cache.ts descarta JSON truncado/forma/binding inválidos
  como miss; I/O sigue siendo error. También descarta rechazo determinista de
  consumidor y conserva caché ante RPC, UnfinishedPrefix o selector desconocido.
  Rechazos incrementan proofRejections y avisan sólo kind/reason fijos. Primario,
  observador y error de eviction se agregan sin ocultarse.
- Los límites de palabras coinciden con consumidores:128 bits y booleanos opening
  en14/45/46/50. Se reprodujo un cached input x51 demasiado grande que pasaba el
  guard anterior y podía desbordar antes del consumidor; regresión roja conservada,
  corregida y tres outputs nativos históricos aceptados sólo por esquema, con
  hashes intactos. No es prueba criptográfica nueva ni replay.
- Se corrigió ABI incompleta de opening para InvalidExhaustionClaim/MismatchedScalar.
  consumer-abi.ts comparte las ABI reales entre servicio y tests; se prueban todos
  los rechazos de ambos consumidores, errores locales y fallo de eviction. El test
  contrasta declaraciones de Solidity y evita repetir una ABI incompleta sólo en
  el fixture. InvalidProof envuelve fallo de verifier; UnfinishedPrefix se retiene.
  Un false opening es resultado legítimo tras verificar, no fallo de proof.
  H3Prefix confirma ACCEPTED2/EXHAUSTED3, scalar inicial0 y escritura sólo en la rama
  accepted que retorna; exhaustion conserva0. No se cambiaron contratos ni Go.

## Verificación y límites

Última suite conjunta:182 tests/27 archivos en abi-tests.txt; typechecks scripts y
web aprobados. No se suman repeticiones para nuevos conteos. Los intentos fallidos
iniciales (loader de fixture, await dentro de factory no async, reason evaluado
antes del aborto y preparación de scripts) están separados; no se presentan como
aceptación. Los fixtures de pruebas firmadas/RPC no son pruebas Groth16 del juego.

Aceptación final real-entry-abi/result.json: CLI standalone y certificateProducer
reales, con artefactos existentes y consumidores reales en Anvil efímero, sin
sustitución de factory. Métricas requests/proofs/proofRejections0, salida natural0,
lease recuperado y stack completo cerrado. executionSources incluye state-lease.ts
y consumer-abi.ts; los hashes se contrastan con el árbol final. Los ensayos
real-entry anteriores quedan con sus hashes propios.

Los keeper children reales ejercitan lectura pendiente, recibo de journal ya
publicado y body de certificado. Usan RPC/logs/vistas ABI sintéticos, con RPC_URL
forzado al fixture; no demuestran corrección del juego. La cancelación sale0 sin
firmar/enviar; el journal publicado termina antes de liberar lease y sin consultas
nuevas. La prueba de timeout posterior conserva los mismos bytes.

Supervisor: validación systemd de copias con ruta Node instalada; probes reales
user-manager con parent/child Python y flock heredado (stop, SIGKILL+restart sin
solapamiento, timeout).128MiB/32tasks/1s son fixture, no presupuesto de producción.
Los addenda null corrigen N/A ambiguos sin reemplazar originales. El system manager
rechazó el probe por falta de autorización no interactiva: usuarios distintos,
hardening, runtime/tsx y StateDirectory juntos no tienen aceptación de host.
Nada escala privilegios ni instala servicios.150s es escalamiento, sin SLA frente
a FS bloqueado. Quedan host/recursos/alertas/finalidad, capacidad remota y aprobación
real de procedencia. Los gates de setup.ts/Deploy.s.sol/deploy-gnosis.sh siguen
idénticos; ninguna revisión asistida los autoriza.

Originales privados: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-service-operations/.
Cierre reproducible: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-service-operations-close/receipt.json.
Todos los cierres históricos permanecen intactos. Sin commits, push ni publicaciones.

La consulta abi final no encontró defectos obligatorios de código pendientes y
confirmó las nueve declaraciones de errores, las cinco categorías de rechazo y
los invariantes H3 (incluida paginación). Su condición documental se contrastó:
la guía enumera los cinco rechazos y explicita retención de UnfinishedPrefix y
selectores desconocidos. No se atribuye al arranque sin requests cobertura de
rechazo; ésta es sintética. executionSources es un conjunto seleccionado de
runtime, no el cierre transitivo de imports; el bundle inventaría el árbol moderno
completo por separado. No hubo nuevas instrucciones de habilitar producción ni
afirmaciones de revisión independiente.
