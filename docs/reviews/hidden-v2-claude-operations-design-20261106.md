# Revisión del lease de directorio

**Veredicto:** el diseño es correcto para procesos cooperantes en Linux, pero conviene corregir F1–F4 antes de integrarlo. Revisé solo el texto suministrado, sin ejecutar nada, y esto no aprueba el código. Tampoco vi `worker.ts`, `jobs.ts`, `http.ts` ni el entrypoint del producer, así que F1 y F2 quedan condicionados a ellos.

## Semántica confirmada
- **OFD:** `dup2` conserva la misma descripción de archivo abierta. `flock` util-linux no desbloquea al salir en modo fd, y el lock sigue mientras el padre mantenga su referencia. Esto coincide con tu resultado 0/1/0, que no reproduje.
- **Aislamiento:** cada `open` crea otra OFD, así que dos instancias del mismo proceso compiten correctamente.
- **Desbloqueo accidental:** abrir y cerrar el archivo por separado no libera el lock, a diferencia de `fcntl` POSIX. Solo lo libera `LOCK_UN` sobre esa OFD o el cierre de su última referencia. El hijo recibe el fd únicamente durante la adquisición.
- **Herencia:** libuv abre con `O_CLOEXEC`, por lo que los procesos nativos no deberían heredar el lock. Conviene cubrirlo con un test.
- **Prune:** `pruneCache` ignora `.vendetta-state.lock` porque no coincide con `owned`.
- **Alias de ruta:** el lock va por inode, de modo que distintas rutas al mismo directorio compiten entre sí.

## Hallazgos

### F1 (alto): SIGKILL libera el lease aunque sigan vivos procesos nativos
Por `O_CLOEXEC`, un worker o `--inspect-v2` huérfano no retiene el lock. Un sucesor podría hacer prune mientras el huérfano escribe en la caché.

Verifica que el worker residente muera con EOF en stdin o IPC. Si no lo hace, la opción mínima es `PR_SET_PDEATHSIG`. Heredar el fd al worker también sirve, pero un worker colgado bloquearía el reinicio y `execFile` no permite pasar stdio extra.

### F2 (alto): el cierre puede liberar con un worker vivo o trabajo pendiente
- `Promise.all` rechaza con el primer fallo. Un `.finally` encadenado ahí podría liberar antes de que termine `drain()`.
- Tras el último `assertOpen()` de `generate` hay un `await` del beacon y luego `worker.run` sin recomprobar. Si `close()` ya pasó y el worker arranca de forma perezosa, podría revivir después del cierre.

Añade `assertOpen()` justo antes de `worker.run`, y haz que `run` rechace para siempre tras `close`. Comprueba también que `drain()` espere el job en curso y que `worker.close()` espere la salida real. Un `waitForTransactionReceipt` en curso no se aborta, así que el cierre puede tardar más de 60 s, y el lease debe seguir retenido.

```ts
shutdown = (async () => {
  closing = true;
  abort.abort();
  const httpClosed = new Promise<void>((done) => server.close(() => done()));
  server.closeAllConnections();
  const results = await Promise.allSettled([
    httpClosed,
    (async () => worker.close())(),
    (async () => enqueue.drain())(),
  ]);
  lease.release();
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
})();
```

Si `drain()` no termina, el lease sigue retenido y el reinicio falla cerrado, que es lo correcto.

### F3 (alto): `FileHandle` introduce dependencia del GC
Si el handle queda inalcanzable, Node puede cerrarlo en GC y soltar el lock en silencio. Depender de que una closure lo retenga es frágil.

Recomiendo usar un fd numérico con `openSync`/`closeSync`, que no tiene finalizador. Su riesgo es el doble cierre sobre un número reciclado, y lo evita un `release()` protegido por una bandera.

### F4 (medio): el exit code 1 es ambiguo
Trata solo un código exclusivo como contención: `--conflict-exit-code 75`. Cualquier otro código distinto de 0, o un `code === null`, es fallo de adquisición. BusyBox fallará por la opción larga, y eso es un fallo cerrado aceptable.

### F5 (medio): trampas al reapear el hijo
- `error` no siempre significa que el hijo terminó: `kill` fallido también lo emite con el proceso vivo.
- Distingue por `child.pid === undefined`. Sin pid, nunca hubo hijo y se puede cerrar. Con pid, espera siempre a `exit`.
- Usa `SIGKILL` para el timeout y stdio `ignore` en 0–2, para no depender de streams.
- Si el timeout coincide con una salida 0, decide por el resultado de `exit`. Cerrar tras un fallo es seguro porque el hijo ya no retiene la OFD.

### F6 (medio): fuga en el arranque
La envoltura mínima evita reindentar toda la función:

```ts
export async function certificateProducer(config: ProducerConfig) {
  await mkdir(config.cache, { recursive: true, mode: 0o700 });
  const lease = await acquireDirectoryLease(config.cache);
  try {
    return await startProducer(config, lease);
  } catch (error) {
    lease.release();
    throw error;
  }
}
```

Quedan dos huecos:
- Si `producerServer()` lanza después de crear el worker, hay que cerrar el worker antes de propagar el error.
- `certificateProducer` no llama a `listen`. Si `listen` falla con `EADDRINUSE` no hay evento `close`, así que el llamador debe invocar `close()` para no retener el lease.

### F7 (medio): regresión con el directorio por defecto del keeper
Hoy, varios keepers de distintas chains o Games comparten `~/.local/state/vendetta/keeper` con journals separados. Con el lease, el segundo fallará. Es coherente con "un directorio por instancia", pero rompe esa operación. El error debe mencionar `KEEPER_STATE_DIR`, y hay que revisar scripts y documentación.

### F8 (bajo): orden y `finally` en el keeper
Mueve el cálculo de `stateDir`, `mkdir` y la adquisición antes de `client.getChainId()`. Adquiere fuera de `tick`, para que la contención termine el proceso y no se reintente.

El bucle es infinito y captura los errores, así que `finally` solo actúa en fallos de arranque. SIGTERM sin handler y `process.exit` tampoco lo ejecutan, y ahí la liberación la hace el kernel. Por eso no hace falta reindentar el CLI solo para tener `finally`. Con `tsx`, el lock lo retiene el proceso Node real, que es lo deseado.

### F9 (bajo): portabilidad
En Windows, algunas constantes `O_*` pueden ser `undefined` y desaparecer del OR sin error. Comprueba `process.platform === "linux"` al inicio. En WSL2, `/home` usa el kernel Linux normal, pero no daría por válido `/mnt/c` sin probarlo. Los fixtures y CI necesitarán `flock` util-linux, y hay que revisar imágenes Alpine si existen.

### F10 (bajo): archivo reemplazado
Tras adquirir, compara `dev`/`ino` del `fstat` con un `lstat(path)`. Es una línea que detecta si alguien renombró o reemplazó el archivo durante la apertura. No protege contra un `rm -rf` posterior del directorio, que queda fuera del modelo.

## Reinicio simultáneo
- `await close()` seguido de un arranque nuevo funciona si `release()` es el último paso.
- Sin ese `await`, el nuevo arranque falla como ocupado, y es el comportamiento correcto.
- Si el padre muere durante la adquisición, el hijo retiene el lock unos milisegundos. El sucesor puede fallar y debe reintentarlo el supervisor, sin espera interna en el helper.
- La muerte del proceso libera el lock sin expiración ni PID, siempre que se resuelva F1.

## Helper mínimo

```ts
export async function acquireDirectoryLease(directory: string, timeoutMs = 5000) {
  if (process.platform !== "linux") throw new Error("Directory lease requires Linux");
  const path = join(directory, ".vendetta-state.lock");
  const { O_CREAT, O_RDWR, O_NOFOLLOW, O_NONBLOCK } = constants;
  const fd = openSync(path, O_CREAT | O_RDWR | O_NOFOLLOW | O_NONBLOCK, 0o600);
  let held = false;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Invalid state lock");
    const code = await flockChild(fd, timeoutMs); // resuelve solo tras reapear
    if (code === 75) throw new Error(`State directory already in use: ${directory}`);
    if (code !== 0) throw new Error("State lock acquisition failed");
    const current = lstatSync(path);
    if (current.dev !== stat.dev || current.ino !== stat.ino)
      throw new Error("State lock was replaced");
    held = true;
  } finally {
    if (!held) closeSync(fd);
  }
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      closeSync(fd);
    },
  };
}

function flockChild(fd: number, timeoutMs: number) {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      "flock",
      ["--exclusive", "--nonblock", "--conflict-exit-code", "75", "3"],
      { stdio: ["ignore", "ignore", "ignore", fd] },
    );
    if (child.pid === undefined) {
      child.once("error", reject);
      return;
    }
    child.on("error", () => {}); // solo `exit` confirma el reap
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
```

## Tests mínimos
1. **Helper:** 0, 75 y 0 tras `release`, entre dos procesos y entre dos llamadas del mismo proceso.
2. **SIGKILL:** matar al poseedor y readquirir sin borrar el archivo.
3. **Validación:** symlink, FIFO y `nlink` 2 se rechazan sin desbloquear al poseedor legítimo.
4. **Fallos del hijo:** `flock` ausente, salida distinta de 0 y 75, y timeout con un `flock` falso en `PATH`.
5. **Inmunidad:** con el lease retenido, leer y cerrar el archivo por otra OFD no libera, y `release()` doble es inocuo.
6. **Herencia:** un hijo normal no tiene el fd del lock.
7. **Producer:** el segundo arranque falla antes de tocar un archivo centinela de la caché, y un fallo tras adquirir deja el lease libre.
8. **Cierre:** con `drain()` retenido el lock sigue ocupado; con `worker.close()` rechazado, también hasta que `drain()` termine; dos `close()` comparten promesa.
9. **Keeper:** un segundo proceso con el mismo directorio sale antes de cualquier RPC, comprobado con un contador en un RPC local falso.
10. **Orfandad (F1):** tras SIGKILL del padre, el worker nativo termina antes de que el sucesor haga prune.