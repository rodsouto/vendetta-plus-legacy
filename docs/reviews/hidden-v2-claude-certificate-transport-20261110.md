# Revisión real Claude: transporte acotado de certificados

Se completó el bloque interrumpido del7 tras nueva instrucción del propietario.
HEAD real c84b9f6393e57025df4c3648ec59f7fe4dc6c040, rama
feat/hidden-v2-local-mpc-review. Los cambios previos de certificates.ts/test se
conservaron. /tmp del7 no sobrevivió: no se acredita ninguna revisión perdida.
Se preservan todos los cierres anteriores sin reemplazarlos.

Tres consultas reales mediante Claude CLI2.1.321, modelo reportado claude-opus-5-5,
con herramientas desactivadas, MCP vacío estricto y no-session-persistence.
Claude leyó fuentes suministradas, sin inspeccionar el repositorio ni ejecutar
pruebas. Las respuestas literales se conservan en
[initial](hidden-v2-claude-certificate-transport-20261110-initial.md),
[followup](hidden-v2-claude-certificate-transport-20261110-followup.md) y
[closure](hidden-v2-claude-certificate-transport-20261110-closure.md).
[Metadata](hidden-v2-claude-certificate-transport-20261110-metadata.json) fija
prompts/respuestas JSON originales/stderr/inputs por SHA-256 y fuentes por consulta.
Los originales están en el cierre externo indicado abajo; las fuentes tardías
no se atribuyen a consultas anteriores. Un intento restringido de seguimiento
salió1 sin respuesta y no cuenta como revisión.

## Contraste y disposiciones

- Reproducción propia de HEAD, fixture finito sin red: devolvía un array como
  certificado y aceptaba JSON65573 bytes con certificado pequeño. Ahora la lectura
  retiene <=65536 bytes decodificados antes de parsear, incluso con header falso,
  gzip o chunked. Exige string real y conserva máximo16384 bytes de certificado.
  Cancela cuerpo fallido/excesivo y libera reader; ningún fallo fabrica INVALID.
- Claude confirmó observabilidad incompleta del nuevo error de exceso. Se añadieron
  mensajes estáticos401/403/429/HTTP genérico/exceso al resumen seguro, probados
  desde errores reales de requestCertificate. No se registran URLs/bodies/tokens.
  La pérdida de detalle del status dinámico era preexistente.404 sigue genérico.
- La duda sobre tamaño de proof procedía de una fuente omitida: proof-cache.ts
  exige384 bytes antes de codificar; service.ts valida ambos caminos. Claude lo
  contrastó en closure. Opening2304 bytes e invalid-point608 caben en ambas cotas.
  La prueba de handler usa ABI y bytes de proof sintéticos, sin probar relaciones
  criptográficas ni ejecutar certificateProducer/proving del juego.
- Timeout/any ya existían y Node>=22 es requisito. No se demostró fuga nueva ni se
  introdujo configuración de producción sólo para tests. Se probó precedencia de
  timeout en HTTP sin headers usando fuente de timeout sustituida: valida routing,
  no mide120s reales. Se probaron stop antes/durante body y tras payload completo.
- Se corrigió el comentario sobre stop observado durante cleanup: puede ganar antes
  de reportar un error si el timeout no ganó primero. El timeout primero conserva
  su error; el guard final rechaza un payload completo tras stop. No retorna bytes
  cuando observa parada. Fallos operativos reales pueden salir no cero al parar,
  conforme a política existente. Nada cambia los journals publicados.
- TLS es un requisito de despliegue pendiente, sin red real habilitada. Las
  observaciones adicionales sobre pre mayúsculo o JSON fresco se contrastaron:
  son caminos existentes de rechazo/cache miss, sin defecto nuevo demostrado que
  justifique repetir criptografía o ampliar este bloque.

## Verificación propia y alcance

33 tests/5 archivos: certificates, keeper-certificate-stop, keeper-shutdown,
service-errors, service-logging. Ambos typechecks, Prettier y diff check aprobados.
No sumar29/19/17 preliminares ni182/27 del cierre anterior. Stdout final preservado
exactamente desde la salida original de herramienta en verified-final-tests.txt;
el resultado29 previo es metadata transcrita de la herramienta y se etiqueta así.

Fixtures pequeños, HTTP loopback real, gzip, cutoff sin EOF, redirect sin contactar
destino, handler productor real con sobres sintéticos, keeper child con RPC/logs/
vistas sintéticos y flock. No hubo MPC/init/FFT/sellado/setup keygen ni pruebas o
replay del juego, despliegues/publicaciones/commits. Los primeros intentos
restringidos sin diagnóstico y el fixture ilimitado interrumpido del7 no acreditan
aceptación; sus evidencias del7 ya no existen y no se reconstruyen como originales.

Closure no encontró defectos bloqueantes en sus entradas; es revisión técnica
asistida, no aprobación independiente ni prueba ejecutada por Claude. La cota de
payload no limita buffers internos/decompresión/JSON/RSS/CPU ni capacidad. Host con
usuarios separados/hardening completo, recursos/alertas/finalidad, procedencia y
aprobación final siguen sin acreditarse. Anvil efímero y gates intactos.

Cierre reproducible nuevo:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261110-certificate-transport/receipt.json.
Incluye prompts/respuestas originales, pins, fuentes y verificaciones de integridad.
