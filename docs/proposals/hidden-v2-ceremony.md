# Hidden v2: CLI de ceremonia y registro de revisión

Propuesta ejecutable parcial del 31 de octubre de 2026. La CLI offline valida
planes de diseño y firmas de revisión. La ejecución de contribuciones de producción, los
desafíos finales y la aprobación/importación de setups para producción todavía
no están implementados. El servicio continúa rechazando `unsafeLocalSetup: false`.

## Comandos implementados

```bash
# SDK Go compatible con el módulo; la variable es opcional si go está en PATH.
export VENDETTA_GO_BIN=/tmp/vendetta-opening-tools/go/bin/go
pnpm ceremony:hidden-v2 inspect-plan \
  --plan /ruta/plan.json --plan-sha256 <digest-revisado-por-canal-independiente>
pnpm ceremony:hidden-v2 verify-review \
  --plan /ruta/plan.json --plan-sha256 <digest-del-plan> \
  --trust /ruta/review-trust.json --trust-sha256 <digest-confiable-actual> \
  --review /ruta/design-review.json
```

Las rutas relativas se interpretan desde el directorio del llamador, tanto con
`--plan archivo` como con `--plan=archivo`. Ambos comandos sólo leen archivos;
no generan claves, no acceden a la red ni ejecutan setup/proving. La compilación
mediante `go run` puede resolver dependencias si no están en la caché; preparar
SDK y módulos antes de usar una máquina aislada. No hay comando de firma ni
generación de identidades: el firmante debe verificar los bytes y usar su
procedimiento independiente de custodia.

Inspect devuelve `design-plan-validated`. Verify devuelve
`design-review-signatures-verified` si la revisión cumple la política. Ambos
devuelven siempre `productionApproved: false`, `mpcTranscriptVerified: false` y `artifactBytesVerified: false`. Un error termina con código distinto de cero
y sin registro de éxito. El reloj de verify es el reloj UTC del sistema; la CLI
no ofrece un parámetro para simular otra fecha.

Cada documento está limitado a 64 KiB, con profundidad JSON máxima de 16. Todos
los campos definidos son obligatorios y sensibles a mayúsculas. Se rechazan
campos adicionales, duplicados, null, tipos incorrectos y datos finales extra.
La lectura es acotada y rechaza FIFOs, directorios y symlinks finales. Los hashes
identifican los bytes exactos, incluidos espacios y saltos de línea; no hay una
canonicalización JSON implícita que el firmante deba reproducir.

## Plan de diseño, versión 1

| Campo                | Contrato                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `schema`             | `vendetta-hidden-v2-ceremony-plan-1`                                                                         |
| `ceremonyId`         | Identificador ASCII `[a-z][a-z0-9_-]{0,63}`                                                                  |
| `sourceBundleSha256` | SHA-256 del paquete de fuentes revisable, 64 hex minúsculas                                                  |
| `backend`            | Exactamente `curve: BN254`, `gnarkVersion: v0.16.4`, `gnarkCommit: e974abb44722dd201a7f1949baeabca0fef5866e` |
| `phase1Policy`       | `separate-per-circuit`, candidata conservadora inicial; no se ejecuta aquí                                   |
| `beaconPolicy`       | `authenticate-after-phase-close`; exige un diseño de autenticación/cierre posterior antes de ejecutar        |
| `participants`       | Lista de 2–32 identificadores distintos con el mismo formato ASCII que ceremonyId                            |
| `circuits`           | Exactamente dos objetos, uno `opening` y otro `invalid-point`                                                |

Cada circuito declara `kind`, `circuitSha256`, `constraints`, `publicInputs` y
`domainSize`. Los hashes de CS son distintos; los inputs públicos son 55/2.
Constraints es entero entre 2 y 2²³; domainSize es la menor potencia de dos que
lo cubra. El límite de 2²³ es el techo admitido por esta versión del plan, no
una garantía de recursos ni autorización para ejecutarlo.

Los valores de restricciones y hashes son declaraciones a revisar: inspect no
lee el CS ni el paquete de fuentes. La verificación reproducible de compilación
debe comprobarlos antes de ejecutar. Los identificadores tampoco demuestran
identidad o independencia de participantes. El plan de ejecución deberá añadir
sus claves públicas autenticadas, calendarios de cierre/beacon y presupuestos
de recursos concretos; esa extensión requerirá una versión de schema revisada.

Un cambio en fuentes, CS, participantes o política exige nuevos bytes/digest y
una revisión nueva. El paquete de fuentes debe existir antes del plan que lo
referencia: no introducir el digest de un paquete dentro de un archivo incluido
en ese mismo paquete. Entregar el plan y sus revisiones como artefactos externos
que referencian el paquete ya congelado.

## Registro de confianza de revisores

`review-trust.json` contiene exactamente:

```json
{
  "schema": "vendetta-hidden-v2-review-trust-1",
  "expiresAt": "2026-11-03T00:00:00Z",
  "threshold": 2,
  "reviewers": [
    { "id": "reviewer-a", "publicKey": "<clave-ed25519-publica-64-hex>" },
    { "id": "reviewer-b", "publicKey": "<otra-clave-ed25519-publica-64-hex>" }
  ]
}
```

Los placeholders no son un registro válido. Se exigen 2–32 revisores, claves e
identificadores distintos, threshold entre 2 y el número de revisores y un
expiresAt futuro en UTC, sin fracciones ni offsets alternativos. Las claves son
Ed25519 públicas de 32 bytes en hex minúsculas. Una misma clave bajo dos nombres
no puede alcanzar el quórum.

El digest confiable llega de un canal independiente; nunca se toma del propio
registro o envelope. La CLI no decide quién está autorizado para instalar ese
pin. La organización debe verificar identidades, independencia y custodia antes
de fijarlo. Retirar una clave significa publicar un registro nuevo sin ella y
distribuir su pin. Los consumidores offline deben recibir el pin vigente: no hay
consulta online, ni detección automática de rollback si se les proporciona un
pin antiguo todavía no caducado. Un compromiso de una clave requiere renovar
política/revisiones según el procedimiento del operador; la CLI no revoca por sí
sola firmas ya archivadas.

## Payload y firmas de revisión

El payload JSON firmado contiene exactamente:

```json
{
  "schema": "vendetta-hidden-v2-design-review-1",
  "ceremonyId": "identificador-del-plan",
  "planSha256": "<digest-del-plan>",
  "trustSha256": "<digest-del-registro-vigente>",
  "purpose": "design-review-only",
  "reviewedAt": "2026-10-31T00:00:00Z",
  "expiresAt": "2026-11-02T00:00:00Z"
}
```

El envelope tiene dos campos: `payload`, base64 estándar canónico de los bytes
exactos de ese JSON, y `signatures`, una lista de objetos con `reviewerId` y
`signature` (firma Ed25519 de 64 bytes, 128 hex minúsculas). Cada firma cubre:

```text
UTF8("VENDETTA_HIDDEN_V2_DESIGN_REVIEW_V1\n") || payloadBytes
```

En ese texto `\n` representa un único byte LF. Las firmas se verifican sobre
los bytes originales, sin volver a serializar el payload. Todas las firmas
presentadas deben ser válidas y de revisores distintos del registro; no basta
con encontrar un subconjunto válido si se adjuntaron otras firmas inválidas.
Review/trust deben corresponder a los pins explícitos y al ceremonyId del plan.
ReviewedAt no puede ser futuro; expiresAt debe ser posterior a reviewedAt y al
reloj actual y no superar el vencimiento del registro. Cambiar threshold o las
claves también cambia trustSha256 e invalida la revisión anterior para ese pin.

Estas firmas acreditan una revisión de diseño según el registro suministrado.
No son firmas de participantes de MPC ni una aprobación de claves finales.
La autoridad, custodia y revisión independiente reales siguen pendientes;
los tests crean sus propias identidades efímeras sólo en memoria.

## Secuencia de producción propuesta, aún pendiente

1. Compilar cada circuito desde el paquete aprobado, registrar orden de inputs
   y digest de CS. Escribir exclusivamente en un directorio nuevo; nunca modificar
   los setups locales. Confirmar medidas de recursos antes de ejecutar dominios reales.
2. Para cada circuito, inicializar fase 1 y ejecutar las contribuciones previstas.
   Cada participante verifica la cadena previa, dominio y plan, añade su entropía
   y publica bytes nuevos con digest anterior/actual y una atribución autenticada.
   La identidad criptográfica y el digest del cierre deben fijarse externamente.
3. Cerrar la lista de fase 1 antes de seleccionar/liberarse el desafío final.
   Archivar prueba de publicación del cierre y evidencia autenticada del beacon.
   Releer y verificar cada contribución con la API nativa y sellar desde bytes
   frescos. Rechazar listas vacías, omisiones, reordenación o truncado del historial
   respecto al cierre aprobado. Un transcript válido no demuestra ese cierre.
4. Derivar fase 2 de CS y SRS verificados, repetir contribuciones/cierre/beacon y
   volver a verificar desde las entradas originales antes de extraer PK/VK.
   Verificar consumo completo de los archivos y dimensiones antes de asignar
   memoria: acotar sólo los bytes de entrada no limita las asignaciones que el
   deserializador nativo puede efectuar a partir de longitudes declaradas.
5. Derivar Verifier.sol, compilar con opciones fijadas y registrar runtime,
   wrappers y direcciones por red. Comparar artefactos regenerados y ejecutar
   ambos circuitos con pruebas nuevas, rechazo de pruebas cruzadas y replay EVM/H3.
6. Crear un informe de verificación que vincule plan, transcript completo, cierres,
   evidencias beacon, artefactos finales y resultados. Resolver auditoría y retests.
   Una aprobación de producción posterior usará otro schema/dominio, vinculado
   al informe y a esos artefactos; nunca reutilizar `design-review-only` como permiso
   de importación. Su verificador y su integración en despliegue/productor están pendientes.

La [inspección nativa en streaming](hidden-v2-native-inspection.md) posterior
implementa únicamente la revisión de gramática/longitudes/hash antes de una
eventual decodificación. Admite dimensiones del juego con presupuesto explícito
de lectura, pero no invoca ReadFrom, verifica puntos/MPC ni autentica la relación
shape–CS. Tampoco se han leído transcripts reales de esos dominios.

La [lectura nativa protegida](hidden-v2-guarded-native-import.md) posterior liga
shapes al CS compilado y controla los prefijos sobre los mismos bytes que recibe
ReadFrom, con chequeo de puntos y reserialización canónica. Se utiliza dentro
del ensayo pequeño bajo supervisor; no se ha ejecutado con transcripts del juego
ni acredita aprobación de producción.

Las contribuciones, verificaciones y sellados deberán tener límites de CPU/RAM,
tiempo y almacenamiento definidos por el plan de ejecución y un supervisor externo.
Un fallo operativo no produce artefactos aprobados y deja intactos los resultados
previos. Las escrituras finales deberán ser exclusivas y recuperables, con evidencia
de durabilidad. No se ha implementado ni probado todavía ese lifecycle de ceremonia.

## Validación y siguiente paso históricos (31 de octubre de 2026)

Los tests Go en `ceremony/` y `cmd/ceremony/` cubren validación estricta, pins,
quórum, firmas, dominios de firma, caducidad, sustitución del plan/registro,
claves repetidas o retiradas, lectura acotada y comandos reales por shell. Son
tests de política y autenticación de revisión; la prueba MPC pequeña se conserva
por separado en [setup-mpc](../benchmarks/timelock-opening/setup-mpc/README.md).
Esta continuación pasa seis tests principales y 54 subtests (60 eventos de test),
además de go vet, gofmt, sintaxis Bash, Prettier y git diff --check. Evidencia y
hashes de fuentes en [results.json](../benchmarks/timelock-opening/ceremony-design/results.json).
El detector de carreras no se ejecutó: CGO está deshabilitado y no hay compilador
C en este host. No se repitieron suites completas de juego al no cambiar esas fuentes.

```bash
"$VENDETTA_GO_BIN" -C apps/web/scripts/experiments/opening-zk test \
  -count=1 ./ceremony ./cmd/ceremony
"$VENDETTA_GO_BIN" -C apps/web/scripts/experiments/opening-zk vet \
  ./ceremony ./cmd/ceremony
```

El siguiente paso de esa entrega era el formato de ejecución y la lectura nativa
acotada de transcripts, con ensayos pequeños entre procesos; ver la continuación
del 3 de noviembre para su implementación aislada.
La elección de autoridades reales y el cierre independiente del diseño todavía
son necesarios antes de confiar en los pins fuera de tests. Ver
[preparación de producción](hidden-v2-production-readiness.md).

## Propuesta de ejecución offline, versión 1

`inspect-execution --plan <archivo> --plan-sha256 <pin> --execution <archivo>
--execution-sha256 <pin>` valida dos documentos fijados externamente. El wrapper
resuelve también rutas relativas de `--execution`. No exige una revisión firmada:
el comando inspecciona una propuesta, no autoriza su ejecución. Las firmas de
`design-review-only` existentes cubren sólo el plan de diseño; no cubren esta
extensión. Aprobar una ejecución necesitará un dominio y política independientes.

El objeto de ejecución contiene exactamente:

- `schema`: `vendetta-hidden-v2-execution-plan-1`.
- `planSha256`: digest exacto del plan de diseño suministrado.
- `participants`: objetos `id`/`publicKey` en el mismo orden y con todos los IDs
  del diseño. Claves Ed25519 públicas de 32 bytes en hex minúsculas, distintas y
  no nulas. Su formato no acredita posesión, identidad ni independencia.
- `resources`: `memoryBytes` (1 MiB–1 TiB), `transcriptBytes` (1 byte–1 TiB),
  `storageBytes` (al menos transcriptBytes, máximo 16 TiB), `wallSeconds`
  (1–604800) y `cpuCount` (1–1024), todos enteros obligatorios. Son techos del
  formato, no medidas de suficiencia ni límites aplicados por este comando.
- `phases`: exactamente una fase 1 y una fase 2 para cada circuito. Cada objeto
  contiene `circuit` (`opening`/`invalid-point`), `phase` (1/2), `opensAt`,
  `closesAt`, `beaconNotBefore`, `beaconDeadline`, `beaconPolicySha256` y
  `closurePolicySha256`. Fechas UTC estrictas como en el plan de revisión;
  apertura < cierre < disponibilidad beacon < deadline. La fase 2 abre después
  del deadline de fase 1 de su circuito. El orden del array no determina ejecución.

Los dos últimos pins identifican documentos externos propuestos para autenticar
el beacon y publicar el cierre. Sus bytes no se leen ni se validan aquí. No se
infiere de fechas declaradas que un cierre se publicó o que un beacon era
impredecible. Los calendarios históricos se pueden inspeccionar sin depender
del reloj actual. Rigen los mismos límites JSON/archivos de 64 KiB y profundidad
16 que en los comandos anteriores.

Resultado: `execution-proposal-validated`, pins de diseño/ejecución y las tres
banderas de aprobación/evidencia anteriores en false. También permanecen en
false `participantIdentitiesAuthenticated`, `beaconEvidenceAuthenticated` y
`resourceLimitsEnforced`. No se ejecuta MPC, no se escriben artefactos y no se
cambia la política del productor. Quedan pendientes la lectura nativa segura,
los ensayos entre procesos, autenticación de contribuciones/cierre/beacon y
supervisión externa antes de ejecutar dominios reales.

## Ensayo ejecutable pequeño entre procesos (3 de noviembre de 2026)

El nuevo comando independiente `pnpm rehearse:hidden-v2 --directory
/ruta/externa/nueva --unsafe-test-only` construye offline `cmd/mpc-rehearsal`
con módulos fijados (`GOPROXY=off`, `-mod=readonly`, `-trimpath`, sin metadatos
ambientales de Git). Necesita SDK/módulos previamente preparados; usa
`VENDETTA_GO_BIN` como la CLI anterior. No ejecuta el plan de diseño ni importa
setups de producción: sólo admite una relación fija `X⁴ = Y`, con compromiso
explícito, cinco restricciones y dominio 8. No admite CS o dominios arbitrarios.

[Procedimiento, límites y evidencia](../benchmarks/timelock-opening/mpc-rehearsal/README.md).
Inicializa dos identidades de test y ejecuta ocho procesos secuenciales:
inicialización, dos contribuciones y cierre por fase, y verificación final.
Cada contribución autentica bytes exactos de un payload base64 con dominio
Ed25519 exclusivo, run/config/CS, fase, índice, identidad, cierre de fase 1,
artifact anterior y hashes nativos anterior/nuevo. Se verifican las
contribuciones previas antes de extender la cadena. Los cierres identifican
exactamente dos artifacts en orden; sus pins se pasan explícitamente a los
procesos posteriores. Este coordinador único no es un canal independiente de
confianza ni acredita publicación de los cierres.

La lectura de archivos es regular, acotada y sin symlinks finales. Un cursor sin
asignaciones proporcionales a longitudes declaradas recorre el formato nativo
comprimido fijado, comprueba N/todos los tamaños de vectores/compromisos contra
el circuito pequeño confiable, exige challenge de 32 bytes y consumo completo,
antes de llamar a `ReadFrom`. Después el decoder nativo valida puntos/subgrupos
y se exige reserialización idéntica. Este lector cubre únicamente ese formato y
circuito de ensayo, no un importador general de transcripts del juego.

Se autentican las firmas drand quicknet archivadas de rondas 1000 y 1001; cadena,
ronda y firma quedan fijadas por config y derivan el challenge de sellado. Son
firmas auténticas, ya conocidas antes del ensayo: `beaconAfterClosureProven` e
`independentParticipants` permanecen false. La extracción reconstruye desde
bytes frescos, compara PK/VK, exporta Solidity y genera/verifica Groth16 con
rechazo de otro input público. No hay consumo EVM en este ensayo.

Las identidades efímeras se guardan en un directorio nuevo, privado y fuera de
Git; pertenecen a un solo operador y no son claves del juego. Los archivos son
exclusivos, modo 0600, con fsync de archivo/directorio; una ejecución incompleta
se conserva y no se sobrescribe al reintentar. No se prueba durabilidad ante
corte de energía. El supervisor aplica 30 s de wall por worker, espera su salida,
mata el grupo en timeout y configura muerte al perder el padre. Cada worker
aplica límites Linux de 20 s CPU, 4 GiB de espacio virtual, 64 KiB por archivo y
core dumps deshabilitados. `GOMEMLIMIT=256MiB` es un objetivo de GC, no un límite
RSS; GOMAXPROCS=2 tampoco es una cuota del scheduler. Se miden CPU, wall y RSS
máximo por proceso. No es un sandbox entre participantes ni supervisor de producción.

Las claves Ed25519 de revisores y participantes ahora comparten un parser que
rechaza puntos inválidos, codificaciones no canónicas y orden pequeño; se prueba
el rechazo de una firma forjada con clave identidad que Go sí verifica. El
wrapper offline conserva el directorio original de pnpm con INIT_CWD y admite
flags de ruta con uno/dos guiones y `=`; hay pruebas de Bash y de pnpm real.

No se añadió autorización histórica mediante `--at`: aceptar una fecha elegida
por el llamador no acredita publicación entonces. La CLI vigente mantiene su
rechazo de revisiones caducadas. Un futuro modo de auditoría histórica deberá
tener resultado separado y no conceder autorización actual.
