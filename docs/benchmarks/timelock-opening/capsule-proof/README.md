# Cápsula tlock ligada al pairing

Investigación del 28 de octubre de 2026. Continúa el [primer experimento](../README.md); no cambia los contratos del juego.

## Qué buscamos

Eliminar la pérdida de ataques legítimos por revelarse tarde, manteniendo su llegada y orden originales. Una misión solo puede descartarse por una demostración vinculada a sus datos; la falta de una prueba, de drand o de capacidad del prover no constituye una demostración de invalidez.

Este paso amplía la relación ZK del pairing para cubrir la cápsula KEM de tlock. Todavía no es un certificado completo de apertura o invalidez de una misión.

## Relación implementada

El [circuito](../../../../apps/web/scripts/experiments/opening-zk/capsule.go) reúne en una sola relación:

1. El pairing BLS12-381 `GT = e(signature, U)`, con los puntos en sus subgrupos y distintos de la identidad. No se aceptan líneas de pairing precomputadas aportadas por el prover.
2. La vinculación de signature y U con sus bytes comprimidos, incluidos los bits de signo, compresión e infinito. No basta con suministrar coordenadas compatibles con algún otro ciphertext.
3. La conversión canónica de los doce coeficientes de GT al orden de bytes de tlock, usando la conversión de base de gnark.
4. `sigma = V xor H2(GT)` y `fileKey = W xor H4(sigma)`, con los prefijos y truncamientos del cliente instalado.
5. H3 con `SHA256("IBE-H3" || sigma || fileKey)`, contador de dos bytes little endian y desplazamiento del primer byte como en tlock-js. Se selecciona **el primer** candidato menor que el orden de Fr, sin reducir un candidato rechazado módulo Fr.
6. El resultado booleano exacto de `U == r·G2`. Se puede demostrar tanto que esta comprobación se cumple como que no se cumple, bajo los mismos inputs públicos.

Los puntos, GT, bytes comprimidos, V, W, clave y resultado son públicos en este prototipo. Se conserva redundancia para comprobar interoperabilidad: no es una estimación de una interfaz final optimizada. Publicar la clave solo tendría sentido después de la apertura; este circuito aislado no impone ese momento.

Se implementó también una [variante compacta](../../../../apps/web/scripts/experiments/opening-zk/capsule_compact.go) de la misma relación: las coordenadas y GT pasan a ser witness privado y los bytes públicos se empaquetan en grupos de 16, cada uno limitado explícitamente a 128 bits. Pasa de 301 a **13 inputs públicos**, con 2.295.952 restricciones. Los cuatro vectores, sus resultados falsificados, una clave sustituida y un input que excede 128 bits se comprobaron en tests de restricciones. Los [resultados](../capsule-compact-results.json) indican expresamente que **no se generó un setup, prueba Groth16 ni verificador Solidity de esta variante**; no se le atribuyen tiempos de proving ni gas.

## Límite de H3: un caso reproducible

El circuito de coste ensaya cuatro candidatos. **Ese límite no es una regla del protocolo y no puede usarse para declarar inválida una misión.**

El ciphertext real archivado ya necesita dos candidatos. Además, el [probe](../h3-bound-probe.json) encontró en 11.749 ensayos —unos 338 ms en esta ejecución— un par legítimo sigma/fileKey cuyo primer candidato aceptable es el quinto. El emisor puede buscar estos pares antes de conocer la firma futura: H3 no depende de ella. La cápsula correspondiente está [archivada](../capsule-bound-input.json).

Los seis vectores de cápsula se contrastan también directamente con `decryptOnG2` de tlock-js 0.9.0, incluida la clave resultante y el caso de cinco candidatos; el [resultado de interoperabilidad](../capsule-interop.json) queda archivado. La regresión del circuito comprueba lo siguiente sobre exactamente los mismos bytes:

- Con cuatro candidatos no existe witness ni para declarar la cápsula válida ni para declararla inválida.
- Con ocho candidatos existe witness para el resultado válido y se rechaza el resultado inválido.
- Una cápsula que usa deliberadamente un candidato aceptable posterior, saltándose el primero, debe dar inválida. Su [vector adversario](../capsule-skip-input.json) evita que una implementación demasiado permisiva acepte cualquier candidato pequeño.

Ocho también es un límite de experimento. Ampliar un límite reduce la frecuencia de agotamiento, pero no establece por sí solo la garantía buscada. Antes de integrar hay que definir una ruta verificable que cubra todo el dominio admitido: perfiles ampliables y su selección segura, ejecución recursiva o un programa con el bucle completo son alternativas por investigar. Si se cambia el formato, debe versionarse y comprobarse al aceptar el envío. En ningún caso un timeout o error del prover permite convertir un caso no soportado en inválido.

Este hallazgo **no demuestra una vulnerabilidad del contrato actual ni de tlock**; muestra por qué un límite artificial de este prototipo no puede trasladarse a las reglas de cancelación.

## Pruebas y mediciones

El circuito de cuatro candidatos tiene **2.294.548 restricciones** y 301 inputs públicos, frente a 1.470.823 restricciones del pairing aislado. Los tests de restricciones comprueban cuatro vectores Node/Go, los resultados falsificados, sustitución de clave, bits de compresión/signo, V alterado y el agotamiento del límite. La generación y verificación criptográfica se mide por separado; resolver restricciones en un test no equivale a generar un certificado Groth16.

Se generaron dos certificados Groth16 reales con el mismo setup local: uno para la cápsula del cliente (`true`) y otro para V manipulado (`false`). Ambos se verificaron en Go y se rechazó el bit de resultado alterado. Los tests del witness archivado ligan sus 301 valores públicos a los vectores Node/Go.

| Medición                                     |                               Resultado | Alcance                                                                    |
| -------------------------------------------- | --------------------------------------: | -------------------------------------------------------------------------- |
| Compilación                                  |                                 19,56 s | Una ejecución                                                              |
| Setup local                                  |                                857,73 s | Preparación por circuito, no por misión; no es una ceremonia de producción |
| Proving, cápsula válida                      |                                 49,52 s | Incluye resolución de restricciones y generación Groth16                   |
| Proving, cápsula manipulada                  |                                 49,06 s | Certificado de resultado KEM falso bajo la firma suministrada              |
| Verificación Go                              |                          3,71 / 3,89 ms | Cápsula válida / manipulada                                                |
| Prueba codificada para Solidity              |                      384 bytes cada una | Formato exportado; sin verificación EVM de esta variante                   |
| Pico RSS del proceso                         | 4.941.076 KiB, aproximadamente 4,71 GiB | Incluye compilación, setup y dos pruebas                                   |
| Bytecode desplegado del verificador generado |                        **47.163 bytes** | Solc 0.8.28, optimización 200, Cancun                                      |
| Gas EVM de esta variante                     |                           **No medido** | No se desplegó un contrato que excede EIP-170                              |

La máquina y dependencias son las del [primer experimento](../README.md), con `GOMAXPROCS=4`, límite blando Go de 5 GiB y sin GPU. Hubo tests de restricciones concurrentes durante parte del setup: no se aisló la máquina y estos tiempos no deben interpretarse como un benchmark controlado entre variantes.

**El verificador de 301 inputs públicos no cabe como contrato único bajo el límite de 24.576 bytes de [EIP-170](https://eips.ethereum.org/EIPS/eip-170).** El script compila, registra el tamaño y detiene la medición antes del despliegue. No relaja los límites para anunciar un gas aparente; el reporte registra cero tests EVM de esta variante y gas nulo. Los cuatro tests EVM del verificador del primer experimento siguen pasando con el script ampliado.

La variante compacta reduce los inputs a 13 en los tests, pero no tiene todavía clave de verificación generada: **no se ha demostrado su tamaño Solidity ni su gas**. Compactar no sustituye autenticar drand, ligar el ciphertext y completar age y las reglas.

Artefactos: [métricas Go](pairing-proof-results.json), [certificado de cápsula válida](pairing-proof.json), [certificado de cápsula manipulada](invalid-proof.json), [verificador generado](PairingVerifier.sol), [informe de tamaño EVM](evm-results.json). El nombre de archivo heredado `PairingVerifier` no significa que esta variante pruebe solo el pairing.

## Lo que falta para una misión

| Componente                                                             | Estado en esta fase                               |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| Pairing y cápsula KEM para el perfil de cuatro candidatos              | Relación implementada y contrastada con vectores  |
| Firma auténtica de quicknet, hash-to-G1 y ronda esperada               | Sigue fuera del circuito                          |
| Hash del ciphertext completo, parsing age/armor y enlace con la misión | Sigue fuera del circuito                          |
| HKDF, HMAC del header y ChaCha20-Poly1305 del payload age              | Sigue fuera del circuito                          |
| Decodificación del mensaje, compromiso y reglas de destino/cover/cargo | Sigue fuera del circuito                          |
| Dominio completo de formatos y rechazo verificable de basura           | Pendiente                                         |
| Restauración de llegada/orden y planificación de estado dependiente    | Prototipo separado; sin integración de producción |

Una firma inventada puede satisfacer el pairing y dar otro resultado de cápsula. Un tercero también puede presentar bytes que no pertenezcan al ciphertext de la misión. Por tanto, **ni siquiera un certificado válido de este circuito basta para cancelar una misión**. Falta cerrar ambas vinculaciones, además de las capas restantes.

Esta relación tampoco genera certificados de invalidez para U malformado, fuera del subgrupo o igual a infinito: exige puntos admitidos y prueba el resultado del chequeo rP dentro de ese dominio. El rechazo de esos otros formatos necesita una ruta verificable adicional; un fallo al construir el witness no la sustituye.

## Pros y contras encontrados

- Se avanzó de una operación algebraica aislada a la derivación y comprobación de la clave de tlock, usando el formato actual y vectores reproducibles.
- El circuito expresa un resultado de invalidez comprobable; no depende de interpretar un error de ejecución como prueba.
- Los bytes comprimidos y el orden de GT ya no quedan como supuestos externos a este componente.
- La relación crece aproximadamente un 56 % respecto del pairing aislado. El coste total aún puede crecer por las capas pendientes. Su interfaz de diagnóstico, con 301 inputs públicos, genera un verificador demasiado grande para desplegar; la variante compacta aún necesita una prueba y medición propias.
- El límite de rechazo ofrece una demostración práctica de una nueva causa posible de bloqueo si se integrase de forma ingenua.
- Cada circuito Groth16 requiere su setup; estos parámetros son locales de investigación y no constituyen una ceremonia utilizable en producción.
- El diseño sigue dependiendo de drand para abrir. ZK puede verificar la apertura, pero no garantizar que drand publique la firma ni que una transacción sea incluida.

## Reproducción

Desde la raíz del repositorio:

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/probe-h3-bound.ts
pnpm --filter @vendetta/web exec tsx scripts/experiments/export-capsule.ts
pnpm --filter @vendetta/web exec tsc --noEmit -p scripts/experiments/tsconfig.json

cd apps/web/scripts/experiments/opening-zk
GOMAXPROCS=2 GOMEMLIMIT=3GiB go test -v ./...
GOMAXPROCS=4 go build -o /tmp/vendetta-capsule-proof .
GOMAXPROCS=4 GOMEMLIMIT=5GiB /tmp/vendetta-capsule-proof --capsule \
  /ruta/al/repo/docs/benchmarks/timelock-opening/capsule-input.json \
  /tmp/vendetta-capsule-run
```

El runner hace un setup nuevo y genera dos pruebas con la misma clave: la cápsula del cliente y una cápsula V manipulada. Comprueba sus resultados y rechaza el bit de resultado falsificado. No debe confundirse esa clave con la del primer experimento.

Para comprobar el tamaño del contrato y medir la EVM solo si cabe, desde la raíz:

```bash
COMPONENT_GAS_BUDGET=4000000 SOLC_BIN=/ruta/a/solc-0.8.28 \
  pnpm --filter @vendetta/web exec tsx scripts/experiments/measure-opening-evm.ts \
  /tmp/vendetta-capsule-run \
  /ruta/al/repo/docs/benchmarks/timelock-opening/capsule-proof
```

El presupuesto de gas limita el trabajo del verificador incluso ante pruebas malformadas. Un revert o agotamiento de ese presupuesto rechaza la evidencia; no declara inválida la misión. El tercer argumento mantiene separados estos resultados y los del pairing aislado.

Fuentes primarias: [tlock-js](https://github.com/drand/tlock-js), versión instalada 0.9.0; [gnark v0.16.4](https://github.com/Consensys-Incorporated/gnark/tree/v0.16.4), especialmente `sw_bls12381`, `fields_bls12381.ToTower` y `sha2`. Los tiempos y ensayos indicados son mediciones locales.

## Continuación

El [bloque age y su vínculo con el hash del ciphertext](../age-circuit/README.md) ya se implementaron como restricciones contrastadas el 29 de octubre. La unión usa entradas empaquetadas, sin repetir aún un setup de una relación parcial. Esa fase no modifica las métricas de los certificados KEM archivados aquí.

La siguiente prioridad es autenticar quicknet y su ronda. También siguen pendientes el compromiso, el contexto/reglas de la misión y la cobertura de formatos y límites sin cancelar casos legítimos. La integración solo tiene sentido después de comprobar esas piezas juntas.
