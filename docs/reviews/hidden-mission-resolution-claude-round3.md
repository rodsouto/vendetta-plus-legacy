# Revisión independiente del prototipo de misiones ocultas (solo lectura)

**Qué revisé:** los 4 documentos, `mission.go`, `mission_input.go`, `mission_test.go`, `beacon.go`, `capsule.go`, `capsule_compact.go`, `capsule_age.go`, `age.go`, `opening.ts`, `hidden.ts` (rules y web), `missions.ts`, y de tlock-js `ibe.js`, `armor.js`, `age-reader-writer.js`, `age-encrypt-decrypt.js`, `stream-cipher.js` y `timelock-decrypter.js`. No ejecuté nada, así que todo lo que digo sale de leer el código.

**Resumen:** no encontré ningún bug que admita falsa validez o falsa invalidez en los circuitos. Sí hay una falsa invalidez en la referencia `opening.ts` y una falta de cobertura por perfiles que es mucho mayor de lo que dicen los documentos. Mi recomendación es parar de añadir perfiles por longitud y decidir antes el codec.

## 1. Hallazgos

### Lo que comprobé y no encontré roto (en el circuito)
- **uint256 y decimales** (`mission.go:95-130`). Usa tres limbs de 96 bits, con el arrastre limitado a 100 bits y el arrastre final igual a 0. Así no hay reducción módulo BN254. `Domain` exige que los bits 256-287 sean cero. `Word[0]/Word[1]` se reparten bien en alto y bajo. Se rechazan los ceros iniciales.
- **Clipping de la geometría** (`mission.go:199-220`). `safe = Select(inRange, w[1], 1)` solo sirve para que exista un witness. `targetOK` y `Domain` siguen entrando en el AND final. `gridPoint` coincide con `gridPosition` (`map.ts:19-27`): fila y columna quedan determinadas de forma única. La equivalencia `round(√n) ≤ c ⇔ n ≤ c²+c` es correcta para `roundSqrt` (`math.ts:25-27`). Recortar el cover a 2048 es exacto, porque n vale como máximo 849²+749² ≈ 1,28 M, menos que 2048².
- **Gating cuando falla AEAD** (`age.go:230-243`, `mission.go:179-184`, `248`). `HeaderValid` y `PayloadValid` se calculan, no son flags libres. Si `CryptoValid=0`, el resultado es `Valid=0`, como en tlock-js, donde cualquier fallo de KEM, MAC o STREAM lanza una excepción. El nonce, los contadores de ChaCha, el bloque de longitudes de Poly1305 y el primer `---` como límite del MAC coinciden con `age-encrypt-decrypt.js:49-58`. El armor canónico reproduce el comportamiento real de `encodeArmor` (`armor.js:14` nunca añade el salto extra).
- **Contexto, ronda y llegada** (`mission.go:54-79`, `244-247`). La ronda del contexto coincide con la del header y con la de la firma, y el hash del contexto con el del ciphertext reconstruido. No se usa "now" en ningún punto.
- **BLS** (`beacon.go:33-72`). DST de G1, `SHA256(uint64_be)`, comprobación de subgrupo y de no identidad, y clave y generador fijados como constantes. La firma usada es la misma variable que la del KEM.

### H-1. Falsa invalidez en la referencia
- **Dónde:** `opening.ts:311-312` clasifica `wrong-ciphertext-round` como `invalid`.
- **Por qué es falso:** tlock-js descifra cualquier ronda ya pasada (`timelock-decrypter.js:46-59`) y el keeper la revela (`hidden.ts:110`).
- **Contraejemplo:** un ciphertext para la ronda R−1 con el compromiso correcto hoy se resuelve como válido.
- **Circuito:** no tiene witness (`capsule_age.go:107-122`, `mission.go:244`), así que el circuito está bien.
- **Problema:** la referencia redefine en silencio datos válidos como inválidos. Es justo la operación que rechazáis para el JSON.

### H-2. Falta de witness no cuantificada, y riesgo de bloqueo permanente
Un mensaje auténtico y canónico pero fuera de rango solo se puede invalidar si existe el perfil `(PlainLength, len×4)` correspondiente.
- **Contraejemplos sin certificado:** city=`"123"` sin perfil compilado, kind `10`, o un decimal de 79 dígitos (`canonicalDecimal` entra en panic si hay más de 78, `mission.go:96`).
- **Tamaño:** solo para el formato canónico hacen falta unas 78⁴ ≈ 3,7·10⁷ formas.
- **Llegadas no alineadas:** `sendHiddenMission` acepta cualquier llegada dentro del margen (`missions.ts:520-523`), pero `mission.go:78` exige alineación. Esa misión no tiene witness, ni válido ni inválido.
- **Consecuencia:** con frontera y sin timeout, **cada clase de basura sin certificado congela el mundo para siempre**. Los documentos tratan la cobertura casi solo como "no cancelar válidos", pero es igual de bloqueante para el progreso.

### H-3. El dominio admitido es infinito, no "dos casos"
Contraejemplos que el decoder actual acepta como válidos:
- **Mensaje:**
  - `decodeHiddenPlain` (`hidden.ts:19-31`) acepta `[1,5,5,5,7]` con números en vez de strings.
  - Salt 0 se puede escribir como `""`, `[]`, `[null]` o `false`; salt 1 como `true`.
  - También acepta `"0x7"`, `" 7 "`, `"+7"`, kind `1.0` o `1e0`, y elementos extra de cualquier longitud.
- **age/tlock:**
  - La chain hash del stanza no se verifica (`timelock-decrypter.js:45`).
  - `parseInt` acepta `"01000"`, `"1000abc"` y `"0x3e8"` (línea 71).
  - Se admiten stanzas extra (línea 33) y base64 laxo (`Buffer.from`).
  - El tamaño de W (la longitud del fileKey) puede ser distinto de 16.
- **Bytes:** `fromHex(c,"string")` decodifica UTF-8 con pérdida (`hidden.ts:104`).
- **Inferencia no verificada:** el `Buffer` de Node y el polyfill del navegador pueden discrepar en base64 no canónico. Si es así, la "semántica real" ni siquiera es una sola función.

### H-4. Código de producción del simulador TS (no del prototipo)
`hiddenCommit` (`missions.ts:482-489`) no es inyectivo fuera de uint256:
- Con salt=2²⁵⁶ salen 65 caracteres hex y `match(/../g)` descarta el último. Resulta igual a salt=2²⁵².
- `-5n` se codifica igual que `251`.

La referencia filtra el dominio antes de llamar a esta función (`opening.ts:252-258`), así que el prototipo no está afectado. Pero el simulador TS y Solidity divergen, lo que rompe el invariante 8.

### H-5. Hueco en la evidencia, no un bug
Los tests negativos (`mission_test.go:61-66`, `151`) solo invierten `Valid` sobre el witness honesto. Que "no exista ningún witness" lo argumenta el diseño, no lo comprueba ningún test. Falta análisis de subrestricción y fuzzing diferencial.

### H-6. Puntos menores no verificados
- No comprobé que `cmp.IsLessOrEqual` compare sobre el campo completo: el sandbox no me dio acceso a la caché de módulos de Go.
- `ScalarMul` de G2 con r=0 y la completitud de gnark para escalares límite tienen probabilidad despreciable, pero su semántica tiene que estar definida. noble lanza excepción con r=0, así que el resultado sería inválido.

## 2. ¿El alcance está caracterizado con honestidad?

En general sí. Las cifras coinciden con los JSON: 751.791, 834.993, 5.499.827 y 5.701.020 restricciones, 26 vectores y 8 manipulaciones. No se atribuye gas a ningún circuito sin medir. Hay cuatro afirmaciones que van más allá de la evidencia:
- **"Dos casos que la referencia considera válidos quedan fuera"** sugiere un hueco pequeño. Es un dominio no acotado (H-3).
- **"La relación cubre un perfil canónico"** son en realidad dos formas unidas de entre unos 10⁷ posibles.
- **"Rechaza un resultado que intentaría declararla inválida"** describe un witness concreto que falla, no la inexistencia de cualquier witness (H-5).
- **La "llegada inconsistente"** se presenta como un error de contexto, cuando el contrato actual admite esas misiones (H-2).

## 3. Cómo cerrar la cobertura

| | Compatibilidad con el decoder actual | Cierre de la invalidez | Coste y riesgo |
|---|---|---|---|
| **(a)** Perfiles R1CS universales + parser compatible | Requiere replicar en R1CS `JSON.parse`, la conversión decimal a binary64, `ToPrimitive`, `StringToBigInt`, base64 laxo y UTF-8 con pérdida, todo con longitud no acotada | Inviable en Groth16; quizá con folding, como investigación | Muy alto |
| **(b)** zkVM | Posible si se congela una semántica normativa, por ejemplo la del keeper en Node, y se demuestra equivalencia con fuzzing diferencial contra tlock-js | Completo, con longitud variable y el bucle H3 entero | Moderado o alto, sin medir. El witness es público tras la ronda, así que externalizar el proving no filtra nada. El verificador usa precompilados BN254 estándar |
| **(c)** Codec v2 solo para envíos futuros | **No es compatible**: redefine la validez de los nuevos envíos y el usuario debe decidirlo | Cerrable por construcción | Bajo |

**Mi recomendación es (c), si el usuario la acepta de forma explícita:**
- El contrato recibe campos estructurados: U(96), V(16), W(16), MAC(32), nonce(16), ct(N fijo), tag(16).
- El contrato deriva la ronda desde una llegada que obliga a estar alineada, e impone las longitudes.
- El plaintext tiene longitud fija.
- El armor/age es una función determinista fuera de la cadena, y tlock-js sigue descifrando, porque v2 es un subconjunto de lo que produce tlock.
- Las únicas invalideces que necesitan prueba son criptográficas: U inválido (fuera de la curva, del subgrupo o identidad), fallo de rP, MAC, AEAD, predicado y agotamiento de H3. Basta con un circuito de forma fija, un circuito para "U malo" y H3 en la cadena (ver punto 4).
- Las misiones v1 en vuelo terminan con las reglas v1. Si se aplica (c), (b) solo haría falta para las misiones v1 que sigan pendientes, que son un conjunto finito.

**¿Se está invirtiendo demasiado en circuitos específicos?** Sí. Cada nuevo perfil por longitud no cierra nada, y la decisión entre (b) y (c) cambia la forma de todos los circuitos.

## 4. Hipótesis H3 por lotes (no implementada)

**Como relación es correcta.** j* = min{i∈[1,65534] : cᵢ < Fr} o ⊥ es una función determinista de pre, y los lotes contiguos con acumulador `(statement, pre, versión, next)` reconstruyen exactamente j* o ⊥. ⊥ corresponde a la excepción real de `ibe.js:150`, que hoy ya da inválido.

**Lo que falta para cubrir todo el dominio:**
1. **Separar el circuito.** La apertura publica pre y los flags de age y mensaje sin calcular H3, y un circuito de rP toma r como input público. Hoy `capsule.go:111-152` mezcla las dos cosas.
2. **Definir r=0** como inválido.
3. **Recordar el límite:** esto solo resuelve H3. Los formatos (H-2 y H-3) y el U inválido siguen abiertos.

**Los lotes no necesitan ZK.** Una vez publicado pre, que tras la ronda es dato público, cada candidato es un SHA256 de 34 bytes. El contrato lo puede comprobar con el precompilado 0x02, que es estándar en EVM; queda por confirmar que encaja con B-01. Hacerlo paginado, con `nextIndex` guardado en storage, ya es el acumulador.

**Economía (estimaciones, sin medir):**
- La probabilidad de rechazo por candidato es q ≈ 0,094, así que lo esperable son unos 1,1 candidatos.
- Forzar j=k le cuesta al atacante unos q^−(k−1) hashes. Con una GPU, en la práctica no pasa de k≈13-14.
- Agotar los 65534 candidatos es inalcanzable. Aun así la ruta existe, con un coste del orden de decenas de millones de gas en lotes.

**Conclusión:** mejor un bucle en la cadena que recursión o una zkVM solo para H3.

## 5. Dónde discrepo de la dirección actual

1. **Exigir compatibilidad con el decoder actual para envíos futuros** no se sigue del objetivo: la validez de v2 puede definirse antes de enviar. Además, la referencia ya redefine la ronda autorizada y la alineación (H-1, H-2). Hay que decidirlo de forma explícita y coherente.
2. **La cobertura de la basura es tan crítica como la de los válidos.** Cualquier clase sin certificado detiene el mundo para siempre.
3. **H3 no debería estar dentro del SNARK.**
4. **Hacen falta evidencias de solidez**, no solo tests de witness.
5. **Queda abierta la opción del remitente:** con un ciphertext basura y un compromiso válido, puede elegir entre revelar o dejar que se pruebe la invalidez. Eso es abortar a voluntad, y hay que fijar una política (propuesta, línea 270).

**Secuencia propuesta:**
- **Hito 1 — decisión y especificación.** Si se elige (c): un clasificador total v2 sin el resultado "unsupported", la política para v1 en vuelo, la política de reveal contra invalidez, y fuzzing diferencial contra tlock-js en Node y en el navegador. Si se elige (b): un spike de zkVM con la semántica congelada, midiendo ciclos, tiempo de proving y gas en el peor caso.
- **Hito 2 — certificados de forma fija.**
  - Circuitos: apertura que publica pre, rP con r público, y certificado de U malo.
  - En la cadena: H3 con el precompilado SHA256.
  - Verificación: Groth16 real, verificador por debajo de EIP-170, gas medido y análisis de subrestricción.
- **Hito 3 — prototipo integrado, todavía no producción.** Simulador y Solidity con frontera, contexto construido desde storage y verificador versionado por misión. Pruebas diferenciales con cada clase de basura y con caídas. Sin plan de despliegue hasta que estén completas la cobertura y el certificado.
