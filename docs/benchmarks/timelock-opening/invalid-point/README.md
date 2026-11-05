# Invalidez de U ligada a una misión v2

Fecha: 2026-10-29. Continúa el [codec v2](../codec-v2/README.md). Esta rama aborda una causa de bloqueo: un U que el decoder no puede convertir en un punto comprimido, canónico, no identidad y del subgrupo BLS12-381 G2 correcto. La relación de apertura anterior exigía un punto válido y, por tanto, no podía certificar la invalidez de esos bytes.

Continuación medida: [certificados Groth16 de U inválido verificados en EVM](../invalid-point-proof/README.md), con dos pruebas reales y costes registrados. Las medidas de restricciones de esta página corresponden a la fase inicial.

No cambia contratos de juego, keeper, penalizaciones ni resolución. El nuevo circuito demuestra una propiedad de bytes concretos; todavía no autoriza efectos en Game.

## Qué demuestra

El [gadget](../../../../apps/web/scripts/experiments/opening-zk/point_encoding.go) devuelve la validez exacta de un U de 96 bytes bajo el perfil:

1. Flags de compresión e identidad correctos.
2. Ambas coordenadas X estrictamente menores que p. Reducirlas módulo p no permite ocultar bytes no canónicos.
3. Existencia de una raíz Y de `X³ + 4(1+i)` en Fp², con el signo codificado.
4. Pertenencia al subgrupo de orden r y exclusión de identidad.

Para demostrar que no existe raíz no basta que el backend diga «no pude descifrar». Se comprueba un certificado algebraico: para z en Fp², `N(z)^((p−1)/2) = z^((p²−1)/2)`. Por tanto z no es cuadrado si y solo si su norma no lo es. Como p es 3 módulo 4, un testigo `t² = −N(z)` con `N(z) != 0` demuestra la rama no cuadrada. La otra rama exige la ecuación de curva. Un prover no puede escoger cualquiera de las dos para declarar inválido un punto válido.

La pertenencia al subgrupo se comprueba con `[r]P = O`, usando **r como entero constante**, no convertido a un escalar módulo r. La cadena usa sumas unificadas con los casos de infinito, inverso y tangente protegidos. No se usa una multiplicación optimizada cuya precondición sea que el punto ya pertenezca al subgrupo.

El [circuito de misión inválida](../../../../apps/web/scripts/experiments/opening-zk/invalid_point_v2.go) exige que ese resultado sea falso para los bytes 44–139 del paquete exacto. Comprueba el framing v2, la ronda, Keccak de los 273 bytes y el contexto con dominio `VENDETTA_OPENING_V2`. Sus únicas entradas públicas son las dos mitades de 128 bits del digest de contexto inmutable. El consumidor futuro tendrá que comparar ese digest con el almacenado para la misión y fijar el verificador/versionado correcto.

Esta prueba no necesita esperar al beacon ni conocer firma, clave, mensaje, entrada H3 o secretos del remitente. Demuestra invalidez de codificación/subgrupo; no deduce invalidez a partir de una demora.

## Revisión con Claude y discrepancias

Se archivaron la [revisión original](../../../reviews/hidden-mission-resolution-claude-point-validity.md), la [adenda sobre dependencias](../../../reviews/hidden-mission-resolution-claude-point-validity-addendum.md) y la [revisión de composición](../../../reviews/hidden-mission-resolution-claude-point-validity-composition.md), con sus metadatos. Las tres fueron de solo lectura mediante CLI; el modelo informado fue `claude-opus-5-5`. Claude no ejecutó tests.

La primera revisión no pudo acceder a las dependencias fuera del workspace y planteó dos hipótesis: una excepción en sumas de puntos y la posible mutación de una constante compartida. Se habilitó lectura explícita de las dependencias y Claude **descartó ambas**. La implementación usada de `AddUnified` contiene la corrección de la excepción de raíces cúbicas; `One()` devuelve un contenedor nuevo. Además, se construyó la constante de curva explícitamente por claridad.

La procedencia no queda apoyada solo en la declaración de Claude: se compararon los archivos `/tmp/.../gnark/.../g2.go` y el módulo compilado `gnark@v0.16.4`. Ambos tienen SHA256 `c6ffc3e7ceccf6cca6ba9bdc6991c3a9e08059b9deb53839c570f1f8fd44f235`. La revisión de composición también pudo leer el módulo real.

Claude señaló después una posible libertad de división 0/0 en `AssertIsOnG2` usado aisladamente en el camino anterior. Tras revisar la relación completa, concluyó que **esa hipótesis no permite falsear el resultado de misión en esta composición**: un resultado válido también requiere U igual a `[r]G2`, calculado desde el generador fijo y el H3 exacto. Para un U realmente válido, el chequeo optimizado no tiene la excepción de torsión considerada. La posible debilidad genérica de la primitiva no quedó demostrada ni se presenta como bug confirmado.

Coincido con ampliar pruebas adversarias y mantener explícitas las dependencias de seguridad. No considero que revisar código y ejecutar witnesses sea una auditoría de gnark: siguen siendo supuestos la solidez del comb de base fija, los gadgets emulados, HashToG1 y la verificación BLS. Separar `BeaconCircuit` en otra prueba **con el mismo gadget** no constituye una verificación independiente ni elimina esos supuestos; no se introdujo un registro de beacons para aparentar que lo hace.

Se aceptó una mejora del consumidor de misión: solo devuelve plaintext cuando el certificado es válido. Para una misión inválida devuelve bytes vacíos, evitando que un llamador use datos que no debe ejecutar. Esto no hace secretos los inputs públicos del certificado.

## Evidencia y límites

Los [vectores públicos](vectors.json) incluyen las ocho combinaciones de flags, identidad, ceros, X=p y p−1 en ambos coeficientes, bits altos de A0 y su máximo de 384 bits, X sin raíz, puntos fuera del subgrupo y puntos de orden 13 y 23. Estos últimos se construyen con multiplicación entera sin reducción GLV y se comprueba nativamente su orden.

Se contrastaron **22 vectores** con gnark-crypto, el noble importado directamente y el noble que usa tlock-js; los tres decoders coinciden. Los [resultados](interop-results.json) identifican la dependencia tlock usada. Este chequeo es de puntos comprimidos, no una prueba de descifrado de misiones.

También se prueban testigos alterados: raíz opuesta con afirmación verdadera, rama no cuadrada falsa para un punto válido y Y sustituida. El test anterior con raíz opuesta y afirmación falsa no bastaba para ejercitar la restricción de signo; se añadió el caso que sí la necesita.

La relación de contexto se prueba con un paquete válido que no puede invalidarse, flags inválidos, identidad, bytes sustituidos bajo el digest original y framing de otra red. Las pruebas usan el solver normal y sus hints honestos: no exploran todos los hints maliciosos ni prueban solidez universal.

Los guards para cero son defensivos; un punto finito de orden 2 no existe en esta curva de orden impar. No se cuenta una comprobación de identidad codificada como evidencia de haber ejercitado una tangente finita con Y=0.

## Costes y próximos vínculos

La comprobación genérica de subgrupo evita precondiciones circulares, pero añade coste importante. La versión inicial compiló a 2.929.395 restricciones y 7 entradas públicas para el componente de punto, y 3.760.005 restricciones y 2 entradas públicas al ligarlo al contexto de misión. Son medidas de restricciones, **no tiempos de nueva prueba ni gas de un verificador desplegado**.

Los [resultados finales](results.json) registran 48 comprobaciones de witness del componente, 11 de la rama ligada a misión y 22 comparaciones de decoders. La relación de misión también cubre no canonicidad, ausencia de raíz y puntos de orden 13 y 23, además de padding no nulo. La [procedencia de la dependencia](dependency-provenance.json) registra la comparación del módulo real y `go mod verify`.

Los otros casos se reparten así: MAC/tag, compromiso y predicado inválidos se cubren por el certificado completo; U inválido usa esta rama independiente. El agotamiento real de H3 exige un recibo completo para el mismo `pre`, nunca un límite local del prover. Ninguna ruta puede dar efectos distintos para un mismo contexto inmutable solo por ganar una carrera de transacciones.

El verificador y consumidor de esta rama ya están medidos como prototipo. Antes de habilitar admisión v2 faltan conectarlos a Game, las comprobaciones de framing de admisión y la integración histórica. Si falta cualquiera, esta documentación no autoriza a aceptar paquetes y confiar en que todos podrán descartarse después.

## Reproducción

Desde `apps/web/scripts/experiments/opening-zk`, con el Go fijado en el manifiesto:

```sh
GOMAXPROCS=4 go test -run '^(TestPointEncodingCircuit|TestInvalidPointMissionV2Circuit)$' -v .
VENDETTA_POINT_EXPORT=../../../../../docs/benchmarks/timelock-opening/invalid-point/vectors.json go test -run '^TestExportPointEncodingVectors$' -v .
go mod verify
```

Desde la raíz:

```sh
pnpm --filter @vendetta/web exec tsx scripts/experiments/check-point-encoding.ts
```
