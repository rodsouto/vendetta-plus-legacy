# Entrada nativa protegida: CS, decoder y MPC pequeño

Validación del 3 de noviembre de 2026. La ruta integrada deriva dimensiones del
CS compilado con digest comprobado, comprueba prefijos antes de entregarlos a
ReadFrom, valida puntos/subgrupos y compara hash original y reserialización
canónica. Después verifica el protocolo MPC pequeño, extrae claves desde objetos
frescos y produce/verifica una prueba Groth16 nueva con input sustituido rechazado.
[API y límites](../../../proposals/hidden-v2-guarded-native-import.md).

La CLI inspect:mpc-hidden-v2 conserva su alcance de formato/hash; la ruta nativa
se utiliza dentro del ensayo existente, con el supervisor existente.

```bash
VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go \
  pnpm rehearse:hidden-v2 --directory /ruta/externa/nueva --unsafe-test-only
```

## Ejecución final

Ocho procesos distintos terminaron: 793 ms sumados de worker wall y 30084 KiB
MaxRSS entre workers. Sólo describen el circuito fijo de cinco restricciones y
dominio 8. Límites: 30 s wall, 20 s CPU, 4 GiB de espacio virtual, 64 KiB por
archivo y cores cero; payload nativo <=1 MiB y wire <=32 KiB. No se amplían límites.

[report.json](report.json) registra guardedNativeDecoding=true, verificación
MPC/firmas/beacons archivados, extracción idéntica, prueba y rechazo de input
sustituido. productionApproved, independentParticipants y beaconAfterClosureProven
siguen false. Ambas identidades las controla un operador y los beacons archivados
eran conocidos antes del cierre; no es una ceremonia independiente.

Estado original: `/home/rodrigo/.cache/vendetta-audit/mpc-guarded-import-20261103-buffered-final/`.
Aquí se copian sólo config, contribuciones públicas, cierres e informes. No se
copian seeds de identidad ni se persistieron claves nuevas del juego. Los intentos
de desarrollo anteriores permanecen separados de esta ejecución final.

## Pruebas

28 pruebas principales contando el corpus fuzz y 88 subpruebas: **116 eventos
aprobados**, sin fallos, entre mpcinspect, mpcrehearsal y sus CLI. Cubren:

- Native decoding de ambas fases con cero/uno/dos compromisos; dimensiones del
  CS real y rechazo de un CS/pin sustituido.
- Prefijos hostiles de dominio, compromisos, PKK, Z, SigmaCKK y challenge
  rechazados antes de entregarse al decoder; lectura byte a byte y consumo incompleto.
- Bombas nativas en otro proceso con 4 GiB AS, 10 s CPU y 20 s wall. Debe salir
  correctamente tras rechazarlas; una muerte por OOM no cuenta como éxito.
- Puntos inválidos, infinity no canónico, truncado/sobrantes y digest incorrecto.
  Un dominio del juego se rechaza sin leer cuando falta presupuesto de puntos.
- MPC completo pequeño con lectura protegida, prueba nueva e input sustituido;
  wrappers, lifecycle y ataques firmados del ensayo existente.

Fuzz comparó Scan y Guard con una ejecución acotada a 10 s y dos workers:
**6247 evaluaciones**, sin fallos. Entradas/políticas <=64 KiB y sin decoder nativo
dentro del fuzzer; no es una medición de throughput ni una garantía de ausencia
de defectos. Logs originales: [tests.jsonl](tests.jsonl), [fuzz.txt](fuzz.txt),
[rehearsal.txt](rehearsal.txt). [results.json](results.json) fija sus hashes.
Go vet, go mod verify, gofmt, Prettier y git diff --check pasan. No se repitieron
suites del juego: no cambian circuitos, reglas, contratos, servicio ni política
de procedencia del productor.

## Pendientes

El payload de puntos es un subtotal, no un techo RSS: existen refs, proofs,
runtime y temporales adicionales. La API exige presupuestos; el llamador debe
aplicar además límites kernel/tiempo. En el ensayo ya se hace.
El origen autorizado del pin sigue perteneciendo a la política del llamador.

Faltan hardware reservado y transcripts reales para medir/verificar el juego,
ceremonia independiente con cierre autenticado y beacon futuro, importación y
aprobación de artefactos finales y auditoría. El productor rechaza setups
declarados seguros y no hay despliegues reales.
