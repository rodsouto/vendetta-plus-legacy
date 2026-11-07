# Revisión técnica: state lease, producer y keeper

**Resultado:** el modelo de ownership es correcto, pero hay un cuelgue real en `ProducerWorker` y un probable crash en el camino leased. Antes de confiar en el lease, comprueba también `pruneCache`, porque podría borrar el lockfile. Esta revisión se basa solo en la lectura del código: no he ejecutado nada y no es una aprobación.

## Bugs en caminos soportados

### 1. Cuelgue si el worker idle muere durante `rm` (`worker.ts:163-174`)
**Confirmado por lectura.**

1. El chequeo de `state.exited` ocurre antes de los dos `await rm`.
2. Si el worker muere por OOM o crash en esa ventana, `close` ya se ha emitido.
3. La línea 166 reutiliza ese estado muerto y `state.pending` queda asignado.
4. `stdin.write` sobre un stream destruido no rechaza el pending, y `close` no se repetirá.
5. Timeout y abort llaman a `kill()`, que no hace nada con `exited === true`, así que tampoco rechazan.

**Efecto:** la promesa queda colgada, la cola se bloquea y `worker.close()` espera `active` para siempre. El lease no se libera hasta matar el proceso. Es fail-closed para el estado, pero pierde liveness. La ventana es estrecha, y el bug pudo existir antes, pero ahora también bloquea el shutdown.

**Fix mínimo:**
- Rechaza dentro del executor si `state.exited`, antes de asignar `pending`.
- En `kill()`, si ya salió, rechaza y limpia cualquier `pending`.

### 2. `stdin.end()` sin listener de error (`jobs.ts:71`)
**Probable; depende de la versión de Node.**

Si el spawn falla con ENOENT o EACCES, Node puede crear igualmente `child.stdin` sobre un handle no conectado. `end()` llamaría entonces a `shutdown`, que puede fallar con ENOTCONN. Sin listener, eso sería una excepción no capturada en lugar de un rechazo limpio.

La inspección es el primer proceso nativo de cada job, así que un `binary` mal configurado llegaría aquí. El estado sigue seguro, porque el proceso muere y el kernel libera el lock, pero el producer entero cae por un error de una sola petición. El antiguo `execFile` no tocaba stdin.

**Fix:** usa `stdio: ["ignore", "pipe", "pipe", fd]` y elimina `child.stdin?.end()`. La inspección no parece necesitar stdin, pero confirma que el binario no lo lee.

### 3. Regresión de alcance en el keeper (`keeper.ts:35-39`)
**Confirmado por lectura.**

El journal incluye chain, game y signer, así que dos keepers de deployments distintos podían compartir el directorio por defecto sin colisionar. Ahora el segundo falla con "already in use".

Es fail-closed y el mensaje es accionable, pero cambia el comportamiento. No propongo mover el directorio por defecto, porque dejaría journals existentes fuera de la ruta de recuperación. Lo más simple es documentar un `KEEPER_STATE_DIR` por instancia.

### 4. Plataforma y diagnóstico (menor)
- **Plataforma:** keeper y producer ya no arrancan fuera de Linux ni sin `flock` de util-linux. Si lo aceptas, documéntalo.
- **Diagnóstico:** el camino leased descarta `stderr` en los fallos (`jobs.ts:80`). Una inspección fallida solo dirá "Producer process failed". Conviene incluir una cola acotada de `stderr` si no contiene datos sensibles.

## Comprobaciones pendientes

### A. `pruneCache` y el lockfile (prioridad máxima)
`.vendetta-state.lock` vive dentro de `config.cache`, y `cache.ts` no aparece modificado en el git status inicial. No puedo ver su código.

Si la poda recorre todo el directorio sin una allowlist estricta, el lock podría ser candidato a borrado, y su mtime no cambia. El siguiente arranque crearía otro inodo y un segundo owner, sobre todo si un orphan sigue vivo. El chequeo dev/ino solo protege durante la adquisición.

**Test recomendado:** ejecuta `pruneCache` con límites mínimos y verifica que el lock conserva el inodo. Comprueba también que el lockfile no cuenta como uso de caché.

### B. Salida del binario Go con stdin EOF
Sin esto, F1 no queda cerrado para el worker residente. Si el padre recibe SIGKILL con el worker idle, solo el EOF de stdin permite que salga. El fixture de Node lo hace por readline, pero eso no prueba `--prove-worker-v2`. Si el binario real no sale con EOF, un worker idle retendría el directorio indefinidamente.

**Test recomendado:** usa el binario real con un setup sintético, cierra stdin y exige que salga. Esto no requiere claves reales ni pruebas de partida.

### C. Entrypoint del producer
No lo veo. Un descriptor numérico no se libera por GC, así que un fallo de `listen` sin `close()` mantiene el lease mientras el proceso viva. Si el entrypoint sale tras el error, no hay problema. Verifica también que SIGTERM llame a `close()`, o la parada normal dejará un orphan en mitad del job.

## Evaluación de lo pedido

**Ownership tras la muerte del padre: correcto.**
- `flock` pertenece a la open file description, que sobrevive mientras la tenga el hijo en stdio[3].
- La muerte del padre no libera el lock si hay un hijo vivo, y el sucesor falla cerrado.
- Tras la salida real del hijo, el kernel ya ha cerrado sus descriptores, así que adquirir después de `close` es seguro.
- Sin hijos activos, SIGKILL del padre libera el lock al instante.

**Shutdown: correcto salvo el bug 1.**
- `closing` se activa antes de `drain`, y `assertOpen` corre en el mismo tick que `enqueue`, así que no se cuela trabajo tras capturar `tail`.
- `lease.release()` ocurre después de `allSettled`, por lo que no veo uso de `lease.fd` tras cerrarlo ni reutilización de ese número.
- Las esperas RPC o beacon no abortables alargan el cierre, pero mantienen el lease: es aceptable.

**Manejo de fd y ciclo de vida: sin bug adicional.**
- libuv abre con `O_CLOEXEC`, así que el fd solo llega a los hijos que lo reciben explícitamente.
- El listener de `error` se registra en el mismo tick que `spawn`, así que `ABORT_ERR` no se pierde.
- `spawn` ignora `maxBuffer` y `stateLeaseFd`, y `killSignal` queda fijado a SIGKILL.
- Un timeout tras adquirir `flock` cierra el fd y libera el lock correctamente.
- Los fallos de startup liberan el lease, y `ProducerWorker` no lanza procesos hasta su primer job.

**Errores que fallan cerrado (aceptables):**
- Con EMFILE o ENFILE, `child.stdin` puede no existir y `worker.ts:97` lanzaría `TypeError`. El job falla sin proceso vivo.
- Un `maxBuffer: Infinity` se rechaza en el camino leased.

**Keeper: integración correcta salvo el punto 3.** Adquiere el lease antes de cualquier RPC, y el `finally` cubre los errores previos al bucle. SIGTERM mata el proceso, el kernel libera el lock y el keeper no tiene hijos con el fd.

## Límites operativos y entradas hostiles no soportadas

No son bugs bajo el modelo que describes:
- reemplazo hostil del directorio o del lock, o `PATH` y `flock` manipulados;
- NFS u otros filesystems sin semántica local de `flock`, incluido cualquier montaje con semántica dudosa bajo WSL2;
- hijos nativos que hereden fd 3 o llamen a `LOCK_UN`;
- unicidad global de un signer entre directorios distintos;
- un orphan colgado, que retiene el directorio sin timeout porque el timer murió con el padre.

Para ese último caso, documenta el diagnóstico: `fuser -v <dir>/.vendetta-state.lock`. El mensaje "already in use" no distingue un servicio legítimo de un orphan. La decisión de matarlo debe seguir siendo manual.

## Cobertura

En los tests mostrados no encuentro todo lo que describes:
- El timeout del producer usa `runProducer` **sin** `stateLeaseFd`, así que no cubre `runLeasedProducer`.
- El test del worker con lease solo cubre `close`. No hay parent SIGKILL real con `ProducerWorker`.

Si esos casos están en otro archivo, ignora este punto.

**Tests a añadir:**
1. Leased con binario inexistente: rechazo limpio y sin excepción no capturada (bug 2).
2. Leased con timeout, exit distinto de cero y output excedido: rechazo después de `close` y lease libre tras cerrar la referencia del padre.
3. `pruneCache` con el lockfile presente (punto A).
4. Worker que muere durante el `rm` previo, con `rm` mockeado para forzar la ventana: rechazo y `close()` terminando (bug 1).

**Tests opcionales:**
5. `ProducerWorker` real bajo un padre que recibe SIGKILL, tanto idle como en mitad de un job.
6. Dos keepers con deployments distintos en el mismo directorio, para fijar el comportamiento elegido.
7. EOF de stdin con el binario Go real (punto B), que pasa a ser obligatorio si no puedes confirmarlo leyendo su código.

## Orden recomendado
1. Verificar `pruneCache`.
2. Corregir el bug 1.
3. Pasar la inspección a stdin `ignore`.
4. Confirmar el EOF del worker Go y el entrypoint.
5. Documentar la regresión del keeper, el requisito de Linux y el diagnóstico de orphans.