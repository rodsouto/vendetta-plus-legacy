# Descifrado age y vínculo con el ciphertext completo

Fecha: 2026-10-29. Continúa la [cápsula tlock](../capsule-proof/README.md) dentro de la [propuesta para resolver misiones válidas sin caducidad](../../../proposals/hidden-mission-resolution.md).

Continuación disponible: [autenticación de quicknet unida a la apertura](../beacon-auth/README.md). El wrapper posterior exige la firma auténtica para la ronda y rechaza la regresión de firma falsa descrita aquí. Este informe conserva las restricciones y límites del componente anterior, que sigue siendo útil para reproducir esa diferencia.

## Resultado

Se implementaron y contrastaron las restricciones para derivar las claves age, autenticar el encabezado, descifrar el payload y comprobar su tag. Se unieron al circuito compacto de la cápsula, compartiendo la clave y reconstruyendo el encabezado y el archivo cifrado canónico. Su Keccak coincide con el hash del ciphertext real archivado.

**Esta fase valida restricciones y witnesses. No generó un nuevo setup, prueba Groth16 ni verificador Solidity; no midió proving ni gas.** Las pruebas criptográficas de la fase anterior siguen siendo exclusivamente de su relación KEM. No se puede trasladar su coste al circuito ampliado.

La apertura verificable de una misión sigue incompleta: **falta autenticar la firma de drand para su ronda y comprobar el compromiso y las reglas de la misión**. Tampoco se ha completado la cobertura de formatos y rutas de invalidez. No cambian los contratos, los plazos actuales ni el keeper.

## Qué se implementó

El [bloque age](../../../../apps/web/scripts/experiments/opening-zk/age.go) expresa:

- HKDF-SHA256 para la clave de autenticación del encabezado: salt vacío e info `header`.
- HMAC-SHA256 sobre los bytes exactos del encabezado, incluido `---`.
- HKDF-SHA256 para la clave del payload, con el salt de 16 bytes del cuerpo e info `payload`.
- ChaCha20 de 20 rondas, con el nonce del primer y último chunk age y contador 1 para el mensaje; el bloque de contador 0 produce la clave Poly1305.
- Poly1305 con clamping de r, módulo `2^130−5`, padding y longitudes AEAD little endian; el tag final se reduce módulo `2^128`.
- La igualdad entre los bytes descifrados y los bytes de salida, además de los dos resultados booleanos exactos de autenticación.

Los flags del encabezado y del payload son independientes. El bloque puede comprobar, por ejemplo, un MAC de encabezado alterado con un payload todavía auténtico. **Los bytes descifrados con un tag incorrecto no constituyen un mensaje válido**. La futura relación de una misión debe exigir autenticación y validación de reglas antes de ejecutar ese mensaje.

La [unión con KEM](../../../../apps/web/scripts/experiments/opening-zk/capsule_age.go) añade:

1. Igualdad de la clave derivada por tlock y la utilizada por age.
2. Reconstrucción del encabezado: versión, stanza tlock, round decimal canónico, hash de quicknet, cápsula codificada en base64 sin padding y saltos de línea de 64 columnas.
3. Igualdad de todos los bytes del encabezado reconstruido con el encabezado autenticado.
4. Reconstrucción del archivo: encabezado, MAC en base64, cuerpo binario y armor con su padding y saltos de línea, tal como lo produce el cliente actual.
5. Keccak256 del archivo armored completo, igual al hash público. Sus 32 bytes se conservan como **dos valores de 128 bits**, sin reducir el digest módulo BN254.

Todos los grupos empaquetados están limitados a 128 bits y el relleno de los grupos incompletos debe ser cero. La ronda se recompone desde dígitos decimales sin ceros iniciales y se limita al rango seguro del cliente JavaScript, `1..2^53−1`. Esto liga el número al encabezado, **no autentica todavía la firma como firma de esa ronda**.

## Validación

Los [18 vectores](../age-input.json) incluyen el archivo real, alteraciones de header, MAC, ciphertext, tag, salt y clave, y plaintexts de longitudes 0, 1, 15, 16, 17, 63, 64, 65, 95, 128 y 256 bytes. Los tamaños cruzan las fronteras de bloques Poly1305 y ChaCha20.

El [exportador](../../../../apps/web/scripts/experiments/export-age.ts) compara la apertura de referencia con crypto nativo de Node, y el [test Go](../../../../apps/web/scripts/experiments/opening-zk/age_test.go) comprueba independientemente HKDF, HMAC y ChaCha20-Poly1305 con las bibliotecas nativas de Go. El armor reconstruido del caso real debe ser idéntico al producido por tlock-js 0.9.0, no solo dar el mismo plaintext.

Las restricciones aceptan los 18 resultados esperados y rechazan sus **36 flags de autenticación falsificados**. También rechazan una salida de plaintext falsa, padding no nulo e inputs empaquetados que exceden 128 bits. Poly1305 se contrasta adicionalmente con el vector publicado en RFC 8439; base64 se contrasta con la implementación estándar de Go.

La unión acepta el caso real y los resultados de las alteraciones admitidas en ese perfil. Rechaza mezclar claves, cápsula y header, cambiar la ronda del header, sustituir el hash, conservar el hash original tras alterar el cuerpo/MAC, falsificar flags y descartar bits altos del empaquetado. Se cubrieron sus 14 subtests en ejecuciones del mismo circuito.

| Relación / perfil                                                      | Restricciones | Inputs públicos | Evidencia de esta fase               |
| ---------------------------------------------------------------------- | ------------: | --------------: | ------------------------------------ |
| Age, mensaje real de 19 bytes y header de 278 bytes                    |       983.508 |              29 | Witness y restricciones contrastados |
| Age, payload de 256 bytes                                              |     1.036.498 |              57 | Witness y restricciones contrastados |
| KEM + age + header canónico + hash del ciphertext, mensaje de 19 bytes |     3.756.467 |              45 | Witness y restricciones contrastados |
| Proving, verificador Solidity y gas del circuito ampliado              |    No medidos |               — | Sin nuevo setup ni certificado       |

Los [resultados JSON](../age-circuit-results.json) conservan los recuentos de todos los perfiles y separan explícitamente estas comprobaciones de la generación de una prueba criptográfica. El test de la unión usa cuatro candidatos H3, como el experimento anterior; **ese límite continúa siendo insuficiente para cubrir todas las cápsulas válidas**.

## Regresión de la autenticación que falta

Se archivó un [vector de frontera](../age-unauthenticated-input.json) que mantiene **exactamente el ciphertext y su hash originales**, pero sustituye la firma por otro punto válido de G1 que no es una firma de drand autenticada. Con ese punto, el pairing deriva otra clave y los chequeos KEM/header/payload dan falsos. El componente aún puede satisfacer esas restricciones porque todavía no contiene el verificador de beacon.

El [test](../../../../apps/web/scripts/experiments/opening-zk/capsule_age_test.go) hace explícita esa limitación. **No es una prueba de invalidez de la misión**: demuestra por qué los flags de este componente no autorizan una cancelación, incluso después de ligar el hash completo. La referencia Node ya rechaza ese beacon como `untrusted / unauthenticated-beacon`, y no como ciphertext inválido. No se detectó ni introdujo aquí una ruta nueva de cancelación en producción.

Antes de interpretar un fallo criptográfico como evidencia de invalidez hay que autenticar su material de apertura. El siguiente bloque prioritario es cerrar la firma de quicknet y su ronda dentro de la relación verificable.

## Límites que se conservan

- Solo se reconstruye el formato canónico del cliente actual: una stanza tlock, quicknet, claves de 16 bytes y un único chunk final. El circuito age admite payloads de 0 a 256 bytes y headers de hasta 4096; cada longitud identifica un perfil. La unión se contrastó con header de 278 bytes y mensaje de 19.
- Otros tamaños, armor con whitespace alternativo, múltiples chunks o stanzas, números de ronda con otra longitud y otros formatos válidos no han quedado cubiertos por estas ejecuciones. No deben declararse inválidos por no caber en el perfil del experimento.
- Un header no canónico o un U malformado pueden impedir construir el witness. Eso **no produce por sí solo un certificado de invalidez**; falta cubrir explícitamente esas rutas o fijar un formato admitido verificable al enviar.
- Agotar H3, carecer de drand o sufrir un fallo del prover tampoco permite cancelar. El caso legítimo de cinco candidatos de la fase anterior sigue siendo una regresión obligatoria.
- Faltan la autenticidad del beacon, el compromiso, el contexto de cadena/contrato/misión/reglas, la decodificación del mensaje y sus reglas de destino, cover y cargo. Tampoco se ha integrado el resultado con la frontera y el orden original de ejecución.
- Los 45 inputs públicos son un perfil de investigación, no una interfaz final. No se ha generado su clave de verificación ni medido su tamaño Solidity; no se afirma todavía que el verificador completo quepa o tenga un gas determinado.

## Pros y contras encontrados

Se cerró el vínculo entre la cápsula, la clave, el encabezado, el payload y el hash del archivo. Los chequeos ya no son únicamente dos programas independientes que podrían hablar de datos distintos. Los límites de empaquetado y los casos de manipulación están probados.

El coste crece: la unión tiene unos 3,76 millones de restricciones para el mensaje pequeño del ejemplo. La mayor parte del nuevo bloque age procede de hashes y autenticación; esa cifra no predice por sí sola el tiempo de proving ni el gas. Además, implementar las primitivas como restricciones exige pruebas y revisión propias: la interoperabilidad observada no constituye una auditoría.

El perfil canónico simplifica la vinculación de bytes, pero impide presentar esta relación como un parser general de age. Hay que resolver esa cobertura antes de prometer progreso para cualquier envío admitido.

## Reproducción

Desde la raíz:

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/export-age.ts
pnpm --filter @vendetta/web exec tsc --noEmit -p scripts/experiments/tsconfig.json

cd apps/web/scripts/experiments/opening-zk
GOMAXPROCS=4 GOMEMLIMIT=4GiB go test -run 'Test(Age|Poly1305|CapsuleAge|CanonicalCapsuleBase64)' -v
```

Este comando resuelve restricciones; no ejecuta un setup ni genera una prueba Groth16. Se mantiene la decisión de completar las vinculaciones de la relación antes de repetir el setup de una variante parcial.

Fuentes primarias: [RFC 5869, HKDF](https://datatracker.ietf.org/doc/html/rfc5869), [RFC 8439, ChaCha20 y Poly1305](https://www.rfc-editor.org/rfc/rfc8439), y [tlock-js](https://github.com/drand/tlock-js), versión instalada 0.9.0, especialmente `age/armor`, `age/age-reader-writer` y `age/utils-crypto`. Los recuentos y resultados son mediciones y pruebas locales.
