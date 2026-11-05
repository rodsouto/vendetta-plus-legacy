# Codec fijo para futuras misiones ocultas

Fecha: 2026-10-29. Continúa [KEM con H3 paginado](../paginated-kem/README.md).

## Decisión de implementación experimental

Preparar un codec binario explícito para envíos futuros, manteniendo los algoritmos de tlock/age existentes. El repositorio declara que aún no se desplegaron mundos. No necesitamos reproducir para un protocolo nuevo todas las coerciones de JSON.parse/BigInt, variantes de armor o cantidades de chunks del decoder anterior.

Esto **no cambia todavía la admisión ni el cliente de producción**. Los mensajes del formato anterior conservan su ruta actual; no se permite aceptar un envío bajo una versión y cancelarlo después por interpretarlo bajo otra. El contrato futuro deberá fijar versión, contexto y hash de bytes al enviar. No habrá fallback entre versiones.

El objetivo sigue siendo resolver cualquier ataque válido como si se hubiera revelado a tiempo. Un formato finito permite especificar su dominio completo; no garantiza todavía la cobertura de todas las formas de basura criptográfica ni la disponibilidad del prover.

## Mensaje: 37 bytes

| Offset | Bytes | Campo |
| --- | --- | --- |
| 0 | 1 | Versión del mensaje, exactamente 2 |
| 1 | 1 | Kind, uint8 |
| 2 | 1 | City, uint8 |
| 3 | 1 | Neighborhood, uint8 |
| 4 | 1 | Slot, uint8 |
| 5 | 32 | Salt, uint256 big endian |

No hay texto, coerciones numéricas, campos ignorados ni sufijos. Un kind de 255 o una city de 0 se pueden representar, pero el predicado de misión los declara inválidos; codificación y validez son conceptos distintos. Los valores válidos usan kind 1–4 y los límites del ruleset fijado. Las coordenadas válidas actuales caben en uint8, igual que su almacenamiento Solidity. Un mapa futuro que requiera más bits necesitará otra versión.

El salt conserva sus 256 bits, incluidos valores por encima del campo BN254. El compromiso sigue siendo Keccak de las seis palabras ABI completas de owner, kind, city, neighborhood, slot y salt. Se evita reducir palabras módulo el campo de la prueba.

## Paquete: 273 bytes

| Offset | Bytes | Campo |
| --- | --- | --- |
| 0 | 4 | Magic ASCII `VDH2` |
| 4 | 32 | Hash exacto de quicknet |
| 36 | 8 | Ronda big endian, entre 1 y 2^53−1 |
| 44 | 128 | Cápsula IBE: U(96), V(16), W(16) |
| 172 | 32 | MAC age del header canónico |
| 204 | 69 | Payload age: salt(16), ciphertext(37), tag(16) |

Una sola forma de paquete representa cualquier mensaje del dominio. Longitudes distintas, otra cadena, ronda cero o fuera del dominio entero exacto de tlock-js y otra versión se rechazan en la admisión futura, antes de crear una misión. Que estos chequeos pasen **no** prueba validez del cifrado.

Se reconstruye un header age de **290 bytes**. Su ronda siempre tiene 16 dígitos decimales, con ceros iniciales, y la cápsula usa base64 sin padding con líneas de 64 caracteres. Los bytes reconstruidos se autentican mediante el MAC age normal. La ronda de 16 dígitos elimina perfiles según la longitud del número; no se aceptan otras representaciones del header.

Para interoperar con tlock-js, el adaptador reconstruye armor desde los campos del paquete. **El hash ligado a la misión es Keccak de los 273 bytes del paquete**, no del armor reconstruido. La identidad del contexto cambia a `VENDETTA_OPENING_V2`, conservando los restantes campos de contexto y el pin del ruleset. La llegada/ronda también deben quedar comprobadas por la admisión del protocolo futuro; no se reinterpretan llegadas anteriores que el Game actual admite.

## Criptografía y evidencia

El [encoder experimental](../../../../apps/web/scripts/experiments/codec-v2.ts) genera una clave y salt aleatorios y cifra IBE usando únicamente clave pública y ronda: no recibe firma de drand ni consulta un beacon. Conserva IBE-H2/H3/H4, HKDF, HMAC-SHA256, ChaCha20-Poly1305 y el nonce final de age. Publicar `pre`, r o la clave al enviar sigue estando prohibido por su efecto sobre la confidencialidad.

Se usa la implementación interna `encryptOnG2RFC9380` del tlock-js instalado. Es una dependencia interna que habrá que encapsular y fijar antes de integrar. El adaptador actual usa APIs Node; todavía no demuestra funcionamiento del nuevo sender en navegador.

Los [vectores](vectors.json) se generan de forma determinista a partir de cápsulas archivadas de investigación. Se comprueba interoperabilidad nativa para mensajes válidos y para contenido semánticamente inválido; para MAC o tag dañados se exige que tlock-js rechace. No son datos ni secretos de jugadores.

El [circuito v2](../../../../apps/web/scripts/experiments/opening-zk/mission_v2.go) liga el beacon auténtico, KEM con H3 externo, age, hash del paquete, dominio v2 y el predicado de misión. Comparte el predicado semántico con la relación anterior, que conserva su ruta y esquema. Una sola forma debe cubrir salt pequeño y máximo, kind fuera del dominio, compromiso incorrecto, MAC/tag dañados y versión de mensaje incorrecta. La composición final también debe exigir el prefijo H3 exacto; el verificador KEM de 17 entradas del paso anterior no verifica este circuito de misión.

## Resultados de esta fase

Pasaron **45 tests web** (9 nuevos del codec y 36 de la referencia anterior), el typecheck experimental y **25 comprobaciones de witness** del circuito v2. Los nueve vectores se prueban con la afirmación correcta y la opuesta; otras siete mutaciones comprueban sustitución de entrada H3, contexto, hash y ronda, bits altos, padding y reutilización del dominio v1 con un digest recalculado correctamente. La regresión de misión anterior también pasó, conservando 5.499.827 restricciones y 48 entradas públicas.

El perfil v2 compila a **5.139.537 restricciones y 55 entradas públicas**. El mismo circuito procesa el mensaje de salt máximo y la misión completa que necesita cinco candidatos H3, incluyendo beacon, age, predicado y contexto. Los resultados se conservan en [results.json](results.json). En esta fase inicial no se generó la prueba ni se midió su gas. La [continuación con certificado completo medido](../mission-v2-proof/README.md) ya incluye ambas mediciones para los casos de apertura y compromiso inválido.

## Lo que todavía falta antes de admitirlo

1. Conectar a Game la [rama independiente de U inválido, ya medida en Groth16 y EVM](../invalid-point-proof/README.md), junto a la apertura completa. Las pruebas de restricciones cubren flags, no canonicidad, falta de raíz, identidad y subgrupo incorrecto. Comprobar solo magic y longitud en la admisión dejaría un bloqueo.
2. Integrar la política de agotamiento H3 del nuevo consumidor: recibo EXHAUSTED para el mismo `pre`, escalar placeholder cero y resultado inválido. Se comprobó mediante mocks y restricciones; no hay un vector SHA real que agote los 65534 candidatos.
3. Integrar en Game el certificado y consumidor de misión ya medidos con 55 entradas, junto al consumidor de invalidez de punto ya medido. Los prototipos siguen sin ejecutar efectos del juego.
4. Integrar admisión, conservación de datos, resolución histórica, simulador, cliente, keeper e indexación, y hacer verificables todas las rutas de revelación bajo un criterio común. Nada de «gana la primera transacción» para elegir combatir o abortar.

## Pros y contras

- Un formato y un tamaño cubren todos los valores válidos actuales, sin aumentar perfiles por longitud de salt, ronda, JSON o chunks. El paquete evita el overhead de armor en calldata.
- La interoperabilidad usa los algoritmos existentes y se comprueba contra la librería nativa; no se propone reemplazar drand por ZK.
- Se añade un adaptador de serialización/encriptado que mantener y revisar. La reconstrucción del header y las APIs internas necesitan pruebas de interoperabilidad permanentes.
- La decisión restringe envíos futuros a una codificación exacta y un mapa de coordenadas uint8. No ofrece compatibilidad universal con todos los archivos que el decoder anterior puede abrir.
- El formato fijo no resuelve el coste del pairing, la disponibilidad de drand/prover, el agotamiento H3 ni el orden histórico por sí solo.

## Reproducción

Desde la raíz:

```sh
pnpm --filter @vendetta/web exec vitest run test/codec-v2.test.ts
pnpm --filter @vendetta/web exec tsx scripts/experiments/export-codec-v2.ts
pnpm --filter @vendetta/web exec tsc --noEmit -p scripts/experiments/tsconfig.json
```

Desde `apps/web/scripts/experiments/opening-zk`, con el Go fijado en el manifiesto:

```sh
GOMAXPROCS=4 go test -run '^(TestMissionV2Circuit|TestMissionOpeningCircuit)$' -v .
```

Continuación actual: [certificado completo v2 medido](../mission-v2-proof/README.md) y [rama independiente de U inválido](../invalid-point/README.md). Los resultados de esta página corresponden a su fase original.
