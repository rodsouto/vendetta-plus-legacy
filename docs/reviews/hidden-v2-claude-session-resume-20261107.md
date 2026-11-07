# Hidden v2: reanudación local revisada con Claude

Seis revisiones reales con Claude Code, herramientas desactivadas. Claude leyó fuentes;
no ejecutó tests. Entradas completas, SHA-256, respuestas literales y modelo constan
en la [metadata](hidden-v2-claude-session-resume-20261107-metadata.json). Prompts/JSON raw/stderr y ensayos originales permanecen en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261106-recovery-review/`.
El nombre conserva la fecha inicial; el trabajo continuó el7 local. No se enviaron
credenciales, dumps de cadena, claves de setup ni transcripts privados. Sí fuentes
y una traza pública de construcción, por autorización del propietario.

## Disposición contrastada

- Diseño: no hubo un defecto previo confirmado que justificara reabrir el cierre
  del6; se eligió cerrar la limitación de pérdida del mundo al apagar.
- Stop/load Anvil: presupuesto propio60s y pin del ejecutable;512MiB es rechazo
  posterior al dump, no cuota física ni capacidad máxima demostrada.
- Consumir sin probar carga: validación primero, con RPC público oculto y sin
  escritores; hash histórico/head/nonces. Luego .used sincronizado antes de mostrar
  la cadena y admitir escrituras. La misma instancia continúa, sin rama temporal.
- Exposición de scratch: confirmado en revisión de código y corregido. El último
  ensayo mantuvo una pestaña real:52 lecturas públicas, cero regresiones y ninguna
  respuesta con head antes del marcador. Cancelación previa vio503 y conservó source.
- Firmantes y semántica: claves Ethereum H3/keeper persistidas privadas, inventario
  de journals/cache/identidades/token/binario y pins de ABI/fuentes/datos. El test del
  grafo TypeScript encontró spec-data/src/index.ts omitido: se añadió junto a manifests
  de workspace. La cobertura está comprobada por el agente, no por Claude.
- Browser durante cierre: gateway bloquea escrituras/batches y espera forwards ya
  admitidos antes del pool. No se fuerza minería ni tiempo. Pool atascado, fallo de
  writers o Anvil sin salida limpia impiden checkpoint autorizado.
- Recibo y señal: closed sincronizado, directorio de resume existente antes del lease,
  nueva ruta de checkpoint impresa. Anvil muerto durante drain ahora produce error
  de mundo no guardado; se corrigió el test que antes aceptaba éxito silencioso.
- Ctrl-C: se observó masking en wrappers tsx y pnpm9. El handler pnpm instalado
  procInterupt termina con process.exit() sin preservar el resultado. Se ofrece
  scripts/dev-hidden-v2.sh con exec Node directo, probado con SIGINT de grupo.
  El atajo pnpm permanece disponible con esa limitación explícita; no se cambió vendor.
- Gas del firmante local: el smoke final detectó queueRoom revertido. La atribución
  inicial confundió gas usado173038 con límite. Claude detectó el error:0x2b56e es
  **177518**. La traza posterior mostró out-of-gas en DELEGATECALL de biblioteca;
  los callers conservaban gas, por eso no se agotó el límite superior. La misma
  construcción posterior usó190493. Que el estado cambiara entre estimación e
  inclusión es una inferencia; la traza sólo prueba el OOG delegado. No se sustituyó el informe original: corrección
  y traza se archivan por separado.
- sendPlain estima con remitente real y añade50% redondeado más100000gas. Mantiene
  rechazos antes de broadcast y semántica de llamadas previas ya minadas. Afecta
  cuentas dev y admin local de PasskeySigner; la operación4337 no cambia. No garantiza
  todas las variaciones futuras del estado. Missions conserva su reserva gasleft y
  Backlog; no se cambian decisiones del juego ni reglas/circuitos/contratos.

## Evidencia y alcance

El ensayo final está en real-run7/real-resume-result.json (harness-v2). Su primer
arranque fue cerrado por una carrera del harness al leer stack.json todavía vacío;
se conservó y reanudó su checkpoint sin tocar journals/identidades. El harness
corregido espera JSON completo. Después pasó navegador fresco con registro y
construcción, cancelación antes del consumo y retry, dos reanudaciones con la misma
Game, logs/bloque histórico/bytecode/32 slots, keeper SIGKILL con snapshot y siguiente
resume, y cancelación consumida con exit no cero. Requests/proofs=0. Snapshots,
credenciales y outputs privados permanecen fuera de Git.

Los intentos anteriores siguen separados: run1 rechazó por añadir fuente pin durante
el ensayo; run2 pasó su versión; run3/run4 detectaron el exit masking; run5 pasó la
entrada directa anterior; run6 descubrió el fallo de gas y conserva diagnóstico.
No sumarlos como retests de criptografía. Ninguno se reemplazó para esconder fallos.

Pruebas ejecutadas por el agente: sesión/hash/consumo, gateway HTTP real, procesos y
leases, bloqueo/recuperación, journals minados y raw no enviado en Anvil restaurado,
head/link/timestamp/basefee, y estimación/errores del firmante. Los conteos finales,
typechecks, formato, comandos y hashes constan en el recibo externo. No hubo nuevo
MPC/init/FFT/sellado/keygen/setup/proving/replay criptográfico del juego. La evidencia
Game/H3 sigue archivada; revisión asistida no es independencia ni aprobación.

[Guía](../local-hidden-v2.md), [handoff](../proposals/hidden-v2-session-handoff.md).
Producción sigue bloqueada. El cierre reproducible nuevo está en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-session-resume-close/`.

La última respuesta no encontró defectos runtime bloqueantes en sus entradas y
pidió dos correcciones de fixture: fallo en estimateContractGas después de una
llamada ya minada, y límite177518 en lugar de gas usado173038 como valor sintético.
Se corrigieron y verificaron ambas. El comentario de revertName aclara que un
bloque puede incluir más de una transacción y el error se consulta al final del
bloque. Un startup fallido tras consumo sigue siendo no recuperable y closed.json
es la autoridad operativa, aunque el error principal no sea una cancelación.
