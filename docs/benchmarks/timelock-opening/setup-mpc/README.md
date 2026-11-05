# Compatibilidad MPC del backend fijado

Revisión del 31 de octubre de 2026 para el hito 6. Resultado: la API MPC nativa
de gnark es una candidata compatible para construir el procedimiento de setup.
La prueba es pequeña y local; no constituye una ceremonia ni genera claves de
los circuitos del juego. El productor sigue rechazando setups declarados seguros.

## Fuentes y procedimiento comprobados

El módulo del juego fija `github.com/consensys/gnark v0.16.4`, cuyo origen en
la caché Go local es el commit `e974abb44722dd201a7f1949baeabca0fef5866e`.
Se revisaron las implementaciones BN254 de
[fase 1](https://github.com/Consensys/gnark/blob/e974abb44722dd201a7f1949baeabca0fef5866e/backend/groth16/bn254/mpcsetup/phase1.go),
[fase 2](https://github.com/Consensys/gnark/blob/e974abb44722dd201a7f1949baeabca0fef5866e/backend/groth16/bn254/mpcsetup/phase2.go),
[serialización](https://github.com/Consensys/gnark/blob/e974abb44722dd201a7f1949baeabca0fef5866e/backend/groth16/bn254/mpcsetup/marshal.go)
y [extracción de claves](https://github.com/Consensys/gnark/blob/e974abb44722dd201a7f1949baeabca0fef5866e/backend/groth16/bn254/mpcsetup/setup.go).
Los hashes de los archivos inspeccionados se conservan en [results.json](results.json).

`TestSetupMPCCompatibility` compila la relación pequeña `X⁴ = Y`, con Y pública
y un compromiso explícito de gnark. Ejecuta dos contribuciones por fase,
serializa cada resultado y verifica la secuencia desde objetos recién leídos.
Usa `VerifyPhase1` y `VerifyPhase2` con desafíos finales fijos exclusivamente de
test. Rechaza una alteración del challenge en cada fase. Repite la verificación
del mismo transcript y compara los bytes de PK/VK; lee las claves con las mismas
interfaces que el productor, exporta Solidity y genera/verifica una prueba real
con las mismas opciones de backend para el verificador Solidity que el productor.
La sustitución de Y por un valor incorrecto se rechaza.

Resultado: el test y sus dos subtests pasan; también pasan los seis tests
principales `TestProducer` con sus subtests. Ningún artefacto de claves del test
se guarda en disco. No se probaron EVM, los circuitos completos, transferencia
entre participantes ni capacidad de una ceremonia de tamaño real.

```bash
cd apps/web/scripts/experiments/opening-zk
GOMEMLIMIT=6GiB GOMAXPROCS=8 /tmp/vendetta-opening-tools/go/bin/go test \
  -v -run '^(TestSetupMPCCompatibility|TestProducer)' -count=1 .
```

## Decisiones de integración que faltan

Las funciones `VerifyPhase1` y `VerifyPhase2` suponen objetos bien formados
mediante `ReadFrom` y mutan la última contribución al sellarla. La futura CLI
debe releer el transcript para cada verificación, comprobar consumo completo
de bytes y acotar tamaño, dominio y recursos antes de aceptar entradas.

Esas funciones no exigen un número mínimo de contribuciones. La política de
producción debe rechazar listas vacías y exigir participantes, orden y digest
final aprobados por separado. Una verificación matemática no demuestra que los
participantes sean independientes ni que hayan eliminado sus secretos; tampoco
acredita que el operador no haya sustituido el transcript completo.

Los desafíos finales reales deben fijar una fuente autenticada y un evento
posterior al cierre de contribuciones de cada fase. Los literales del test no
sirven para ello. No confundir esos desafíos de ceremonia con el beacon por
misión usado en las aperturas del juego.

Los manifiestos locales existentes indican 5.139.537 restricciones para opening
y 3.760.005 para invalid-point: los dominios mínimos por redondeo a potencia de
dos son 2²³ y 2²². En `SrsCommons`, la fase 1 contiene `4N−1` puntos G1 y `N+1`
puntos G2. Es una advertencia de escala obtenida del código, no una medición de
RAM, tiempo o tamaño total de transcript. No se ejecutó esa carga. La selección
de un SRS común o de dominios separados requiere medir y revisar la compatibilidad
con ambos circuitos y sus compromisos; este test no decide esa política.

La candidata usa formatos nativos gnark. No se presupone compatibilidad con
transcripts `.ptau`/`.zkey` de otras herramientas. El siguiente paso técnico es
especificar y revisar la CLI de contribución/verificación, el registro externo
de aprobación y su vínculo con fuentes, CS, PK/VK y consumidores finales. El
[plan de producción](../../../proposals/hidden-v2-production-readiness.md)
mantiene los criterios completos.
