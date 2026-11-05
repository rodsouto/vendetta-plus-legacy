# Ensayo MPC pequeño con transcripts entre procesos

Validación del 3 de noviembre de 2026. Alcance: ejecución reproducible del
procedimiento nativo gnark BN254 sobre un circuito fijo pequeño, con archivos,
atestaciones de participantes de test y límites de procesos. No constituye una
ceremonia independiente, una auditoría ni una aprobación de producción.

```bash
# Preparar previamente el SDK y módulos fijados. El build no descarga módulos.
export VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go
pnpm rehearse:hidden-v2 \
  --directory /home/rodrigo/.cache/vendetta-audit/mi-nuevo-ensayo \
  --unsafe-test-only
```

El directorio padre debe existir. Cada ejecución exige un directorio nuevo
absoluto fuera de repositorios Git. Identidades/estado quedan fuera de Git,
modo 0700/0600. No reutilizar identidades del ensayo en una ceremonia real.
Los setups existentes del juego permanecen intactos. Los artifacts públicos
copiados aquí no incluyen seeds de identidad ni claves PK/VK serializadas.

También se puede compilar `./cmd/mpc-rehearsal` y ejecutar sus subcomandos
`init`, `contribute`, `close` y `verify` por separado. Todos exigen
`--directory` y `--unsafe-test-only`. Después de init, pasar
`--config-sha256 <digest-config>`; contribute requiere `--phase 1|2`,
`--index 0|1` y `--key <identidad-test>`. Fase 2 y verify requieren
`--phase1-closure-sha256`; verify añade `--phase2-closure-sha256`.
Los pins se distribuyen por el coordinador del ensayo, sin autoridad externa.

## Resultado y recursos

El [informe](run-report.json) conserva los hashes de configuración, CS, cierres,
PK/VK y Solidity, el hash del binario, y las medidas de cada worker. La relación
es `X⁴ = Y` con compromiso, **cinco restricciones y dominio 8**. Pasaron dos
contribuciones por fase, verificación de la cadena de atestaciones y de los
transcripts nativos, extracción idéntica desde bytes frescos y prueba Groth16
para X=3/Y=81. El input público Y=80 fue rechazado. Se exportó Solidity, sin
compilarlo ni ejecutar EVM en este ensayo.

Ocho workers reales terminaron secuencialmente. Ver run-report.json para los
valores finales medidos; corresponden a esta relación pequeña exclusivamente.
Se autentican firmas quicknet archivadas de rondas 1000 y 1001 con cadena y
clave pública fijadas. Ya eran conocidas antes del cierre: el informe conserva
`productionApproved`, `independentParticipants` y `beaconAfterClosureProven` en
false. Las identidades se generaron en una sola máquina por un mismo operador.

El supervisor aplica 30 s wall, espera salida antes del siguiente worker y mata
su grupo en timeout. Cada worker configura 20 s CPU, 4 GiB de espacio virtual,
64 KiB por archivo y core dumps deshabilitados. Son límites kernel Linux;
256 MiB de GOMEMLIMIT es sólo objetivo del GC, no techo RSS, y GOMAXPROCS=2 no
es una cuota de CPU. No se demuestra aislamiento de operadores ni durabilidad
ante corte físico. Las escrituras son exclusivas y sincronizan archivo/directorio.

El cursor de preflight limita el formato nativo antes de ReadFrom: sólo puntos
comprimidos, dominio y todos los tamaños de vectores/compromisos exactos,
challenge de 32 bytes y EOF. La forma de fase 2 procede del CS fijo y SRS ya
verificado. Después se valida curva/subgrupo y reserialización canónica. Los
casos firmados de longitudes maliciosas prueban esta frontera incluso cuando
la atestación pasa; omisiones, sustituciones, reordenación y contexto cruzado
se rechazan sin publicar informe de éxito.

## Capacidad pendiente para dominios del juego

La observación de la máquina durante esta continuación fue aproximadamente
18,95 GiB RAM total y 14,82 GiB disponible, 16 CPU lógicas y 929,76 GiB de disco
libre. Son muestras de capacidad disponible, no reservas ni mediciones MPC a
escala real. No se detectaron archivos de cuota cgroup v2 en las rutas consultadas;
esto no demuestra ausencia de otros límites del host/WSL.

Los dominios declarados del juego siguen siendo 2²³ y 2²². Sólo los arrays de
puntos de un SRS fase 1 de dominio 2²³ representan aproximadamente 3 GiB en RAM
((4N−1) G1 de 64 bytes y (N+1) G2 de 128 bytes). La verificación puede mantener
varios objetos, además de CS y temporales. Esto es una cota estructural, no un
pico medido. Los envelopes y límites pequeños de esta herramienta rechazan esos
dominios deliberadamente. No se amplían para lanzar esa carga sin un presupuesto
y supervisión revisados. No se regeneraron claves del juego ni se midieron sus
fases MPC completas.

Próximo criterio: fijar un experimento de capacidad separado, con límite de
memoria/tiempo/almacenamiento, checkpoints de fallo y registros por circuito/fase,
antes de decidir presupuestos de ejecución o procedimiento de producción. La
publicación autenticada del cierre y un beacon posterior impredecible deben
probarse antes de una ceremonia real, con participantes/autoridades independientes.

## Verificación

```bash
GOMEMLIMIT=6GiB GOMAXPROCS=8 "$VENDETTA_GO_BIN" \
  -C apps/web/scripts/experiments/opening-zk test -count=1 \
  ./ceremony ./cmd/ceremony ./mpcrehearsal ./cmd/mpc-rehearsal
"$VENDETTA_GO_BIN" -C apps/web/scripts/experiments/opening-zk vet \
  ./ceremony ./cmd/ceremony ./mpcrehearsal ./cmd/mpc-rehearsal
(cd contracts && forge test --match-contract DeployPolicyTest -vv)
```

[results.json](results.json) registra tests, logs y hashes de fuentes de esta
continuación; las evidencias del candidato local anterior siguen siendo históricas.
No se ejecutaron suites completas web/rules/contratos ni proving de circuitos del
juego al no cambiar sus reglas/implementaciones. La regresión nativa del productor
y MPC pequeño original se ejecutó por separado. No hubo commits ni despliegues reales.

Continuación posterior: [entrada nativa protegida](../guarded-native-import/README.md)
repite el ensayo con dimensiones ligadas al CS y un guard delante de ReadFrom.
Sus fuentes y medidas se conservan separadas de esta ejecución histórica.
