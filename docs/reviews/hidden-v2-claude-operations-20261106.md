# Hidden v2: revisión operativa experimental, 6 de noviembre de 2026

Alcance elegido por el propietario: hobby local sin colaboradores externos, con
Claude como segundo revisor técnico. No se atribuye independencia ni aprobación
de producción. Las respuestas son lecturas del código enviado, sin herramientas:
los tests y compilaciones los ejecutó el agente principal.

## Disposición de hallazgos

- Diseño: fd numérico sin finalizador, código de contención75, timeout/reap y
  release idempotente. Se hereda la misma open file description a inspecciones y
  workers; así un hijo huérfano retiene el lock hasta salir. El cierre bloquea
  enqueues antes de capturar drain y espera allSettled antes de soltar el fd.
  Se añadió assertOpen tras el beacon y abort al worker. El entrypoint ya llama
  close en SIGTERM y error de listen; el worker es perezoso durante startup.
- Implementación: corregida la muerte del worker idle durante los await rm;
  se comprueba exited/failure antes de asignar pending, y kill siempre rechaza
  pending aunque el proceso ya saliera. Inspecciones usan stdin ignore.
- Seguimiento: Claude no encontró otro bug accionable en las fuentes enviadas.
  Su duda sobre shutdown se resuelve con assertOpen síncrono antes de enqueue y
  closing=true antes de drain en service.ts (fuente omitida en ese seguimiento,
  incluida en la revisión inicial). La allowlist de prune excluye el lock y
  hay test de inodo. Se reforzó el timeout de flock: el stub toma realmente el
  lock antes de dormir. El Go idle sale por Scanner EOF; ocupado puede terminar
  por SIGPIPE/EOF y dejar proof completo o temporal. Se documentó esa frontera.
- Compilador: se evita reutilizar output y escribir bajo keys, incluidos los
  targets reales de los directorios de cada circuito. Se fija el digest del
  manifest leído con la fuente antes del build, sin releerlo después. Se valida
  kind y bytecode desplegado no vacío. Output es obligatorio en la API/CLI; se
  actualizaron ambos callers encontrados, y runtimeFile conecta el servicio.
  El override vacío vuelve al valor histórico documentado.
- La recomendación de Claude de prohibir el runtime histórico no se adopta:
  preservarlo como fallback de lectura no acredita ni afirma que fuese emitido
  por el compilador nuevo. Se mantiene el cotejo exacto de setup/runtime contra
  los consumidores. No se retocaron los metadatos archivados. La nueva CLI exige
  output fresco; el ejemplo configura HIDDEN_PROVER_RUNTIME explícitamente.
- Se probó Forge/solc reales con contratos mínimos sintéticos en dos roots
  distintos: hashes iguales. No se recompilaron verificadores finales, ni se
  comprobó de nuevo criptografía del juego. Entorno/compiler siguen confiables;
  el nuevo JSON es correspondencia local, no procedencia autenticada. No se
  promete inmutabilidad ni durabilidad del build ni snapshot atómico de inputs.

- Journal: se añadió sincronización antes de broadcast tanto en H3 como keeper
  (helper compartido). La revisión señaló que volver a sincronizar bytes viejos
  tras un writeback error no basta. Se corrigió republicando los mismos bytes
  firmados en un temporal exclusivo nuevo, fsync/close, rename y fsync del directorio
  antes de cada envío/reintento. Se conserva el status confirmado si falla el
  fsync o unlink del borrado. Se corrigió también una aserción de test que
  podía ser absorbida como error de broadcast: ahora se contrasta fuera del callback.
  Keeper simula otra vez tras un resultado confirmado cuyo borrado falló; el test
  impide una firma nueva sobre una acción ya completada. H3 vuelve a leer
  contextInitialized/states antes de begin/advance en el siguiente request.
  Tests inyectan fallos de sync y rename y comprueban orden,
  ausencia de broadcast, cierre de handles y recuperación sin nueva firma cuando
  existe journal. No son pruebas físicas de corte de corriente.

## Límites y reproducción

Linux/util-linux, PATH confiable, directorio privado estable y filesystem local.
Nunca borrar .vendetta-state.lock; la existencia del archivo no denota ownership.
Un huérfano colgado puede impedir reiniciar indefinidamente: diagnosticar el PID,
no borrar el lock. Un directorio por keeper simultáneo (KEEPER_STATE_DIR), incluso
entre deployments distintos; no se altera el default ni se migran journals.
No hay exclusión global de signer entre directorios distintos.

Se ejecutaron seis llamadas reales Claude Code 2.1.318; modelos y digests por
respuesta constan en [metadata](hidden-v2-claude-operations-20261106-metadata.json).
Los logs, prompts, inventarios de entrada y respuestas JSON originales están en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-state-lease/`. El nombre
externo conserva la fecha de inicio; el cierre es del6. Metadata adyacente fija
sus hashes y las copias Markdown de cada respuesta sin reformatearlas.
Fuentes enviadas a Claude por autorización del propietario, sin claves privadas,
transcripts ni contactos con participantes humanos.
