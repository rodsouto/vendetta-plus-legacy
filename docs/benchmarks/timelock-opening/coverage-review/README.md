# Cobertura: revisión de Claude, correcciones y H3 paginado

Fecha: 2026-10-29. Continúa el [predicado canónico de misión](../mission-predicate/README.md). Esta fase revisa sus límites; no integra un nuevo protocolo de resolución.

## Feedback independiente

Se pidió una revisión de solo lectura a Claude mediante su CLI, con herramientas Read/Grep/Glob y sin edición ni ejecución de comandos. El modelo informado fue `claude-opus-5-5`. Se conservan la [respuesta original](../../../reviews/hidden-mission-resolution-claude-round3.md) y sus [metadatos y hashes del código anterior a las correcciones](../../../reviews/hidden-mission-resolution-claude-round3-metadata.json).

Claude no encontró un bug de falsa validez/invalidez en los circuitos que inspeccionó. **Eso no es una auditoría de solidez ni una prueba de ausencia de bugs.** Sí señaló una falsa invalidez en la referencia, un defecto fuera de dominio en el helper TS y una cobertura de formatos mucho más amplia que los dos ejemplos del informe anterior. La recomendación principal fue parar la multiplicación de perfiles por longitud y decidir el formato de los envíos futuros.

## Qué confirmé y corregí

| Hallazgo | Comprobación y acción |
| --- | --- |
| Ronda del ciphertext distinta de la esperada por el perfil | tlock-js puede abrir el ciphertext y el mensaje puede seguir siendo válido para el compromiso. `evaluateOpening` lo marcaba `invalid`. Ahora devuelve **unsupported**, sin reinterpretarlo como una misión válida bajo el perfil nuevo ni como basura. Se probaron rondas anteriores y posteriores. |
| Llegada no alineada con quicknet | Los contratos actuales comprueban un margen de llegada, no la igualdad con una ronda más 15 segundos. Se corrigió la caracterización: es una restricción del perfil, no una invalidez intrínseca del envío. La referencia devuelve **unsupported**. El circuito permanece limitado y no se cambió la admisión del contrato. |
| Palabras negativas o mayores que uint256 en `hiddenCommit` TS | El serializador podía perder un nibble o convertir un byte negativo: salt `2^256` aliasaba a `2^252`, y `-5` a `251`. Se añadió rechazo de palabras fuera de `[0,2^256)` antes del hash. Los hashes del dominio admitido se conservan; el máximo se contrastó con `cast abi-encode` y `cast keccak`. |
| Escalar H3 igual a cero | Se comprobó el gadget G2 aisladamente con 0, 1 y Fr−1 y con resultados falsificados. H3 puede aceptar el número cero; eso **no** hace válida la cápsula: rP debe coincidir con U no identidad. No se fingió encontrar una preimagen SHA cuyo resultado fuera cero. |

La corrección del helper TS alinea su serialización con el ancho de una palabra ABI; no convierte tipos más anchos en parámetros legales del contrato. Las colisiones observadas estaban fuera del dominio ABI, no eran colisiones de Keccak ni una divergencia demostrada en ejecuciones Solidity con argumentos legales.

Los contratos, la gracia, el keeper y la resolución de combates no cambiaron. Sí hay un endurecimiento del helper compartido de TypeScript. Pasaron 755 tests de reglas, 98 tests web con anvil y sin skips, las regresiones específicas, el typecheck experimental y las comprobaciones Go de los witnesses archivados y la llegada fuera del perfil.

## Dominio real: casos ejecutables

El [audit script](../../../../apps/web/scripts/experiments/audit-opening-domain.ts) ejecuta el decoder y tlock-js instalados, en Node, y guarda [domain-audit.json](../domain-audit.json):

- **27 mensajes**, 19 aceptados por el predicado actual. Los compromisos se ajustan a los valores realmente decodificados para aislar la semántica del parser; esto no demuestra una transacción de envío en cadena.
- **15 representaciones de archivo**, 12 descifrables con mensaje válido, incluyendo raw age, armor de otras anchuras, padding omitido, algunos CRLF, whitespace final, recipients adicionales, prefijos numéricos de ronda y una etiqueta de red que la biblioteca no comprueba.
- Un payload de más de 65 KiB con un elemento JSON extra ignorado: tlock-js abre varios chunks y el mensaje sigue siendo válido. El perfil de un único chunk no lo cubre.
- Los dos casos de política temporal anteriores, y las regresiones del serializador antes/después del guard.

La compatibilidad no se reduce a permitir espacios o ceros iniciales. `JSON.parse` seguido de `BigInt` admite números, strings con bases, arrays y booleanos en combinaciones concretas. Por ejemplo, `null` directamente falla, pero `[null]` y `""` producen salt cero; `true` produce uno, pero `[true]` falla. El literal JSON `9007199254740993` acaba como `9007199254740992`; un parser de números con precisión arbitraria no reproduciría ese resultado.

Estas son observaciones del runtime Node y las versiones fijadas, **no** una especificación aprobada para conservar todos esos comportamientos. No se comprobó todavía la equivalencia de los polyfills del navegador. Tampoco hay un máximo normativo explícito del lenguaje que pueda sustituirse por un límite del prover: los límites físicos de calldata/gas no son una política de formato versionada.

No cambié el decoder ni declaré inválidas sus variantes aceptadas. La referencia distingue ahora mejor «fuera de este perfil» de «datos inválidos».

## H3: qué se implementó y midió

Coincido con Claude en sacar la búsqueda H3 del SNARK cuando sus inputs ya son públicos después de la ronda. No hace falta una prueba ZK para convencer a la EVM de un SHA256 que puede calcular por sí misma.

El [prototipo Solidity aislado](../../../../apps/web/scripts/experiments/h3-stepper/H3Prefix.sol) procesa lotes consecutivos, con un máximo de 128 candidatos **por llamada**, no por misión. Mantiene el siguiente índice, no permite reiniciar ni mezclar el progreso de un contexto, y se detiene en el primer candidato menor que Fr. Replica los dos bytes little endian y el desplazamiento del primer byte de tlock-js, sin desplazar todo el digest.

El rango real de tlock-js 0.9.0 es **1..65534 inclusive**. Agotar un lote deja `COMPUTING`; solo recorrer el rango entero sin aceptar produce `EXHAUSTED`. Un fallo de ejecución no produce ningún resultado de invalidez. `ACCEPTED` con escalar cero se distingue de agotamiento y todavía requiere el chequeo de cápsula correspondiente.

**Límite de la evidencia:** la inicialización usa un admitter de prueba, no un verificador del vínculo entre `pre`, beacon y misión. El contrato no declara misiones válidas ni inválidas. Los circuitos existentes todavía calculan H3 con su límite de cuatro: **este módulo no les añadió automáticamente cobertura**. Falta separar/ligar la derivación de pre y el rP final, o definir una consulta verificable equivalente antes de aplicar un resultado a una misión. Ningún tercero puede ser autorizado a elegir un pre arbitrario para invalidar un envío.

**Restricción de privacidad comprobada después de la revisión:** publicar `pre` revela el escalar H3. Con ese escalar, la clave pública de drand, la ronda y el ciphertext se puede reconstruir el secreto de cifrado mediante `e(H(round), PK)^r`, sin firma del beacon. El [audit](../domain-audit.json) recupera el plaintext usando únicamente esos datos públicos y `pre`. Por tanto, no se debe publicar `pre` ni el escalar al enviar: la paginación pública debe ocurrir después de la apertura de la ronda. El stub no impone esa condición temporal ni autentica el origen de `pre`; no sirve como protocolo de admisión seguro.

Se pasó el caso real de cinco intentos: una llamada rechaza los primeros cuatro y otra acepta el quinto, con el mismo escalar que el vector Node. Nueve tests cubren también autorización de inicialización, rebind, presupuestos, recibos desconocidos, contextos separados, hash de contexto cero, aceptación de escalar cero y agotamiento exacto. El agotamiento total se fuerza con un mock; **no existe aquí una preimagen real que rechace 65534 SHA consecutivos**.

El [runner](../../../../apps/web/scripts/experiments/measure-h3-stepper.ts) compila con solc 0.8.28, optimización 200 y Cancun, y mide transacciones separadas en un anvil efímero privado:

| Operación | Gas de transacción local |
| --- | ---: |
| Rechazar los primeros cuatro candidatos | 33.997 |
| Aceptar el quinto en otra transacción | 53.287 |
| Procesar los cinco en una transacción | 57.419 |
| Inicialización del recibo de prueba | 113.906 |

El bytecode del módulo tiene 1.940 bytes. Los [resultados](../h3-stepper-results.json) separan estos recibos de las mediciones dentro de los tests. El workload de 128 rechazos que conserva los SHA usa un override de prueba; no es un caso real encontrado por búsqueda. Estos números **no** incluyen verificar una apertura ZK, la integración de Game, la frontera, precios ni un despliegue Gnosis. El coste del peor caso y la economía del protocolo completo siguen sin medirse.

Se utiliza `sha256` estándar de Solidity, no un precompilado especial de Gnosis ni EIP-2537. Esta es la interpretación aplicable a la prohibición de dependencias específicas de cadena en B-01; no se modificó esa regla.

## En qué discrepo de Claude

1. **No tomaría «inviable en Groth16» como resultado demostrado.** Ampliar manualmente perfiles de longitud es una mala dirección para compatibilidad general, pero no se midió un parser universal, una ruta segmentada ni una zkVM. No hay una prueba de imposibilidad de R1CS.
2. **78⁴ no es un mínimo de circuitos que haya que desplegar.** Ilustra la explosión del diseño por formas para ciertos datos inválidos; los destinos válidos están acotados por el mapa y un diseño universal puede evitar enumeración. La conclusión útil es cambiar la estrategia, no fijar ese número como cota del protocolo.
3. **No acepto el supuesto de que un atacante no pueda forzar más de 13–14 intentos H3.** No hay un benchmark GPU que lo sostenga y la corrección debe cubrir el rango real, no un tope considerado difícil. El prototipo paginado evita depender de esa estimación.
4. **«Coste bajo» de un codec nuevo solo puede ser relativo al parser.** Fijar el formato simplifica cobertura, pero no elimina BLS, KEM, AEAD, pruebas, invalidación de puntos ni la integración histórica. La medición H3 tampoco es el coste de toda la solución.
5. **Los negativos existentes no eran solo cambios del bit Valid.** Ya había sustituciones de contexto, ciphertext, firma y geometría. Aun así, coincido en que tests de witnesses concretos no prueban solidez global: falta análisis de subrestricción y fuzzing diferencial/adversarial.

Coincido con la recomendación importante: **no seguir invirtiendo en perfiles aislados sin decidir qué dominio se debe admitir**. Una zkVM puede resultar mejor para compatibilidad amplia, pero habría que medirla y congelar la semántica, no asumir que un parser Rust genérico equivale al JavaScript actual.

## Decisión de arquitectura pendiente

| Opción | Qué conserva | Qué falta demostrar |
| --- | --- | --- |
| Compatibilidad completa del formato actual | Representaciones actualmente válidas, con la semántica acordada del keeper | Parser completo, bytes/UTF-8/base64, números/coerciones, límites verificables y coste; una zkVM merece un spike comparativo |
| Codec v2 solo para envíos futuros | La garantía de no cancelar envíos válidos ya admitidos; v1 necesita su ruta correspondiente | Especificación total y admisión versionada, no una redefinición retroactiva de v1; formatos fijos, certificados de cada clase de basura y coste completo |

**Recomendación:** redactar un codec futuro fijo y compararlo con una ruta de compatibilidad antes de elegir el backend final. No he cambiado el formato de los envíos ni la política del contrato. No hay que justificar una migración diciendo que los paquetes v1 válidos fuera del perfil son basura.

También debe cerrarse la opción de aborto del remitente: una revelación que solo abre el compromiso no puede saltarse el criterio de validez del ciphertext y competir con un certificado de invalidez. Si la validez completa ya quedó probada al enviar, la preimagen puede bastar bajo esa garantía previa; si no, la preimagen es información, y ejecutar efectos debe esperar un criterio común. «Gana la primera transacción» no resuelve el problema y permite elegir entre combatir o abortar. No se implementó aquí esa política.

## Siguiente secuencia recomendada

1. Fijar especificación, versión/admisión y un criterio único para revelación e invalidez; comparar el alcance de v1 y de un codec futuro. Mantener explícitas las garantías y los límites que nunca habilitan una cancelación.
2. Según esa decisión, cerrar el parser/casos malformados, conectar H3 total y verificar una prueba completa con vectores adversarios, tamaño EIP-170 y gas. La paginación local no sustituye el enlace autenticado de su estado.
3. Solo después, prototipo integrado de simulador y Solidity con la frontera, contexto desde storage y pruebas diferenciales de caídas/orden original. No hay plan de despliegue en esta fase.

## Reproducción

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/audit-opening-domain.ts
SOLC_BIN=/ruta/a/solc-0.8.28 pnpm --filter @vendetta/web exec tsx scripts/experiments/measure-h3-stepper.ts
pnpm --filter @vendetta/rules test
PATH=/ruta/a/foundry:$PATH pnpm --filter @vendetta/web test
```

El runner H3 usa un anvil hijo propio y lo detiene al acabar. Las fuentes principales son el código instalado de tlock-js 0.9.0, el decoder del repositorio, la [revisión original](../../../reviews/hidden-mission-resolution-claude-round3.md) y la [documentación de funciones criptográficas de Solidity](https://docs.soliditylang.org/en/v0.8.28/units-and-global-variables.html#mathematical-and-cryptographic-functions). Las cifras de gas y las aceptaciones son comprobaciones locales posteriores al feedback, no resultados ejecutados por Claude.

## Continuación: eliminar el inicializador de confianza

El [experimento de composición KEM/H3](../paginated-kem/README.md) sustituye la asociación temprana a una misión por una caché genérica indexada por `pre`. El verificador final debe comprobar tanto el resultado del paginador como el vínculo criptográfico de esa misma entrada. Esto evita que un tercero fije arbitrariamente el `pre` de una misión. La restricción de privacidad anterior sigue vigente; la caché tampoco autentica por sí sola el beacon o el contexto.
