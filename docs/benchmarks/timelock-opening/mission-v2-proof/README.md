# Certificado Groth16 completo de misión v2 medido en EVM

Fecha: 2026-10-29. Continúa el [codec v2](../codec-v2/README.md) y la [rama de U inválido](../invalid-point/README.md).

## Resultado

Se generaron y verificaron **dos pruebas Groth16 reales del circuito completo de misión**: el ataque válido que necesita cinco candidatos H3 y el paquete con compromiso incorrecto que debe dar resultado inválido. Ambas pasan en Go, Foundry y transacciones separadas en una instancia Anvil nueva. El consumidor compara el contexto con el statement esperado y H3 con el prefijo exacto calculado en EVM.

Esto supera el benchmark anterior del componente KEM: esta relación incluye autenticación del beacon quicknet para su ronda, pairing y bytes comprimidos, derivación de clave, age, hash del paquete de 273 bytes, mensaje de 37 bytes, compromiso, reglas estáticas de revelación y contexto inmutable. **No ejecuta combates ni está conectado a Game**; la preservación de la hora y orden históricos sigue siendo trabajo de integración.

La relación aún exige U canónico, no identidad y de subgrupo. Los bytes con U inválido usan la [rama independiente, ahora medida con certificados reales en EVM](../invalid-point-proof/README.md). No se presenta este certificado como cobertura de la totalidad de la basura aceptable por un contrato futuro.

## Mediciones

| Medida | Resultado |
| --- | --- |
| Restricciones | 5.139.537 |
| Entradas públicas | 55 |
| Prueba serializada Solidity | 384 bytes |
| Bytecode desplegado del verificador | 13.847 bytes, dentro del límite EIP-170 de 24.576 |
| Compilación | 40,82 s |
| Setup local | 710,69 s |
| Generación válida / inválida | 39,79 / 49,06 s |
| Verificación nativa válida / inválida | 3,02 / 4,22 ms |
| Máximo RSS del proceso | 11.387.488 KiB, unos 10,86 GiB |

Go 1.27.3, gnark 0.16.4, BN254 y GOMAXPROCS=16. El RSS incluye compilación, setup y pruebas; no se aisló memoria por fase. Hubo otras pruebas ejecutándose durante parte de la medición: no es una comparación controlada de rendimiento ni una medición del navegador.

El setup es exclusivamente local y de investigación, con aleatoriedad sin ceremonia. **Nunca reutilizar estas claves para producción.** Los tiempos de setup no son un coste por cada ataque; la generación de pruebas sí lo es. Los artefactos y detalles están en [metrics.json](metrics.json).

Gas medido en transacciones reales separadas contra un Anvil privado, hardfork Cancun, solc 0.8.28 y optimizador 200:

| Transacción | Gas usado |
| --- | --- |
| Desplegar verificador | 3.047.453 |
| Desplegar consumidor y su caché H3 | 1.081.667 |
| Inicializar prefijo válido | 117.717 |
| Rechazar los primeros cuatro candidatos | 33.985 |
| Aceptar el quinto, en otra transacción | 53.275 |
| Verificar misión válida con prefijo ya terminado | 735.704 |
| Inicializar prefijo del caso inválido | 117.717 |
| Completar su prefijo | 54.320 |
| Verificar misión inválida con prefijo ya terminado | 735.532 |

Estos son costes de las transacciones del prototipo; no incluyen escrituras ni ejecución de Game, resolver dependencias, combates, indexación o una política económica de spam. No son precios en dinero ni una medición en Gnosis. [evm-results.json](evm-results.json) registra el alcance y hash del verificador.

## Consumidor y H3 agotado

El [consumidor](../../../../apps/web/scripts/experiments/h3-stepper/MissionV2Consumer.sol) fija el verificador y crea su propia caché genérica. Nadie puede elegir un `pre` para bloquear una misión: la caché se indexa solo por `pre`; el vínculo con la misión se verifica al consumir el certificado.

- Prefijo aceptado: el escalar público debe coincidir con el primer candidato aceptado de esa entrada.
- Prefijo todavía pendiente o inexistente: se rechaza el certificado; no hay resultado de invalidez.
- Prefijo agotado después de los 65534 candidatos: se admite únicamente resultado inválido con `CapsuleValid=0` y escalar público cero como **placeholder**. El circuito exige U no identidad; `[0]G2 != U` produce ese resultado y el resto de la prueba liga el `pre` a la apertura auténtica.

El placeholder cero por sí solo **no prueba agotamiento**. Hay un test de restricciones que muestra que puede construirse también para un paquete válido; el consumidor rechaza ese intento cuando el prefijo real aceptó otro escalar. La autorización proviene del estado EXHAUSTED del mismo `pre`, no del número cero, del reloj ni del esfuerzo declarado por un keeper.

El agotamiento se probó en el consumidor mediante un recibo mock y el recorrido exacto se comprueba en las pruebas del paginador. No se encontró ni se afirma disponer de una entrada SHA real que rechace los 65534 candidatos. Por eso no existe aquí una prueba Groth16 real de un caso de agotamiento total.

Una llamada al verificador tiene presupuesto de 2.000.000 gas. Las pruebas malformadas se rechazan dentro de ese límite, en vez de permitir que un fallo de precompilado consuma todo el gas reenviado. Un fallo del verificador **nunca** se traduce en una misión inválida: la llamada revierte.

Cuando el resultado certificado es inválido se devuelve un mensaje vacío. Para un resultado válido se devuelven exactamente los 37 bytes autenticados. El Game futuro debe leer su statement almacenado, fijar la versión de verificador y coordinar este resultado con el resto de rutas bajo la misma política, sin efectos de «gana la primera transacción».

## Evidencia

Pasaron 10 tests EVM sin skips: cinco tests del consumidor con verificador stub y cinco con el verificador Groth16 real. Las pruebas reales comprueban misión válida de cinco intentos y su mensaje exacto, compromiso inválido, alteración del resultado, contexto incorrecto y prueba malformada con gas acotado. El stub solo cubre política; no se presenta como prueba criptográfica.

Un test Go contrasta las **55 posiciones públicas**, incluidas las posiciones del digest, plaintext, `pre`, escalar y resultado, contra el witness real. No se supone que el ABI coincida por tener el mismo número de campos.

Las pruebas de restricciones del codec, las mutaciones de contexto y los tests de punto complementan estas dos pruebas reales; no son una auditoría formal ni prueban todos los hints maliciosos de la dependencia. La [revisión con Claude](../invalid-point/README.md) conserva las hipótesis, descartes y supuestos pendientes de los gadgets.

## Qué falta para el objetivo del juego

- Conectar a Game ambas rutas ya medidas: apertura e invalidez independiente de U.
- Hacer que la admisión v2 garantice framing, versión, hash y contexto almacenado que consumen los verificadores; disponibilidad de los bytes emitidos.
- Integrar simulador y Solidity para resolver a la llegada y secuencia originales, incluso con una demora prolongada; impedir adelantamientos y dobles transiciones.
- Actualizar cliente, keeper e indexación y retirar expiraciones como sustituto de validez verificable.
- Validar recuperación, capacidad bajo spam y seguridad antes de habilitar el protocolo.

## Reproducción

Desde `apps/web/scripts/experiments/opening-zk`, usando el Go fijado en el manifiesto:

```sh
GOMAXPROCS=16 go run . --mission-v2 ../../../../../docs/benchmarks/timelock-opening/codec-v2/vectors.json ../../../../../docs/benchmarks/timelock-opening/mission-v2-proof
GOMAXPROCS=4 go test -run '^(TestMissionV2Circuit|TestMissionV2ConsumerPublicSchema)$' -v .
```

Desde la raíz, con Foundry/Anvil y solc 0.8.28:

```sh
SOLC_BIN=/ruta/a/solc-0.8.28 pnpm --filter @vendetta/web exec tsx scripts/experiments/measure-mission-v2.ts
```

El runner crea y cierra su propio Anvil en un puerto efímero. Usa una clave pública de desarrollo únicamente en ese proceso local; no usa despliegues ni fondos reales.
