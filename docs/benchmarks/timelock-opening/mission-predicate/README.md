# Predicado de misión y contexto unidos a la apertura

Fecha: 2026-10-29. Continúa la [apertura con quicknet autenticado](../beacon-auth/README.md) y la [propuesta de resolver misiones sin caducidad por revelación](../../../proposals/hidden-mission-resolution.md).

## Resultado y alcance

Se implementó la unión de la apertura autenticada con el mensaje canónico, su compromiso y sus reglas de tipo, destino, cover y cargo. Un digest liga también cadena, contrato, identificador de misión, propietario, origen, llegada original, ronda, ciphertext y versión de reglas.

La relación acepta la misión válida archivada y rechaza un resultado que intentaría declararla inválida. También se comprobaron ciphertexts completos para transporte con cargo, destino igual al origen, ataque con cargo y salt máximo de uint256. Los archivos sintéticos fueron descifrados con tlock-js y contrastados con la referencia Node antes de probar sus restricciones.

**Esta fase resolvió restricciones y witnesses; no generó un nuevo certificado Groth16, setup ni verificador Solidity, y no midió gas.** La relación cubre un perfil canónico, no todos los envíos admitidos por el código actual. Los límites de H3, los formatos alternativos y las rutas para datos malformados siguen pendientes. No se modificaron contratos, keeper, gracia ni orden de ejecución en producción.

## Vinculación del contexto

El [código](../../../../apps/web/scripts/experiments/opening-zk/mission.go) comprueba el mismo digest que `statementDigest` de la referencia. Su preimagen tiene 20 palabras ABI, 640 bytes:

- Dominio, chain ID, dirección del juego e identificador de misión.
- Digest de la etiqueta de protocolo/reglas, propietario y coordenadas del origen.
- Cover, cuatro importes de cargo, llegada original y ronda.
- Identidad de quicknet, hash de su clave pública, compromiso y hash del ciphertext.

Cada palabra uint256 se conserva como dos mitades de 128 bits. El hash público también utiliza dos palabras de 128 bits: **no se reduce ni el digest ni los enteros módulo BN254**. Se comprueba el padding ABI de la dirección, y se fijan dominio, versión/reglas y parámetros de quicknet.

La llegada está limitada a uint64 y la ronda al rango del cliente JavaScript. Se exige `genesis + (round−1)·period = arrival + 15`, con los parámetros actuales, y que esa ronda y ese ciphertext sean exactamente los usados por la apertura. **No se reemplaza arrival por now ni se introduce un vencimiento por tardanza.**

El circuito no lee el estado de la cadena. Al integrarlo, el contrato tendrá que reconstruir este digest desde los datos auténticos de la misión y compararlo con el input público; no puede aceptar un digest arbitrario del llamante. Las pruebas de cambiar propietario, cadena, contrato o misión conservando el digest original se rechazan. Un contexto distinto con su digest recalculado describe otra declaración, no una autorización para modificar la misión original.

## Mensaje y reglas

El perfil reconstruye exactamente el formato del cliente: `[kind,"city","neighborhood","slot","salt"]`, con un dígito de tipo y decimales sin signo ni ceros iniciales salvo el propio cero. Los dígitos son witness, pero sus bytes deben coincidir con el plaintext autenticado.

Se comprueba:

1. Tipo entero entre 1 y 4 y valores dentro de uint256.
2. El Keccak de las seis palabras completas de `hiddenCommit`: propietario, tipo, tres coordenadas y salt.
3. Coordenadas en el mapa actual, distintas del origen.
4. Distancia redondeada dentro del cover.
5. Cargo únicamente para `TRANSPORT`, código 3.

La conversión decimal usa tres limbs de 96 bits y arrastres comprobados: no acumula el número completo en un campo que podría reducirlo silenciosamente. Así distingue un salt de otro que difiera en el módulo BN254, admite `2^256−1` y rechaza el resultado válido para `2^256`. También se rechaza una coordenada mayor que uint256 aunque su truncamiento caiga dentro del mapa y coincida con el compromiso. La geometría puede usar valores auxiliares acotados fuera de dominio, pero nunca sustituye el chequeo del entero completo. Un salt mayor que el módulo del campo se acepta con su compromiso correcto y se rechaza si intenta reutilizar el compromiso del salt reducido. También se probaron owner y cargo por encima del campo para detectar alias numéricos; algunos son casos sintéticos de representación, no estados que necesariamente pueda alcanzar el juego.

El perfil fija mapa 50×50, 255 slots, 17 columnas y 15 filas, contrastados con las reglas exportadas y su digest. La geometría reproduce la disposición de `gridPosition`. Para enteros no negativos se utiliza la equivalencia exacta `round(sqrt(n)) ≤ cover ⇔ n ≤ cover² + cover`; la unidad de distancia se cancela en ambos lados. Se probaron expresamente las dos diagonales a ambos lados del cover 1. El cover grande se recorta solo para el cálculo geométrico a un valor superior a cualquier distancia del mapa; sus 256 bits originales siguen formando parte del digest.

Estas reglas reproducen el predicado de revelación investigado, no simulan la batalla, vacaciones, propiedad posterior del destino ni las dependencias históricas del mundo. Eso corresponde al planificador y al motor del juego.

## Rechazo criptográfico y mensajes fuera del perfil

`MissionOpeningCircuit` obtiene `CryptoValid` de los resultados reales de KEM, HMAC y tag bajo el beacon autenticado; no es un flag elegido por el host. La validez final exige ese resultado y el predicado del mensaje.

Si falla la autenticación criptográfica, no hace falta interpretar los bytes descifrados como JSON para producir el resultado falso. Se comprobó un cuerpo manipulado cuyos bytes no forman el mensaje canónico: con su propio contexto/hash, el circuito admite el resultado de invalidez y rechaza el válido. Esto evita que exigir el parseo de basura bloquee esa ruta.

En cambio, un beacon falso sigue sin poder producir un witness de la apertura, cualquiera que sea el resultado final que solicite. Tampoco se puede usar el hash de otro ciphertext para invalidar la misión original.

**El parseo completo sigue sin estar cubierto cuando el ciphertext es criptográficamente auténtico.** El decodificador actual también admite, entre otras cosas, elementos JSON adicionales y strings numéricos con ceros iniciales. Dos casos que la referencia considera válidos quedan fuera del perfil canónico y no admiten witness ni para declararlos válidos ni para declararlos inválidos. No se cambió su validez en el juego.

Por tanto, la ausencia de witness no puede convertirse en cancelación. Faltan un parser verificable compatible con el dominio admitido o una decisión explícita sobre formato/versionado, además de las rutas para los otros datos malformados. El límite experimental de cuatro candidatos H3 tampoco se resolvió aquí: la cápsula legítima de cinco candidatos sigue necesitando cobertura.

## Evidencia

Los [26 vectores de mensaje/contexto](../mission-input.json) comparan el ABI y su digest con la referencia existente. Incluyen:

- 23 casos canónicos, con su resultado correcto y el resultado opuesto falsificado.
- Dos JSON válidos para el decoder actual pero no soportados por este perfil.
- Una llegada fuera de la alineación del perfil: ambas afirmaciones se rechazan, sin certificado de invalidez del ciphertext. El Game actual puede admitir llegadas no alineadas dentro de sus márgenes; es una limitación experimental, no una regla actual de invalidez.
- Ocho manipulaciones adicionales de contexto, bytes, empaquetado y geometría.

Los vectores de mensaje son pruebas de ese componente; no todos tienen un ciphertext cifrado correspondiente. Separadamente, los [cuatro casos cifrados](../mission-encrypted-input.json) sí incluyen cuerpo, claves y mensaje completos, descifrados con tlock-js y evaluados con `evaluateOpening`. Se usa la cápsula archivada y salts de payload deterministas distintos: son fixtures públicas de investigación, no envíos de producción.

La unión se comprobó además con el archivo real, compromiso o propietario incorrectos, digest o ciphertext de contexto sustituidos y llegada alterada. Los casos de beacon falso y ciphertext ajeno se vuelven a rechazar incluso cuando se intenta publicar directamente el resultado final de misión inválida.

| Perfil                                                   | Restricciones | Inputs públicos | Evidencia                               |
| -------------------------------------------------------- | ------------: | --------------: | --------------------------------------- |
| Mensaje/contexto aislados, 19 bytes                      |       751.791 |               6 | Comparación de validez y manipulación   |
| Mensaje/contexto, salt máximo, 96 bytes                  |       834.993 |              10 | Uint256 completo, sin reducción         |
| Apertura autenticada + contexto + mensaje de 19 bytes    |     5.499.827 |              48 | Witness y restricciones de la unión     |
| Misma unión con salt máximo y mensaje de 96 bytes        |     5.701.020 |              56 | Ciphertext completo e interoperabilidad |
| Proving / verificador Solidity / gas de estas relaciones |    No medidos |               — | Sin nuevo setup ni certificado          |

Los [resultados JSON](../mission-predicate-results.json) separan las comprobaciones de restricciones de la generación de una prueba. El digest de reglas fijado se contrasta con los datos actuales; cambiar reglas exige versionar la relación y conservar soporte para misiones pendientes, no actualizar constantes de forma que pierdan su validez anterior.

## Pros, contras y trabajo pendiente

La unión ya liga desde quicknet y el ciphertext hasta los campos y el compromiso de una misión canónica. Las regresiones cubren tanto una falsa declaración de validez como una falsa declaración de invalidez sobre los casos soportados. El contexto conserva la llegada original y no depende del momento de generación de la prueba.

La relación crece hasta unos 5,7 millones de restricciones en el caso de salt máximo. Los inputs públicos todavía incluyen datos de diagnóstico y su número cambia con la longitud. No hay medición del verificador resultante y estos recuentos no permiten anunciar un gas o tiempo completo.

El esquema de investigación instancia perfiles por longitudes del mensaje, de sus campos y de la ronda. Distintas formas pueden requerir circuitos y claves diferentes; no se ha construido un circuito universal ni un registro de verificadores de producción. También hay que resolver ese diseño antes de convertir los perfiles probados en un protocolo utilizable.

Siguen pendientes:

- Cobertura de H3, formatos, longitudes, chunks y mensajes malformados o no canónicos. Un caso fuera del perfil nunca se cancela por timeout o error del prover.
- Una relación/protocolo con dominio admitido cerrado y verificable, no solo perfiles de investigación.
- Generación de la prueba completa y verificación EVM, con medidas de recursos, tamaño, gas y rechazo de evidencia manipulada.
- Construcción del contexto desde el contrato, selección/versionado del verificador y validaciones del ciclo de vida de la misión.
- Integración con la frontera y el planificador para conservar la ejecución en llegada/orden originales, sin que acciones posteriores alteren el resultado histórico.

El siguiente trabajo debe cerrar la cobertura de los casos fuera del perfil antes de presentar este prototipo como solución general o integrar cancelaciones. El objetivo sigue siendo resolver cualquier misión válida admitida; los límites de la herramienta no pueden redefinirla como basura.

## Reproducción

Desde la raíz:

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/export-mission.ts
pnpm --filter @vendetta/web exec tsc --noEmit -p scripts/experiments/tsconfig.json

cd apps/web/scripts/experiments/opening-zk
GOMAXPROCS=4 GOMEMLIMIT=6GiB go test -run '^TestMission(Message|Context)' -v
GOMAXPROCS=4 GOMEMLIMIT=8GiB go test -run '^TestMissionOpeningCircuit' -v
GOMAXPROCS=4 GOMEMLIMIT=8GiB go test -run '^TestMissionEncryptedOpeningCircuit' -v
```

Estos comandos no ejecutan un setup Groth16. Las fuentes principales son el [codec actual](../../../../packages/rules/src/hidden.ts), el [compromiso y revelación](../../../../packages/rules/src/sim/missions.ts), la [distancia](../../../../packages/rules/src/map.ts), la [raíz redondeada](../../../../packages/rules/src/math.ts) y la [referencia de apertura](../../../../apps/web/scripts/experiments/opening.ts).
