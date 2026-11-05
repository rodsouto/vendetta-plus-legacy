# Inspección nativa en streaming

Validación del 3 de noviembre de 2026. La nueva CLI comprueba formato y SHA-256
de contribuciones nativas BN254 de ambas fases con memoria acotada. No invoca
ReadFrom, valida puntos, ejecuta MPC ni habilita importación/producción.
[Comando, schema y límites](../../../proposals/hidden-v2-native-inspection.md).

## Resultado ejecutado

El binario real inspeccionó una contribución de fase 1 archivada del ensayo
pequeño: dominio 8, 1801 bytes. [inspection.json](inspection.json) fija sus hashes
y conserva todas las aprobaciones/validaciones criptográficas en false.
[input-receipt.json](input-receipt.json) vincula el archivo público original y
los bytes extraídos de su envelope; no se volvieron a verificar firmas en este
smoke. [toy-shape.json](toy-shape.json) contiene su política dimensional.
Un presupuesto de un byte produjo salida no cero, sin JSON de éxito en stdout;
ver [budget-rejection.json](budget-rejection.json).

Binario construido offline con SDK Go 1.27.3, -mod=readonly, -trimpath y
-buildvcs=false; [build-receipt.json](build-receipt.json) conserva sus hashes.
Estado fuera de Git: `/home/rodrigo/.cache/vendetta-audit/mpc-inspect-20261103/`.
No se persistieron claves nuevas ni se leyeron los setups del juego.

## Shapes del juego, sin leer sus transcripts

Los cuatro JSON se derivan de las dimensiones del informe de reproducción del
CS con SHA-256 `a45e4f7a982c0ed044e0676ef089585cc8f48529c6ac0f1a3c3fab66f239297c`.
El vínculo con ese informe está registrado en [results.json](results.json);
el inspector sólo comprueba el pin de shape que recibe y declara el hash de CS.
No autentica su procedencia. Estos archivos no son políticas aprobadas.

| Circuito      | Fase | Bytes wire calculados |
| ------------- | ---: | --------------------: |
| invalid-point |    1 |             805306633 |
| invalid-point |    2 |             312847279 |
| opening       |    1 |            1610613001 |
| opening       |    2 |             489047343 |

El test correspondiente deriva esas shapes del informe fijado, comprueba sus
límites y exige rechazo antes de leer con el presupuesto por defecto de 64 KiB.
No se escanearon archivos del juego ni se asignaron sus arrays nativos. Los
tamaños no son mediciones de recursos ni permisos para ejecutar los dominios.

## Pruebas

12 tests principales y 49 subtests nuevos: **61 eventos aprobados** entre
mpcinspect y cmd/mpc-inspect. Cubren serializaciones nativas reales pequeñas de
ambas fases con cero/uno/dos compromisos, todos los truncados, bytes sobrantes,
bombas de dominio/cantidades/vectores, challenge, representación sin comprimir,
overflow de shape, JSON estricto, pins, presupuesto previo a lectura, archivos
especiales y wrappers reales por Bash/pnpm con rutas relativas.

Un test verifica que un punto comprimido inválido para ReadFrom puede superar
esta revisión de formato y que pointsValidated sigue false. Otro consume una
entrada sintética de 3145993 bytes con asignaciones adicionales <=512 KiB.
Esto no mide RSS total ni valida criptográficamente esa entrada sintética.

Regresión mpcrehearsal: siete tests principales y 22 subtests, 29 eventos.
**90 eventos aprobados en total**, sin fallos. Logs originales en
[tests.jsonl](tests.jsonl). Go vet, gofmt, sintaxis Bash, go mod verify,
Prettier y git diff --check aprobados. No se repitieron suites del juego:
no cambiaron circuitos, reglas, contratos, servicio ni política del productor.

Pendiente: derivación de dimensiones desde CS autenticado para importación,
decodificación nativa canónica/puntos bajo supervisor y vínculo a los mismos
bytes autenticados, verificación MPC, cierres/beacons y registro de aprobación.
Las mediciones MPC completas siguen requiriendo hardware reservado. Sin commits
ni despliegues reales; producción permanece bloqueada.
