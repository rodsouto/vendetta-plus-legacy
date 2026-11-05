# KEM con H3 paginado y vínculo verificable

Fecha: 2026-10-29. Continúa la [revisión de cobertura](../coverage-review/README.md). El objetivo es eliminar el límite artificial de cuatro intentos sin introducir confianza en quien publica la entrada H3. Es un componente experimental: no cambia contratos de juego, keeper ni reglas de resolución.

## Composición

El [circuito](../../../../apps/web/scripts/experiments/opening-zk/capsule_paginated.go) conserva el pairing, la codificación comprimida, H2, recuperación de sigma y clave, H4 y el chequeo `rP == U`. Expone además `pre = SHA256("IBE-H3" || sigma || key)` y el escalar `r` en dos palabras de 128 bits cada uno. El rango de ambas palabras y `r < Fr` se restringe dentro del circuito. Son 17 entradas públicas y 2.139.405 restricciones.

La [composición Solidity](../../../../apps/web/scripts/experiments/h3-stepper/PaginatedKEM.sol) consulta una instancia propia del paginador y exige exactamente el mismo `pre` y escalar aceptado, antes de verificar la prueba. No permite saltar rechazos ni elegir un candidato posterior al primero aceptado. Una caché sin terminar no es un resultado falso ni una invalidez certificada.

La caché se indexa por `pre`, sin asociarse a una misión. Cualquiera puede iniciarla y pagar su cálculo; repetir `begin` conserva el progreso. No se necesita que un admitter confiable seleccione el `pre` de una misión. Entradas arbitrarias crean resultados aislados que no sirven para otra entrada. El vínculo se comprueba al final, no se da por hecho al inicializar.

**La prueba aislada no es suficiente:** con escalar cero y resultado falso puede satisfacer el circuito aunque el H3 real sea otro. Hay un test que lo demuestra y otro que comprueba que la composición EVM lo rechaza. Publicar o usar el verificador sin esta comprobación permitiría falsas invalidaciones.

## Privacidad y alcance

Publicar `pre` revela `r` y permite descifrar con la clave pública y la ronda, sin firma del beacon, como demuestra el [audit de privacidad](../domain-audit.json). Los keepers deben obtenerlo después de la apertura. La caché genérica no tiene un reloj ni promete secreto: un remitente que ya conoce su mensaje puede revelarlo voluntariamente, igual que mediante una revelación explícita. Nunca debe añadirse `pre` al envío como si fuera un compromiso inocuo.

El componente sigue sin autenticar la firma contra la identidad/ronda de drand, sin comprobar age y sin evaluar el mensaje ni el contexto de misión. Que `check` devuelva `false` certifica únicamente el resultado KEM bajo la firma aportada; **no autoriza a cancelar una misión**. La relación completa debe ligar beacon, bytes del ciphertext y contexto inmutable con estas mismas entradas. El agotamiento de los 65534 candidatos también necesita una rama específica ligada al `pre`; este circuito exige un escalar aceptado y no cubre esa rama.

## Validación y reproducción

Las pruebas de restricciones incluyen los cuatro vectores KEM anteriores, el envío válido de cinco intentos y el que usa indebidamente un candidato posterior. Para cada uno se prueba también la afirmación opuesta. Se rechazan `pre` sustituido, palabras de más de 128 bits y escalar fuera de Fr. Se conservan las pruebas de los certificados archivados y la regresión del circuito compacto anterior.

Desde `apps/web/scripts/experiments/opening-zk`, usando el Go fijado en el manifiesto:

```sh
go test -run '^(TestCompactCapsuleCircuit|TestPaginatedCapsuleCircuit|TestArchivedCapsuleWitnessMatchesNodeVectors)$' -v .
go run . --paginated-capsule ../../../../../docs/benchmarks/timelock-opening/capsule-input.json ../../../../../docs/benchmarks/timelock-opening/paginated-kem
```

Desde la raíz, con Foundry y solc 0.8.28 disponibles:

```sh
SOLC_BIN=/ruta/a/solc-0.8.28 pnpm --filter @vendetta/web exec tsx scripts/experiments/measure-paginated-kem.ts
```

El setup es local, aleatorio y exclusivamente de investigación. No reutilizar sus claves para producción. Los tiempos y resultados de la generación se registran en `metrics.json`; el runner EVM produce `evm-results.json` después de comprobar pruebas reales. No confundir gas de una función de test completa con gas de una transacción de producción.

## Resultados medidos

Se generaron dos pruebas Groth16 reales bajo un mismo setup: el KEM válido de cinco intentos y una cápsula inválida. Ambas se verificaron en Go y en EVM, ligadas a su prefijo calculado. El resultado público alterado y la prueba alterada se rechazan. Pasaron **10 tests EVM sin skips**: seis de composición con verificador stub y cuatro con el verificador Groth16 real. El stub no se presenta como evidencia criptográfica.

| Medida | Resultado |
| --- | --- |
| Restricciones del KEM paginado | 2.139.405 |
| Entradas públicas | 17 |
| Bytecode desplegado del verificador | 8.712 bytes, dentro de EIP-170 |
| Prueba Solidity serializada | 384 bytes |
| Setup local | 342,04 s |
| Generación válida / inválida | 16,80 / 18,48 s |
| Verificación nativa válida / inválida | 2,94 / 3,60 ms |

Estos tiempos corresponden a Go 1.27.3, gnark 0.16.4 y GOMAXPROCS=16. No son mediciones del navegador ni una comparación controlada con el benchmark anterior que usó cuatro procesadores.

Una prueba con una coordenada alterada hizo que el precompilado consumiera casi todo el gas reenviado. Se añadió un presupuesto de **2.000.000 gas** a la llamada del verificador y una regresión que exige rechazar esa prueba consumiendo menos de 2.100.000 gas en la llamada a la composición. Las pruebas válidas siguen pasando. Este presupuesto es experimental para este verificador, no un presupuesto ya validado para el circuito de misión completo.

## Vínculo dentro del perfil de misión

Se añadió también el [wrapper de misión paginada](../../../../apps/web/scripts/experiments/opening-zk/mission_paginated.go), que pasa el mismo `pre` y escalar por la relación de beacon autenticado, KEM, age, mensaje y contexto existentes. Compila a **5.343.281 restricciones y 52 entradas públicas** para el perfil canónico de 19 bytes. Se comprobaron seis witnesses: misión válida, rechazo de una falsa invalidez, compromiso incorrecto realmente inválido, sustitución de `pre`, sustitución del digest de contexto y ronda incorrecta.

**Esta evidencia es de restricciones, no de una nueva prueba Groth16 de misión.** El verificador EVM anterior tiene 17 entradas y comprueba solamente el componente KEM; no puede verificar el wrapper de 52. Tampoco se exportó un mensaje completo cifrado con cinco candidatos para este wrapper: el vector de cinco se probó criptográficamente en el componente KEM. Las restricciones de formato, llegada y reglas del perfil anterior permanecen. Para usarlo en el juego falta un verificador/consumidor de misión con su esquema exacto, además de resolver la cobertura del dominio.

La relación original conserva su entrada `Define` y usa la ruta anterior cuando no se suministra H3 externo. Se verificó también la regresión de misión original tras el refactor.

## Pros, costes y siguiente integración

- El trabajo H3 se reparte en llamadas de hasta 128 candidatos sin límite artificial de cuatro. Un tercero puede continuar el trabajo anterior.
- Se evita un verificador por longitud de búsqueda y la confianza en un inicializador. Las 17 entradas también evitan exponer cientos de coordenadas como entradas públicas.
- Hay más transacciones y almacenamiento público, y sigue haciendo falta un prover disponible. No existe garantía de ejecución sin alguien que pague gas.
- El vínculo completo todavía debe incorporarse al circuito de beacon/age/misión y a un consumidor que preserve el orden histórico. Este componente no resuelve por sí solo los formatos JSON/age admitidos actualmente.

Antes de tocar la admisión del juego, hay que fijar el dominio de mensajes de la relación completa y demostrar recuperación y resolución con un ataque retrasado. El repositorio indica que aún no hubo despliegues: se puede diseñar un codec explícito para futuros envíos sin exigir compatibilidad con mundos anteriores, pero debe actualizarse coordinadamente el cliente, helper, keeper, especificación y contratos. Hasta esa integración, un formato fuera del perfil sigue siendo `unsupported`, nunca una cancelación por timeout.

Continuación actual: [certificado completo v2 medido](../mission-v2-proof/README.md) y [rama independiente de U inválido](../invalid-point/README.md). Los resultados de esta página corresponden a su fase original.
