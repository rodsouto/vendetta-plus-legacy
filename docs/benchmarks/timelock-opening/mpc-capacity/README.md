# Capacidad MPC: escalera acotada de fase 1

Medición local del 3 de noviembre de 2026, separada del ensayo de protocolo
entre participantes. Este experimento mide el backend nativo BN254 de gnark
v0.16.4: inicialización, dos contribuciones, serialización, lectura de dos
transcripts frescos y verificación/sellado. Usa un challenge fijo conocido;
no es una ceremonia segura, no compila circuitos del juego y no genera PK/VK.
Los SRS y transcripts nativos sólo viven en memoria; los archivos guardan
checkpoints, hashes y medidas. Los setups existentes no se leen ni modifican.

```bash
export VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go
pnpm capacity:hidden-v2 \
  --directory /home/rodrigo/.cache/vendetta-audit/mi-nueva-medicion \
  --max-log2 14 --unsafe-test-only
```

El directorio padre debe existir; la salida es nueva, absoluta, privada y fuera
de Git. El build usa módulos fijados, GOPROXY=off, -mod=readonly, -trimpath y
-buildvcs=false. El máximo admitido es 2¹⁶; la ejecución documentada llega a
2¹⁴. La CLI rechaza 2²²/2²³ antes de iniciar un worker. Ningún flag habilita
carga completa ni producción.

## Resultado final medido

| Dominio     | Wall total worker | RSS máximo (rusage) |
| ----------- | ----------------: | ------------------: |
| 2¹⁰ (1024)  |           2,242 s |           13,33 MiB |
| 2¹² (4096)  |           8,838 s |           21,75 MiB |
| 2¹⁴ (16384) |          34,968 s |           82,52 MiB |

Tres workers secuenciales terminaron y completaron las seis operaciones previstas.
[capacity-report.json](capacity-report.json) vincula binario, dominios, etapas,
CPU, RSS y hashes de artifacts nativos y logs. Los logs originales se conservan
junto al informe. El RSS de cada checkpoint es el residente actual; MaxRSS es el
máximo acumulado del proceso, incluido su arranque. No es un pico exclusivo de
esa operación. Los tiempos de contribución incluyen serialización/hash; la
verificación incluye sellado y hash de SRS. No se mide I/O de transcripts a disco.

Las mediciones previas de desarrollo no se mezclan con esta ejecución final.
Estos tres tamaños no demuestran capacidad ni latencia de dominios del juego;
no se extrapolan a un SLA ni a un presupuesto suficiente para producción.

## Presupuesto y puntos de parada

- Un worker a la vez, salida confirmada antes del siguiente; grupo terminado en
  timeout y Pdeathsig para muerte al perder el padre.
- 120 s wall y 90 s CPU por worker; 4 GiB de espacio virtual como techo kernel.
- Stop al observar más de 512 MiB RSS, con muestreo cada 25 ms y revisión del
  pico rusage al salir. Es una política muestreada, no un límite RSS duro:
  puede existir sobrepaso entre muestras. Si no se puede observar un proceso
  vivo, se termina; un zombie o PID desaparecido se distingue de ese fallo.
- GOMEMLIMIT=256MiB es objetivo del GC, no techo RSS. GOMAXPROCS=4 tampoco
  constituye una cuota de CPU. No se presupone que MemAvailable sea una reserva
  ni un límite efectivo de todos los contenedores/host.
- Al menos 2 GiB MemAvailable del host antes de cada worker; logs de hasta
  64 KiB por archivo y core dumps deshabilitados. No se escriben datos nativos
  voluminosos. Los checkpoints se sincronizan; no se demuestra corte de energía.
- Cualquier timeout, exceso, fallo nativo, pérdida de observación o historial
  incompleto detiene la escalera. Se conserva informe `incomplete` con razón y
  logs; no se inicia el siguiente tamaño. Nunca equivale a aprobación.

El primer intento por tamaño deja salida exclusiva. Reintentar requiere otra
ruta: no se borra ni sobrescribe evidencia anterior. Las pruebas cubren timeout,
stop por RSS, salida sin checkpoints y parada de la escalera tras fallo.

## Dominios del juego: modelo estructural, sin ejecutar

El informe incluye los dominios **declarados**, no verificados desde un CS del
juego. La fase 1 es independiente del circuito para cada dominio. Con los tipos
reales del backend fijado, un SRS contiene (4N−1) G1 de 64 bytes y (N+1) G2 de
128 bytes. El camino verificador de dos contribuciones mantiene dos objetos
leídos y su predecesor inicializado. Este experimento además retiene dos
transcripts serializados. El modelo excluye runtime, GC, temporales aritméticos,
proofs de actualización y CS; no es una estimación del pico suficiente.

| Circuito declarado | Dominio | Arrays de un SRS | Arrays de verificación (3 objetos) | Dos transcripts retenidos | Subtotal modelado |
| ------------------ | ------: | ---------------: | ---------------------------------: | ------------------------: | ----------------: |
| invalid-point      |     2²² |         ~1,5 GiB |                           ~4,5 GiB |                  ~1,5 GiB |            ~6 GiB |
| opening            |     2²³ |           ~3 GiB |                             ~9 GiB |                    ~3 GiB |           ~12 GiB |

Ambos superan el presupuesto elegido y figuran como
`not-run-exceeds-experiment-budget`. Esto **no demuestra que la máquina sea
incapaz**: no se intentó ejecutar esos dominios. Cambiar a streaming puede
reducir buffers retenidos; no elimina el coste de objetos del backend nativo.
Los tamaños wire exactos (192N+265 por contribución, 192N−56 por SRS sellado)
se contrastaron con el backend en tests y las tres muestras reales.

Fase 2 sigue `not-measured-requires-budgeted-game-cs`: depende de restricciones,
variables privadas y compromisos del CS real. No se sustituye esa evidencia por
fase 2 de un circuito pequeño o por una fórmula sólo de N. En el informe siguen
false `gameCircuitBytesVerified`, `gameDomainMpcMeasured`, `phase2Measured` y
`productionApproved`.

El próximo experimento debe fijar presupuesto/hardware con margen para estos
objetos y temporales, reproducir/verificar el CS real desde fuentes congeladas,
y medir cada fase bajo supervisor. Este informe no aprueba subir límites de
esta herramienta ni ejecutar dominios completos. Las barreras de despliegue y
procedencia del productor siguen vigentes.

## Validación de esta continuación

```bash
GOMEMLIMIT=6GiB GOMAXPROCS=8 "$VENDETTA_GO_BIN" \
  -C apps/web/scripts/experiments/opening-zk test -count=1 ./cmd/mpc-capacity
"$VENDETTA_GO_BIN" -C apps/web/scripts/experiments/opening-zk vet ./cmd/mpc-capacity
```

Cinco tests principales y tres subtests aprobados. Incluyen el binario real con
un dominio 8, modelos wire contrastados, rechazo de dominios grandes, muerte y
espera de workers, salida sin evidencia, persistencia de fallo y no sobrescritura.
[results.json](results.json) registra hashes de fuentes/artefactos y logs. No se
repitieron suites completas del juego: no cambió su lógica, circuitos, contratos,
servicio ni dependencias. Sin claves del juego nuevas, commits o despliegues.
