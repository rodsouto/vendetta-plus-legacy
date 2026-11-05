# Reproducción acotada del CS del juego

Medición del 3 de noviembre de 2026. Se compilaron ambos circuitos del juego dos
veces desde fuentes congeladas, sin generar claves, cargar setups, probar
statements ni ejecutar MPC. Las dos repeticiones de cada circuito coinciden con
los digests históricos declarados de circuit.bin.

| Circuito      | Repetición | Wall del worker (s) | MaxRSS (GiB) |
| ------------- | ---------: | ------------------: | -----------: |
| invalid-point |          1 |              50,903 |        4,125 |
| invalid-point |          2 |              35,398 |        4,147 |
| opening       |          1 |              50,255 |        5,336 |
| opening       |          2 |              45,141 |        5,570 |

Son cuatro procesos distintos terminados secuencialmente. MaxRSS incluye el
arranque y todos los transitorios del worker; wall incluye compilación y
serialización/hash. No se atribuyen las diferencias entre repeticiones a una
causa medida. No son tiempos de setup, MPC o proving.

## Fuentes y ejecución

Bundle de entrada, creado antes de las compilaciones:
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-cs-compile-20261103-source.tar.gz`.
SHA-256: `db07990896e9ba8d39502fdb40046708f948a403454eeadbbdb3443c04570d02`.
Contiene 698 archivos. Se verificó antes de extraer con filtro data a una ruta
nueva. El build offline desde ese árbol usó Go 1.27.3, -mod=readonly, -trimpath y
-buildvcs=false. [build-receipt.json](build-receipt.json) fija SDK/binario/bundle;
[receipt.json](receipt.json) identifica la entrega de entrada, no aprobación.
Dos builds del binario resultaron idénticos y se comprobaron de nuevo los hashes
de las 698 fuentes extraídas tras su ejecución; ver
[post-build-verification.json](post-build-verification.json).
Las pruebas adicionales y el modelo de fase 2 se añadieron después de congelar
esa entrega; su nueva entrega de cierre se identifica en el handoff.

Comando del supervisor, usando el script extraído del mismo bundle:

```bash
python3 /ruta/extraida/source/scripts/hidden-v2-compile-capacity.py \
  --binary /ruta/compile-only \
  --binary-sha256 b8ed4d74217573a21fc711f304a4977ce6dfc61f1c145398038dc47136996bc1 \
  --source-bundle-sha256 db07990896e9ba8d39502fdb40046708f948a403454eeadbbdb3443c04570d02 \
  --directory /ruta/externa/nueva
```

El [informe original](compile-report.json) conserva tiempos, CPU, RSS, PID, salida,
dimensiones y hashes. La relación bundle/binario procede del build registrado
por el operador; no es una atestación independiente. El supervisor aplica
RLIMIT_AS=10 GiB, RLIMIT_CPU=2400 s por proceso, RLIMIT_FSIZE=1 MiB y wall=600 s.
No había delegación cgroup disponible. No hay cuota de CPU ni límite de swap;
GOMAXPROCS=4 y GOMEMLIMIT=6GiB son objetivos de Go. Se comprueba MemAvailable

> =14 GiB antes de cada worker, sin reservar memoria del host.

El estado original permanece fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/cs-compile-20261103-run1/`.
Los logs originales *.log se copian aquí como *.stdout.txt con bytes idénticos;
el informe conserva sus nombres originales. Cada JSON individual se copia sin
reformatearlo para conservar su hash. Ningún circuito serializado ni clave se
persistió durante estas compilaciones.

## Dimensiones y fase 2 pendiente

| Circuito      | Restricciones | Internas | Secretas | Públicas sin constante | Compromisos | Privadas comprometidas |
| ------------- | ------------: | -------: | -------: | ---------------------: | ----------: | ---------------------: |
| invalid-point |       3760005 |  5582074 |       89 |                      2 |           1 |                2243213 |
| opening       |       5139537 |  6893945 |      166 |                     55 |           1 |                2695403 |

Los JSON individuales registran 225400632 bytes serializados para invalid-point
y 341035999 para opening. SHA-256 se calculó por streaming sobre WriteTo, sin
retener otro buffer. No son tamaños de heap decodificado.

[phase2-model.json](phase2-model.json) usa estas dimensiones para inventariar
arrays de puntos del backend fijado. La suma de los payloads listados es
5,795 GiB para invalid-point y 9,448 GiB para opening. **No es un pico simultáneo
de RAM ni un presupuesto suficiente**: suma categorías de asignación sin probar
sus tiempos de vida y excluye CS decodificado, GC/allocator, dominios/twiddles FFT,
temporales, transcripts, verificación y extracción de claves. Se mantiene el
host dedicado de 64 GiB como candidato para futuros experimentos, sin afirmar
capacidad demostrada ni ejecutar los dominios completos aquí.

Con N=dominio, W=internas+secretas+públicas+constante, C=privadas comprometidas y
K=número de compromisos, el backend reserva PKK=internas+secretas−C−K y
VKK=públicas+constante+K. Se cuentan el SRS común, tres arrays G1 y uno G2 de
Lagrange, cinco arrays G1 y uno G2 de W para evaluaciones/temporales, Z (capacidad
N aunque longitud N−1), PKK, bases de compromiso y públicas. Los tamaños de
puntos son G1=64/G2=128 bytes en este backend.

`TestCompileCSPhase2AllocationModel` contrasta el modelo Python con longitudes y
capacidades nativas reales de fase 2 para dos circuitos pequeños, con y sin
compromiso. Usa únicamente SRS efímero pequeño en memoria y beacon fijo de test;
no ejecuta la fase 2 del juego. Fuentes primarias locales: gnark v0.16.4,
backend/groth16/bn254/mpcsetup/{phase1,phase2,lagrange}.go.

## Validación y límites

`go test -json -count=1 -run '^Test(Producer|SetupMPC|CompileCS)' .`:
11 tests principales y 23 subtests, 34 eventos aprobados. Incluye regresiones
nativas del productor y MPC pequeño. Supervisor Python: nueve tests, incluidos
tres subcasos de límites kernel; cubre timeout/reap, muerte al perder el padre,
pins, margen de host, fallo persistido, diferencias entre repeticiones y
rechazo de sobrescritura. Logs y hashes en [results.json](results.json).
Go vet/mod verify, gofmt, compilación Python, Prettier y git diff --check pasan.
No se repitieron suites web/rules/Solidity porque no cambia su implementación.

`gameCircuitBytesVerified` es true para esta reproducción. `gameDomainMpcMeasured`,
`phase2Measured` y `productionApproved` siguen false. Pendientes: hardware
reservado y supervisión para medir ambas fases, autenticación de cierre/beacon
futuro, participantes independientes, importación/aprobación de artifacts y
auditoría. Sin cambios de setups existentes, commits ni despliegues reales.
