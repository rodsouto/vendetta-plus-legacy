# Compilación reproducible y presupuesto del CS real

Continuación del 3 de noviembre de 2026. La compilación acotada ya se ejecutó
sobre los dos circuitos del juego, dos veces cada uno, con digests idénticos a
los históricos. [Resultados y evidencia](../benchmarks/timelock-opening/cs-reproduction/README.md).
No aprueba una ceremonia ni cambia las barreras de producción.

Actualización del 4 de noviembre: [la inicialización de ambos dominios reales](../benchmarks/timelock-opening/local-domain-probe/README.md)
ya se midió en esta PC, con 2,414/4,742 GiB MaxRSS y techo virtual de 8 GiB.
El host candidato de 64 GiB descrito abajo es una opción conservadora, no un
requisito demostrado. La continuación preferida es medir operaciones aisladas
localmente con presupuesto propio; contribuciones/verificación/fase 2 siguen abiertas.

## Ruta de compilación sin setup

El binario Go principal admite `--compile-cs-v2 opening|invalid-point salida.json`.
Usa exactamente `producerShape`, BN254 y el builder R1CS del productor. Serializa
el CS directamente a SHA-256, sin retener otro buffer ni guardar circuit.bin.
Informa bytes, restricciones, dominio, variables públicas/secretas/internas y
metadatos nativos de compromisos. No genera ni lee PK/VK, transcripts o setups.

Los compromisos se resumen con cantidades de variables e índice del compromiso;
no se vuelcan listas potencialmente voluminosas de índices de wires.
La salida se crea exclusivamente antes de compilar. Un fallo puede dejar un
archivo vacío: sólo un JSON completo junto con salida cero del worker es evidencia
válida. No sobrescribe archivos existentes. Este comando no impone límites:
ejecutarlo en dominios del juego mediante el supervisor descrito abajo.
Los metadatos de compromisos no constituyen por sí solos una medición de fase 2.

Para una reproducción, congelar primero una nueva entrega que incluya este
comando. Verificar su digest externo con `audit:hidden-v2 verify`; compilar desde
su árbol extraído en una ruta nueva, con SDK fijado, `GOPROXY=off`,
`GOFLAGS=-mod=readonly`, `-trimpath` y `-buildvcs=false`. Registrar hashes de bundle,
SDK, binario y go.mod/go.sum; la caché de módulos debe estar preparada previamente.
El bundle de cierre anterior sigue siendo evidencia histórica y no contiene esta CLI.

Ejecutar cada circuito dos veces en procesos nuevos, secuencialmente. Exigir
igualdad de digest, bytes y metadatos entre repeticiones. Comparar con los valores
declarados por los manifiestos locales, sin cargar claves:

| Circuito      | Restricciones declaradas | SHA-256 declarado de circuit.bin                                 |
| ------------- | -----------------------: | ---------------------------------------------------------------- |
| invalid-point |                  3760005 | 89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898 |
| opening       |                  5139537 | 06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f |

Cualquier diferencia detiene el procedimiento: investigar fuentes/backend y
serialización; no regenerar setups para hacer coincidir el resultado. Un hash
coincidente verifica reproducción de bytes, no seguridad del setup anterior.

## Presupuesto candidato y criterio de ejecución

La muestra de esta sesión observa 18,95 GiB RAM total, aproximadamente 15,04 GiB
MemAvailable, 16 CPU lógicas y 930 GiB libres. No hay una reserva de esos recursos
ni se ha demostrado una cuota de memoria eficaz mediante `/proc/self/cgroup`.

La sesión no tiene permisos de escritura sobre cgroup v2. Para la primera etapa
se implementó una alternativa más restrictiva: sólo compilación, un proceso Go
cada vez, 10 minutos wall, RLIMIT_CPU=2400 segundos por proceso,
**RLIMIT_AS=10 GiB de espacio virtual** y RLIMIT_FSIZE=1 MiB por archivo.
Los límites soft/hard se fijan y releen antes de exec; core dumps deshabilitados.
El techo virtual acota también memoria residente del proceso, pero puede hacer
fallar reservas virtuales del runtime antes de alcanzar 10 GiB RSS. No es una
cuota cgroup para todos los descendientes, no impone una cuota de cuatro CPU y
no configura swap. La ruta fijada de compilación no crea procesos hijos.
GOMEMLIMIT=6GiB y GOMAXPROCS=4 son objetivos del runtime.

`pnpm capacity:cs-hidden-v2 --binary /ruta/binario --binary-sha256 <pin>
--source-bundle-sha256 <pin> --directory /ruta/externa/nueva` exige al menos
14 GiB MemAvailable antes de cada worker (10 GiB más 4 GiB de margen observado,
sin reserva del host). El pin de fuentes se registra como declaración del
operador que construyó el binario: el supervisor no autentica esa relación.
El binario se comprueba antes de cada ejecución y al terminar. Cualquier fallo
detiene las siguientes compilaciones y persiste un informe incomplete.

Cada worker configura muerte al perder el padre; el supervisor mata el grupo
ante timeout y antes de abandonar su seguimiento, espera salida y registra
wall/CPU/MaxRSS con wait4. Los límites por proceso no convierten esta herramienta
en un sandbox para binarios no confiables. Sólo debe ejecutar el compilador
construido desde las fuentes verificadas. El informe marca bytes del juego
verificados únicamente tras cuatro salidas completas, pins históricos correctos
y dos resultados idénticos por circuito. MPC, fase 2 y aprobación siguen false.

Para medir MPC completo se propone un host dedicado de **64 GiB RAM, 16 CPU y
200 GiB libres**, con presupuesto inicial por worker de 48 GiB RAM, 8 CPU,
2 horas wall/16 horas CPU y 100 GiB de almacenamiento. Es una selección de
hardware para el experimento, no un requisito medido ni una garantía de éxito.
La fase 1 opening ya modela ~12 GiB sin runtime/GC/temporales; el host actual
no ofrece margen suficiente para adoptar este presupuesto. No se amplía la
herramienta pequeña para ejecutar allí dominios completos.

Antes de fase 2, calcular dimensiones desde el CS reproducido y revisar el camino
de asignaciones del backend, incluyendo compromisos. Ejecutar inicialización,
contribución y verificación en workers separados con checkpoints y presupuestos
revisados por operación. Timeout, OOM, cuota, digest inesperado o pérdida de
observación conservan informe incomplete y detienen las operaciones siguientes.
No se extrapolan tiempos de la escalera pequeña a estos presupuestos.

Las cuatro compilaciones ya terminaron dentro de los límites y desde fuentes
congeladas verificadas. También se verificaron de nuevo los 698 archivos extraídos
y dos builds idénticos del binario. El comando `model:phase2-hidden-v2` consume el
informe completo fijado por digest y conserva explícitamente su clasificación de
inventario, sin afirmar un pico simultáneo ni medir fase 2. El modelo se contrasta
con arrays nativos de dos circuitos pequeños, con y sin compromiso.

Pendiente: reservar hardware y preparar el supervisor para medir ambas fases
reales, con presupuestos por operación revisados usando estas dimensiones.
No sobrescribir intentos ni relajar límites automáticamente si una medición falla.
Ninguna de
estas tareas demuestra participantes independientes, cierre público autenticado,
beacon futuro, aprobación de artefactos o auditoría.
