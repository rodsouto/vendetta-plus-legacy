# Certificado de U inválido medido en EVM

Fecha: 2026-10-29. Continúa la [rama de invalidez de punto](../invalid-point/README.md) y complementa el [certificado completo de apertura](../mission-v2-proof/README.md).

## Resultado

Se generaron dos pruebas Groth16 reales con un mismo verificador:

- Un paquete v2 con el flag de compresión de U incorrecto.
- Un paquete v2 cuyo U está en la curva, pero tiene orden 13 y no pertenece al subgrupo permitido.

Las dos se verificaron en Go, Foundry y transacciones separadas en una instancia Anvil nueva. La relación contiene las mismas comprobaciones de punto y contexto que las pruebas de restricciones anteriores; ahora hay evidencia de generación y verificación criptográfica real para esos dos casos.

El consumidor liga las dos entradas públicas al digest inmutable esperado. Se rechazaron la reutilización de un certificado contra la misión válida original, su modificación para usar el digest original y el intercambio de pruebas entre las dos misiones. **No cambia Game ni ejecuta retornos, penalizaciones o combates.**

## Costes medidos

| Medida | Resultado |
| --- | --- |
| Restricciones | 3.760.005 |
| Entradas públicas | 2 × 128 bits del digest de misión |
| Prueba serializada Solidity | 384 bytes |
| Bytecode desplegado del verificador | 6.697 bytes, dentro de EIP-170 |
| Compilación | 33,85 s |
| Setup local | 514,91 s |
| Generación de flag inválido / torsión | 23,50 / 21,67 s |
| Verificación nativa | 2,91 ms en ambos casos |
| Máximo RSS del proceso | 8.523.744 KiB, unos 8,13 GiB |

Go 1.27.3, gnark 0.16.4, BN254 y GOMAXPROCS=16. El RSS incluye compilación, setup y pruebas; no se aisló por fase. Parte del tiempo coincidió con regresiones del circuito. No son mediciones de navegador ni una comparación controlada de rendimiento.

Gas en transacciones separadas contra un Anvil privado con hardfork Cancun, solc 0.8.28 y optimizador 200:

| Transacción | Gas usado |
| --- | --- |
| Desplegar verificador | 1.501.265 |
| Desplegar consumidor | 211.633 |
| Verificar flag inválido | 348.676 |
| Verificar punto de orden 13 | 348.676 |

No necesita caché H3 ni publicación del beacon: esta invalidez se demuestra con los bytes del paquete. Los costes no incluyen los efectos de Game ni su protección del orden histórico. Son transacciones locales, no mediciones o despliegues en Gnosis.

Artefactos: [metrics.json](metrics.json), [resultados EVM](evm-results.json), [prueba de flag](proof.json), [prueba de torsión](torsion-proof.json) y [verificador](PairingVerifier.sol). El setup es aleatorio y exclusivamente de investigación; **sus claves no sirven para producción**.

## Validación

Pasaron seis tests EVM con el verificador Groth16 real, sin stubs ni skips: ambos certificados positivos de invalidez, protección de la misión válida original, intercambio de pruebas entre misiones, overflow de palabras públicas y prueba malformada con gas acotado. El consumidor da un presupuesto de 2.000.000 gas al verificador; un fallo revierte, nunca se transforma en un resultado de invalidez.

Además, el generador intentó probar inválido el paquete válido original usando el backend Groth16 con la misma configuración de compromiso usada para las pruebas reales. Exigió un error tipado `UnsatisfiedConstraintError`; una falla genérica del solver no habría contado como evidencia. Se rechazó por una restricción no satisfecha. Esto complementa los tests anteriores, sin equivaler a una prueba formal de solidez frente a todos los hints maliciosos.

Las 11 regresiones de la relación de punto ligada a misión volvieron a pasar después de compartir el constructor de testigos entre tests y generador. Los [vectores y análisis anteriores](../invalid-point/README.md) cubren más clases de bytes mediante restricciones y comparación de decoders. Aquí solo se generaron estas dos pruebas reales; no se afirma haber generado una para cada vector.

## Condiciones para integrarlo

El [consumidor](../../../../apps/web/scripts/experiments/h3-stepper/InvalidPointV2Consumer.sol) es stateless: verifica un certificado para el statement recibido como argumento. **Game deberá proporcionar el digest que almacenó al enviar**, no aceptar que el probador elija qué digest representa una misión. También deberá fijar esta versión/verificador y evitar una segunda transición para misiones ya resueltas.

Las rutas deben compartir una única interpretación: apertura con `valid=false` y certificado de U inválido significan el mismo estado de envío inválido. Una firma errónea, una prueba rechazada, una demora o un keeper caído no son ninguna de esas dos cosas.

Para conservar el resultado de ataques válidos, recibir certificados tiene que poder desbloquear una misión pendiente sin exigir drenar antes la cola que esa misma misión bloquea. Ejecutar el resultado es otra operación: debe conservar llegada y secuencia originales y proteger el estado de las acciones posteriores dependientes. Esto sigue pendiente en simulador y Solidity.

El agotamiento H3 conserva la política separada del consumidor de apertura: requiere EXHAUSTED para el mismo `pre`; se probó con mocks y restricciones, no con un vector SHA real de 65534 rechazos. Medir esta rama de punto no elimina esa limitación de evidencia ni completa por sí solo la admisión v2.

## Reproducción

Desde `apps/web/scripts/experiments/opening-zk`, con el Go fijado en el manifiesto:

```sh
GOMAXPROCS=16 go run . --invalid-point-v2 ../../../../../docs/benchmarks/timelock-opening/codec-v2/vectors.json ../../../../../docs/benchmarks/timelock-opening/invalid-point-proof
GOMAXPROCS=2 go test -run '^TestInvalidPointMissionV2Circuit$' -v .
```

Desde la raíz, con Foundry/Anvil y solc 0.8.28:

```sh
SOLC_BIN=/ruta/a/solc-0.8.28 pnpm --filter @vendetta/web exec tsx scripts/experiments/measure-invalid-point-v2.ts
```

El runner crea y cierra un Anvil propio en un puerto efímero, con una clave pública de desarrollo; no toca redes ni fondos reales.
