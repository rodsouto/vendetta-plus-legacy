# Dominios reales: primera medición local acotada

4 de noviembre de 2026. Esta PC inicializó el SRS de fase 1 en los dos dominios
del juego y serializó el estado inicial directamente a SHA-256, sin retener un
buffer wire completo ni escribir SRS/keys a disco. La fase 1 es independiente
del circuito; los dominios coinciden con el informe de CS reproducido cuyo pin
se registra en [results.json](results.json).

| Dominio | Referencia    | Wall worker |    MaxRSS |
| ------- | ------------- | ----------: | --------: |
| 2²²     | invalid-point |     8,939 s | 2,414 GiB |
| 2²³     | opening       |    15,210 s | 4,742 GiB |

Los dos workers terminaron. Las cifras incluyen arranque, inicialización,
serialización/hash y transitorios. [report.json](report.json) conserva CPU,
checkpoints, PID, límites y hash del binario. Los JSONL originales registran
por separado initialize y serialize-initial-state-to-hash.

```bash
VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go \
  pnpm probe:local-hidden-v2 --directory /ruta/externa/nueva --unsafe-test-only
```

Herramienta separada de capacity:hidden-v2; sus límites pequeños permanecen
intactos. El nuevo probe sólo admite inicialización/hash, sin contribuciones,
verificación, compilación de CS ni PK/VK. Un estado inicial tiene challenge vacío:
su tamaño wire es 192N+233, no 192N+265 de una contribución. No se autentica ni
se presenta este estado como contribución válida de ceremonia.

## Presupuesto aplicado

Un worker cada vez, 8 GiB de espacio virtual como techo kernel, 90 s CPU,
120 s wall, 64 KiB por archivo y cores cero. Se fijan y releen límites soft/hard.
El runtime apunta a GOMEMLIMIT=5GiB y GOMAXPROCS=4; no son cuotas de RSS/CPU.
Antes de cada dominio se exige MemAvailable>=12 GiB, dejando al menos 4 GiB
de margen observado frente al techo virtual, sin reservar memoria del host.
También lo verifica el worker de dominio real antes de asignar arrays.

El supervisor reutilizado mata el grupo en timeout, espera salida y configura
Pdeathsig. Cualquier fallo detiene la secuencia y conserva report incomplete y
checkpoints; no sobrescribe directorios existentes. No se cambió swap ni la
configuración del host. El build es offline y las entradas son dimensiones
fijas de este experimento, sin deserializar archivos nativos de terceros.

Estado original fuera de Git:
`/home/rodrigo/.cache/vendetta-audit/local-domain-probe-20261104-run1/`;
logs bajo `local-domain-probe-20261104-evidence/` en el mismo directorio padre.
No se tocaron setups existentes ni se generaron claves.

## Qué resuelve

La inicialización y su hash en dominios completos caben en esta PC bajo ese
presupuesto. Un servidor de 64 GiB es una opción conservadora, **no un requisito
demostrado para continuar las pruebas**. La siguiente medición local debe aislar
contribución y luego verificación, fijando sus presupuestos de CPU/tiempo/memoria
y evitando retener buffers/objetos innecesarios. Fase 2 se mide después con el CS
real y procesos separados para liberar el heap transitorio de compilación.

No se han medido contribuciones, verificación completa ni fase 2 en estos
dominios. No se extrapolan tiempos de esta operación barata a esas operaciones.
gameDomainInitializationMeasured=true; gameDomainMpcMeasured, contributionsMeasured,
phase2Measured y productionApproved siguen false. Producción continúa bloqueada.

Validación: tres tests nuevos más regresión mpcrehearsal, diez principales y
22 subtests, **32 eventos aprobados**. Incluyen worker/binario real pequeño,
tamaño wire nativo, rechazo de dominios/flags, salida dentro de Git, margen
insuficiente, fallo persistido, parada tras fallo y no sobrescritura; la regresión
cubre timeout y espera de salida del supervisor reutilizado. Go vet, gofmt,
sintaxis Bash, Prettier y git diff --check pasan. [tests.jsonl](tests.jsonl) y
[run.txt](run.txt) conservan evidencia; no se repitieron suites del juego.
