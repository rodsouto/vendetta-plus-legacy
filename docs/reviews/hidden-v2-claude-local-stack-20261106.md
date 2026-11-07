# Hidden v2: integración local revisada con Claude

Se ejecutaron cuatro llamadas reales: diseño, implementación, seguimiento y
cierre. Claude leyó las fuentes enviadas sin herramientas y no ejecutó tests.
Modelos, entradas completas/excerpt, respuestas literales y pins constan en
[metadata](hidden-v2-claude-local-stack-20261106-metadata.json). La versión del CLI
comprobada al cerrar es2.1.319. Las pruebas son del agente principal; la revisión
asistida no acredita independencia, procedencia segura ni aprobación de producción.

## Hallazgos y disposición

- `dev:local` usa consumidores mock y no puede representar el productor real por
  sí solo. Se añadió una ruta explícita separada, con verificadores archivados,
  consumidores/Game reales, productor, keeper y web. No se mezclaron los fixtures.
- Direcciones repetidas y firmantes compartidos: cuentas Ethereum efímeras separadas
  para deploy/H3/keeper, roles de Workshop en Anvil0 y dirección Game nueva por sesión.
  Los estados y credenciales nunca caen en el default compartido ni en Git.
- Vite podía cargar el `.env` raíz y terminar el proceso por su propio SIGTERM.
  Usa config inline, envDir vacío, envPrefix vacío, define local y cache propio;
  middlewareMode con HTTP/HMR controlados por el launcher. Fuente instalada Vite8.3.4
  confirmó el handler condicional. El canary ficticio suministrado en el arranque
  final no apareció en el navegador. No se envió ninguna credencial real a Claude.
- Foundry escribe sólo al output/cache/broadcast de la sesión. Compila código
  actual Game/consumidores antes de Anvil; los verificadores finales se reutilizan.
  Entorno allowlist, roles explícitos y rechazo de contracts/.env. El productor
  coteja setup/runtime en cadena antes de servir. No se generaron claves de setup.
- Cierre por señales repetidas y fallos: grupos propios, keeper→productor→web→Anvil,
  fallo de daemon observado durante RPC/forge, SIGKILL a descendientes al terminar
  su padre y ninguna señal posterior a PID acabados. Errores al escribir failed o
  closed no impiden otros pasos ni borran las causas agregadas.
- CLI distingue la razón exacta de una cancelación de fallos reales. Excepciones
  y rejections no capturadas pasan por cleanup y salida1. Un error tardío durante
  cleanup sigue siendo error. SIGKILL/caída del host no puede manejarse en JavaScript;
  puertos/PID y directorios single-use permiten diagnóstico, no reutilización ciega.
- La duda de passkeys no aplica: sin bundler, loadNetwork usa cuentas dev, confirmado
  desde Chromium. La ruta AA quedó intacta. Se conserva loopback127.0.0.1.
- Smoke más fuerte: counters explícitos, tipos numéricos, cero requests/proofs,
  títulos por ruta y pageerror. `requests` cuenta intentos de certificado en el
  handler; `proofs` se incrementa después del worker. GET metrics no los incrementa.
  Se registra si el canary fue suministrado; ausencia sin suministro no se afirma.
- Fixture Playwright: path de run compartido por servidor/helper, fingerprint mock
  desde ese mismo build, cache separado y puertos configurables. La revisión de
  cierre acertó sobre SIGKILL: se observó un temporal de la primera prueba implícita.
  Se añadió gracefulShutdown SIGTERM y trap; el nuevo ensayo implícito no dejó
  directorios nuevos. Se preservó el temporal anterior como artefacto del intento.

## Evidencia y límites

Pasaron151 tests TypeScript en21 archivos, typecheck de scripts, sintaxis Bash y
formato/diff del cierre. Los tests anteriores del servicio se restauraron desde
el bundle previo fijado por hash tras un error temporal de edición; la suite final
incluye los anteriores y las adiciones. Los mocks de lifecycle sólo prueban orden,
readiness401 y fallos de cleanup/recibos; no se presentan como pruebas reales de
muerte de procesos. Éstas tienen evidencia aparte:

- Tres arranques reales y navegación/registro/construcción con consumidores reales.
  El último usa counters numéricos explícitos y canary declarado. Cero solicitudes
  de certificados y ninguna prueba nativa nueva. Cada Game tiene otra dirección.
- HUP y TERM+INT+INT cierran los dos primeros CLI Node. El comando documentado pnpm
  se probó además con cancelación durante build (salida0 tras cleanup) y con excepción
  inyectada tras estar listo (salida1 tras cleanup y todos los PID propios ausentes).
- SIGKILL al Anvil propio durante startup: fallo de child identificado, failed/closed
  con la causa y cleanupErrors0. Procesos Node sintéticos prueban grupo, timeout y
  un worker que ignora SIGTERM; close usa SIGKILL y espera su muerte.
- Flujo completo de jugador con certificados de confianza MOCK: dos registros,
  construir, entrenar, enviar oculto, esperar, resolver y consultar informe/ranking.
  No es el recorrido criptográfico de los consumidores reales.

El recorrido oculto completo del nuevo launcher no se reejecutó. La evidencia
criptográfica real continúa siendo el replay Game/H3 archivado. No se repitieron
MPC/init/FFT/sellados/setup/keygen/proving/replay del juego, ni se reemplazaron sus
artefactos o recibos. El launcher usa tiempo normal: saltar Anvil no publica drand
futuro. Un RPC/recibo en curso puede alargar el cierre; I/O del kernel y hardware
no tienen una nueva garantía de duración o durabilidad.

Guía y configuración: [local hidden v2](../local-hidden-v2.md).
Raw logs, prompts y respuestas fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-local-stack/`.
El bundle/receipt de cierre fija la versión final y sus comprobaciones. Fuentes
compartidas con Claude por autorización del propietario; sin contacto con
participantes humanos, publicación o despliegue real. Producción sigue bloqueada.
