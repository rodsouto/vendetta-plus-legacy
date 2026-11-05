# Autenticación de quicknet unida a la apertura

Fecha: 2026-10-29. Continúa el [circuito age y el hash del ciphertext](../age-circuit/README.md), dentro de la [propuesta de resolución sin caducidad por revelación](../../../proposals/hidden-mission-resolution.md).

Continuación disponible: [predicado de misión y contexto](../mission-predicate/README.md). La relación posterior añade compromiso, reglas y datos inmutables para el perfil canónico. Este informe conserva el alcance y recuentos del componente de apertura autenticada anterior.

## Resultado

Se implementó la autenticación de la firma de quicknet para la ronda del encabezado y se unió al circuito KEM/age. **La regresión de la firma falsa sobre el ciphertext original ahora se rechaza en la relación autenticada.** También se rechaza una firma auténtica de otra ronda.

La firma, la ronda y el hash del archivo ya no son afirmaciones independientes: la firma autenticada es exactamente la usada por KEM, y la ronda autenticada es la que aparece en el encabezado reconstruido y hasheado.

**La evidencia de esta fase son restricciones y witnesses comprobados, no una nueva prueba Groth16.** No se ejecutó otro setup, no se generó un verificador Solidity ni se midió gas. El compromiso y las reglas de la misión, su contexto de ejecución y la cobertura completa de formatos/límites siguen pendientes. No se modificó producción y este componente aún no autoriza cancelaciones.

## Relación criptográfica

El [código](../../../../apps/web/scripts/experiments/opening-zk/beacon.go) fija en el circuito la clave pública de quicknet y utiliza su esquema `bls-unchained-g1-rfc9380`:

1. Exige una ronda positiva y la representa como `uint64` big endian, sin truncar sus bits altos.
2. Calcula `m = SHA256(uint64_be(round))`.
3. Calcula `H = hash_to_G1(m)` mediante el gadget RFC 9380 de gnark, con el DST exacto `BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_`.
4. Exige que la firma esté en el subgrupo G1 y sea distinta de la identidad.
5. Comprueba `e(signature, G2) · e(H, −PK_quicknet) = 1`.
6. En el componente aislado, liga las coordenadas de la firma con sus 48 bytes comprimidos y su signo. Esos bytes se empaquetan en tres palabras de 128 bits.

No se usa el esquema de firma en G2 ni el DST POP de otras variantes BLS. Tampoco se acepta del prover un punto hash-to-curve precalculado sin ligarlo a la ronda.

El generador G2, la clave y sus líneas de pairing precomputadas son **constantes calculadas al compilar**; no son witness aportado por el usuario. La clave fijada se decodifica y comprueba también nativamente. Cambiar de red o de clave exigiría otro circuito/versionado; no es un parámetro libre de la prueba.

El campo JSON `randomness` del API no es un input de este circuito: la apertura tlock utiliza la firma, no ese campo redundante. El exportador calcula `SHA256(signature)` para contrastar los vectores con la referencia Node. Esta relación autentica la firma para la ronda; no certifica otros metadatos arbitrarios de una respuesta HTTP.

## Unión con el descifrado

`AuthenticatedOpeningCircuit` llama al verificador de quicknet con **las mismas variables** de firma y ronda utilizadas por `CapsuleAgeCircuit`. Después exige toda la relación anterior: cápsula, clave compartida, HMAC, payload, header canónico y hash del ciphertext completo.

No introduce un flag que permita responder «misión inválida porque me dieron una firma inválida». Un beacon no autenticado hace que **no exista witness de esta relación**, independientemente de los flags de KEM/header/payload que intente publicar el prover. Un fallo al construir una prueba tampoco constituye una evidencia de invalidez.

Con una firma auténtica, sí se pueden comprobar los resultados de autenticación de los datos admitidos en el perfil: por ejemplo, un MAC manipulado y un payload todavía auténtico, o un tag de payload alterado. Esos flags describen fallos criptográficos del ciphertext vinculado, pero su consumo por el juego sigue requiriendo cerrar el contexto y las reglas restantes.

La ronda pública queda vinculada al header y a la firma. **Todavía falta ligarla a la ronda esperada de la misión y a su llegada original**, además del chain ID, contrato, propietario, compromiso y versión de reglas. Autenticar la ronda suministrada no autoriza al llamante a elegir otra ronda para una misión.

## Evidencia

Los [vectores](../beacon-input.json) se generan sin HTTP, con los beacons archivados de las rondas 1000 y 1001:

- Ambas firmas auténticas se aceptan.
- Intercambiar sus rondas se rechaza en ambos sentidos.
- Negar una firma, usar otro punto de G1 o utilizar la identidad se rechaza.
- Sustituir los bytes comprimidos, exceder 128 bits en su empaquetado, exceder 64 bits en la ronda o usar ronda cero se rechaza.

La [comparación nativa](../../../../apps/web/scripts/experiments/opening-zk/beacon_test.go) comprueba que Go y Noble coinciden en los bytes de la ronda, su SHA256, las dos coordenadas de hash-to-G1 y el resultado BLS. Esto contrasta el esquema real de quicknet, no solo puntos generados por el propio circuito.

En la relación unida se comprobaron nueve casos: el ciphertext real; MAC, ciphertext, tag y salt alterados; la firma falsa de la regresión; una firma auténtica de otra ronda; sustitución del plaintext; y sustitución del hash del ciphertext.

| Relación                                                  | Restricciones | Inputs públicos | Evidencia                                                  |
| --------------------------------------------------------- | ------------: | --------------: | ---------------------------------------------------------- |
| Autenticación de quicknet aislada                         |     1.257.811 |               4 | Dos casos aceptados y nueve rechazados en restricciones    |
| KEM + age + hash, sin beacon, fase anterior               |     3.756.467 |              45 | Perfil de referencia previo                                |
| Apertura con beacon autenticado                           |     4.813.028 |              45 | Cinco casos admitidos y cuatro rechazados en restricciones |
| Proving / verificador Solidity / gas de la nueva relación |    No medidos |               — | Sin nuevo setup ni certificado                             |

Los cinco casos admitidos de la apertura incluyen manipulaciones cuyo resultado criptográfico correcto es un flag falso: «restricciones satisfechas» no significa que el ciphertext ni la misión se hayan declarado válidos. La autenticidad del beacon, en cambio, es obligatoria para cualquiera de esos resultados.

Los recuentos están archivados en [beacon-auth-results.json](../beacon-auth-results.json). No deben sumarse tiempos de proving de componentes anteriores ni extrapolar gas desde el número de restricciones. Los inputs empaquetados se mantienen, pero todavía no se ha generado ni medido el verificador de esta relación.

## La regresión que se cerró

El [vector de la fase anterior](../age-unauthenticated-input.json) conserva los bytes y el hash de una misión legítima. Una firma negada, válida como punto de G1 pero no como firma de quicknet, deriva otra clave; los flags KEM/header/payload resultan falsos. El componente sin autenticación puede satisfacer esos resultados y por ello no servía como certificado de invalidez.

Ese componente se conserva como experimento para documentar su límite. **El wrapper autenticado rechaza exactamente el mismo vector.** La referencia Node ya lo clasificaba como `untrusted / unauthenticated-beacon`; ahora esa condición también se exige dentro de la nueva relación de restricciones.

Esto cierra una vinculación pendiente del prototipo; no es una corrección de una ruta de cancelación desplegada, porque ninguna de estas relaciones se ha integrado en el contrato del juego.

## Pros, contras y pendientes

- La autenticidad de la clave de apertura deja de depender de que el host o keeper haya verificado correctamente un JSON. La relación liga la firma a su ronda y a los datos que descifra.
- Una firma falsa ya no puede usarse para justificar flags de invalidez sobre un ciphertext legítimo en este wrapper.
- El circuito crece hasta unos 4,81 millones de restricciones para el ejemplo pequeño de 19 bytes. El tiempo completo de proving, memoria y gas siguen sin medirse.
- La clave de quicknet queda fijada. Cualquier migración debe versionar la relación sin dejar sin soporte misiones pendientes de una versión anterior.
- La autenticación no garantiza que drand publique una firma, que haya capacidad del prover o que una transacción sea incluida. Estas demoras no habilitan una cancelación.
- Se mantienen el límite experimental de cuatro candidatos H3, el perfil de age de un único chunk y los tamaños/formato canónicos de la fase anterior. El caso legítimo que necesita cinco candidatos sigue fuera de ese perfil y **no se convierte en inválido**.
- Faltan el compromiso y las reglas de la misión; la llegada/orden originales y el contexto esperado; la cobertura de formatos y datos malformados; y finalmente una prueba completa verificada en EVM antes de integrar.

## Próximo bloque

Ligar el plaintext y los datos inmutables de la misión: propietario, compromiso, tipo, destino, salt, cover y cargo, con dominio de cadena/contrato/misión y versión de reglas. La ronda esperada debe quedar ligada a la política temporal de esa misma misión, conservando el orden y llegada originales.

Los envíos que no entren en el perfil de prueba necesitan una ruta definida: ampliar la relación o fijar y verificar un formato admitido al aceptar el envío. La falta de witness y los límites del prover nunca sustituyen un certificado de invalidez.

## Reproducción

Desde la raíz:

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/export-beacon.ts
pnpm --filter @vendetta/web exec tsc --noEmit -p scripts/experiments/tsconfig.json

cd apps/web/scripts/experiments/opening-zk
GOMAXPROCS=4 GOMEMLIMIT=4GiB go test -run '^TestQuicknetBeacon' -v
GOMAXPROCS=4 GOMEMLIMIT=6GiB go test -run '^TestAuthenticatedOpeningCircuit' -v
```

Las ejecuciones de esta fase usaron Go 1.27.3 y las versiones de gnark/gnark-crypto ya fijadas en el módulo. Los comandos resuelven restricciones; no ejecutan `groth16.Setup` ni generan pruebas. No se repitió un setup de una relación parcial.

Fuentes primarias: [criptografía de drand](https://docs.drand.love/docs/cryptography/), [gnark v0.16.4: hash-to-G1](https://github.com/Consensys-Incorporated/gnark/blob/v0.16.4/std/algebra/emulated/sw_bls12381/map_to_g1.go), y [tlock-js](https://github.com/drand/tlock-js), versión instalada 0.9.0 y sus parámetros de quicknet. Los resultados numéricos son comprobaciones locales.
