# Apertura posterior verificable: predicado y coste del componente ZK

Estado actual: [v2 única desde la inicialización](v2-only/README.md). La activación opcional y el motor v1 descritos en las fases históricas fueron eliminados; los resultados de cada fase conservan su alcance original.

**Estado actual:** ya se midió un [certificado Groth16 completo del codec v2](mission-v2-proof/README.md), con 55 entradas públicas y verificación real en EVM. La [rama independiente de U inválido](invalid-point-proof/README.md) también tiene certificados Groth16 reales medidos en EVM. Sigue pendiente la integración con Game. Las secciones siguientes conservan el benchmark inicial y sus limitaciones históricas.


Fecha: 2026-10-28. Investigación que complementa la [propuesta de misiones ocultas](../../proposals/hidden-mission-resolution.md) y el [planificador de referencia](../resource-frontier/README.md).

Continuación: [cápsula tlock ligada al pairing](capsule-proof/README.md). Amplía la relación con H2/H3/H4, bytes comprimidos y la comprobación `U = r·G2`; también documenta un caso legítimo que agota el límite de candidatos del experimento. Este documento conserva las mediciones del primer circuito. La prueba completa de una misión sigue pendiente.

Fase del 29 de octubre: [descifrado age y hash del ciphertext completo](age-circuit/README.md). Une KEM, HKDF, HMAC, ChaCha20-Poly1305 y la reconstrucción canónica del archivo en restricciones contrastadas con vectores. Todavía no generó una nueva prueba Groth16: siguen pendientes la autenticidad del beacon y el predicado de la misión, además de la cobertura de formatos y límites.

Continuación de esa fase: [quicknet autenticado dentro de la apertura](beacon-auth/README.md). La nueva relación de restricciones verifica la firma para la ronda del header y rechaza la regresión de la firma falsa sobre el ciphertext original. Esa vinculación ya está implementada y contrastada en el wrapper nuevo; siguen pendientes el contexto/compromiso/reglas de la misión, la cobertura de perfiles y un certificado completo medido en EVM.

Fase siguiente: [predicado de misión y contexto](mission-predicate/README.md). La unión ya comprueba compromiso, reglas de revelación y contexto para el mensaje canónico, con casos cifrados de 19 y 96 bytes y enteros uint256 completos. Continúa siendo evidencia de restricciones, sin nueva prueba Groth16 ni integración. El trabajo pendiente principal es cubrir los casos fuera del perfil sin convertir límites del prover en cancelaciones.

## Resultado y límite principal

Se construyeron dos piezas distintas:

1. **Un predicado completo en Node para el perfil de ciphertext soportado**, con autenticación de la ronda de drand, apertura de tlock/age y validación de la misión. Los 24 vectores tienen la clasificación esperada y la apertura positiva coincide con `tlock-js`.
2. **Una prueba Groth16 real del pairing variable de BLS12-381 que utiliza esa apertura**, con comprobación de subgrupos y exclusión de puntos nulos. Se generó en CPU y se verificó en Go y en una EVM local.

**Limitación del benchmark inicial:** en esa fase no se había construido una prueba ZK completa de apertura o invalidez. El circuito medido no autentica por sí mismo la ronda, no liga los puntos a los bytes del ciphertext, no ejecuta el resto de age ni comprueba el compromiso/reglas de la misión. Por tanto, su prueba **no autoriza a revelar, cancelar ni declarar inválida ninguna misión del juego**. El contrato `Game` no fue modificado ni integrado con este verificador.

Conclusión: hay viabilidad parcial demostrada y mediciones reales del núcleo costoso, pero **la ruta completa sigue sin estar validada de punta a punta**. No se concluye que sea más barata que demostrar validez al enviar, ni que esté lista para producción.

## Mediciones

Máquina: AMD Ryzen 7 5825U, 16 CPU lógicas y aproximadamente 19 GiB de memoria visible. Node v24; Go 1.27.3; gnark v0.16.4; sin GPU, con `GOMAXPROCS=4` y límite blando de memoria Go de 4 GiB. No hubo afinidad de CPU ni aislamiento del resto de procesos.

| Medición | Resultado | Alcance |
| --- | ---: | --- |
| Apertura completa en Node, mediana de 10 muestras | 133,41 ms | Vector positivo del perfil soportado; no es generación de prueba |
| Ciphertext / mensaje del vector de coste | 576 / 19 bytes | Caso pequeño con salt 5; no representa todos los tamaños del cliente |
| Restricciones R1CS del componente | 1.470.823 | Un pairing variable con validaciones de grupo |
| Compilación del circuito | 9,94 s | Una ejecución |
| Setup Groth16 local | 373,47 s | Coste inicial, no un coste por misión |
| Generación de prueba | 20,28 s | Incluye resolución del witness; una muestra en CPU |
| Verificación nativa en Go | 2,89 ms | No es gas EVM |
| Máximo RSS del proceso Go | 3.110.880 KiB, unos 2,97 GiB | Incluye compilación, setup y prueba; no se aisló memoria por fase |
| Prueba serializada para Solidity | 384 bytes | Incluye el material adicional de commitments del backend |
| Entradas públicas del componente | 108 elementos | Coordenadas/limbs de los puntos y GT; no el diseño final de inputs |
| Calldata de `verifyProof` | 3.908 bytes | Para este componente y sus 108 inputs |
| Llamada al verificador en EVM local | 1.032.480 gas | No incluye coste intrínseco de la transacción ni liquidación del juego |

La mediana nativa se reparte principalmente entre autenticar la ronda (unos 68 ms) y abrir la cápsula IBE (unos 62 ms). age y validación de misión cuestan menos de 1 ms cada una en ese vector. No hay red durante estas mediciones ni caché de certificados por ronda; no se midió navegador.

Estas cifras **no son el coste de la prueba completa** ni un límite inferior universal: otro sistema, representación, aceleración o diseño de inputs puede cambiar los costes. Tampoco debe sumarse el tiempo Node al del componente para anunciar un coste completo de proving. El tamaño del mensaje y el salt afectan a partes que aún no están en el circuito; se probaron aparte los límites de salt uint256 sin reducirlo al campo de la prueba.

El setup fue fresco y local para este benchmark. No se conservaron proving keys ni se ofrece una ceremonia o setup de producción. Una implementación real puede reutilizar sus claves para el mismo programa, pero necesita su política de setup, auditoría y versionado.

## Qué se comprueba en Node

El [predicado](../../../apps/web/scripts/experiments/opening.ts) usa exclusivamente un ciphertext, contexto y beacon suministrados; no consulta RPC ni drand durante la evaluación.

1. El hash del ciphertext coincide con el registrado por el contexto de prueba.
2. La ronda esperada está ligada a la llegada con el margen actual de 15 s, para quicknet fijado por hash, clave pública, esquema, génesis y periodo.
3. Se analiza el sobre age y su stanza tlock. La versión/perfil no soportados no se declaran basura por conveniencia del prototipo.
4. Si falta la ronda o aún no se alcanzó su instante, se espera. Un beacon con ronda incorrecta, randomness incongruente o firma falsa se considera evidencia no fiable.
5. Para autenticar quicknet se comprueba la firma BLS en G1 sobre `SHA256(uint64_be(round))` con el DST RFC 9380 correspondiente y la clave pública fijada.
6. Se calcula `GT = e(signature, U)`, se deriva `sigma` mediante H2, se recupera la clave de archivo mediante H4 y se exige la comprobación Fujisaki–Okamoto `U = r·G2`, con H3 y su rechazo de escalares tal como lo implementa tlock-js.
7. Se comprueban el HMAC de cabecera, HKDF de payload y la autenticación ChaCha20-Poly1305 del único chunk soportado.
8. Se reutiliza el decodificador real de Vendetta y se verifican dominio ABI, compromiso, tipo/coordenadas, origen distinto, cover y carga permitida. No se comprueban condiciones dinámicas de combate al llegar: siguen siendo responsabilidad del planificador y motor.

Se mantiene una peculiaridad del decodificador vigente: un sexto elemento JSON se ignora y no vuelve inválido un mensaje cuyos primeros cinco elementos son correctos. No se introdujo accidentalmente una regla de canonicalización más estricta que la del juego.

Los estados son:

| Estado | Interpretación | Acción que permitiría en una integración futura |
| --- | --- | --- |
| `valid` | Apertura y misión correctas dentro del perfil | Solo podría aplicarse tras certificar el predicado entero y verificar su contexto |
| `invalid` | Fallo determinista comprobado en los datos | Todavía no hay una prueba completa que permita al contrato aceptar este resultado |
| `wait` | Aún no hay información utilizable | Mantener pendiente; nunca cancelar por tiempo |
| `untrusted` | Se sustituyó el ciphertext o se aportó contexto/beacon no fiable | Rechazar esa evidencia, no la misión |
| `unsupported` | Fuera del perfil o recursos del prototipo | Sin veredicto; no es una prueba de invalidez |

El contexto se supone leído del contrato y de su versión autorizada. El código de investigación no es un endpoint endurecido para JSON arbitrario: un error inesperado de ejecución debe impedir emitir un certificado, nunca convertirse en un resultado `invalid` por defecto. No hay expresiones regulares sobre errores de red para decidir basura.

## La afirmación que debe demostrar el programa completo

El hash de afirmación de investigación usa `keccak256(abi.encode(...))` y liga dominio de protocolo, chain ID, proxy del juego, misión, versión/digest de reglas, propietario, origen, cover, carga, llegada, ronda, identidad de quicknet, compromiso y hash del ciphertext. El digest de reglas incorpora los datos generados de Vendetta/config que usa el predicado.

Una futura prueba debe ligar ese hash a las entradas **que el contrato reconstruye**, no a un contexto que el servidor elige libremente. Un hash de 256 bits tampoco puede reducirse silenciosamente módulo BN254: su representación pública debe conservar todos los bits, por ejemplo mediante dos limbs acotados.

El programa completo necesita distinguir dos clases de rechazo:

- **Invalidez estática del sobre/ronda:** demostrar sobre los bytes comprometidos que el formato autorizado o la ronda no coincide. Algunas ramas podrían demostrarse sin descifrar.
- **Invalidez de apertura/contenido:** exigir primero un beacon auténtico de la ronda autorizada y después demostrar el fallo de encapsulado, autenticación, decodificación, compromiso o reglas estáticas.

Un beacon falso debe hacer fallar la admisibilidad de la prueba; **no** es un witness que permita probar que la misión es inválida. Las comprobaciones de los datos del remitente, en cambio, deben poder producir un resultado de invalidez. Limitarse a afirmar que todos esos datos son válidos haría imposible generar certificados para la basura.

El componente de pairing actual exige puntos válidos. Por eso **no cubre siquiera por sí solo la rama de cápsula con un punto inválido**: esa rama requiere su propio cómputo verificable o un programa que modele correctamente el error de parsing/grupo como resultado.

## Qué falta para cerrar la prueba

| Parte | Node | Circuito medido |
| --- | --- | --- |
| Hash y contexto completo de la misión | Sí | No |
| Round schedule, firma de quicknet y hash-to-G1 RFC 9380 | Sí | No |
| Parsear/decomprimir puntos y vincularlos a los bytes publicados | Sí | No: recibe coordenadas como inputs |
| Pairing de firma y U, grupos y no nulidad | Sí | **Sí** |
| Serialización canónica de GT y H2 | Sí | No: publica GT como limbs |
| H3, H4, XOR y comprobación `r·G2 = U` | Sí | No |
| HMAC/HKDF y ChaCha20-Poly1305/STREAM | Sí | No |
| Parsing de mensaje, compromiso y reglas estáticas | Sí | No |
| Rama de invalidez para todos los errores admitidos | Perfil parcial | No |

El circuito tiene 108 inputs y ninguna entrada secreta declarada porque aquí se comprime una computación sobre datos ya públicos tras la ronda. No aporta privacidad adicional. El sistema de pruebas sigue demostrando una ecuación real; la restricción importante es **qué ecuación** demuestra.

Las diferencias de representación también importan: gnark usa otra base interna para GT. Se contrastaron sus doce coeficientes con el GT real de Node y se añadió un test Go que reconstruye los inputs públicos archivados desde el vector de apertura. Esa compatibilidad no sustituye ligar el ciphertext y contexto dentro del programa completo.

## Pruebas y coste de rechazo

Los vectores incluyen apertura válida tardía, compromiso incorrecto, carga prohibida, texto y coordenadas inválidos, cover insuficiente, modificación de cápsula/HMAC/tag, truncación, ronda futura, falta de beacon y evidencia falsificada. Hay controles adicionales para puntos inválidos/nulos, replay de contexto, límites de recursos, máxima sal uint256 y overflow.

En la revisión del 29 de octubre se ejecutaron 98 tests web, incluidos los 36 de este experimento y los tests de carga de cadena local, sin skips. También pasaron el typecheck específico del experimento, un test Go de interoperabilidad del witness archivado y cuatro tests EVM del componente: prueba válida, prueba alterada, input público alterado y prueba válida bajo presupuesto de gas.

Un punto de prueba manipulado puede hacer que un precompilado consuma casi todo el gas que se le ofrece. La segunda medición usa `staticcall` con un presupuesto de 2.000.000 gas para datos no fiables:

- Prueba válida: pasa con ese presupuesto.
- Input público alterado: se rechaza, llamada medida de 1.034.099 gas.
- Bytes de prueba alterados: se rechazan, llamada medida de 1.998.581 gas.

Es un presupuesto elegido **para el componente**, no para el programa completo. Un fallo de verificación, timeout u OOG nunca puede interpretarse como certificado de ciphertext inválido. La integración debe verificar primero y mutar la misión solo con un certificado admisible y contexto vigente.

## Requisitos de integración que hoy no están implementados

- Guardar o autenticar el hash del ciphertext y la ronda autorizada al enviar. Hoy el ciphertext solo vive en el evento; el contrato no puede confiar en una copia arbitraria aportada después ni consultar directamente sus logs históricos.
- Fijar versión de formato, límites y reglas desde la admisión. El perfil de investigación limita tamaño, recipientes, representación de ronda, clave de 16 bytes y un chunk. Un envío válido fuera de ese perfil no se puede descartar por falta de soporte. Aceptar datos que ningún programa cubre permitiría bloquear indefinidamente con basura.
- Definir el comportamiento ante carreras entre revelación, certificado de invalidez y retorno. Un certificado viejo no puede actuar sobre una misión ya revelada/resuelta ni causar una segunda transición.
- No usar la expiración actual para sustituir una prueba que no llegó. Tanto falta de drand como falta de provers siguen siendo esperas; la salida del emisor con su preimage y la política de pérdida permanente deben conservarse explícitas.
- Mantener programa/verificador/reglas adecuados para las misiones ya aceptadas al actualizar el proxy.
- Preservar el planificador cronológico y su guardia: una apertura certificada no deshace acciones que se hayan adelantado indebidamente.

## Reproducción

Las fixtures incluyen beacons públicos históricos 1000 y 1001 de quicknet. Se descargaron de `https://api.drand.sh/<chain-hash>/public/<round>` y se verifican con la clave fijada. Los casos usan relojes simulados alrededor de esas rondas; **no prueban que una firma histórica ya pública fuera inaccesible en el momento de ejecutar el benchmark**.

Desde la raíz:

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/run-opening.ts
pnpm --filter @vendetta/web exec tsc -p scripts/experiments/tsconfig.json
pnpm --filter @vendetta/web test

# Go >= 1.26.8. Setup local nuevo; tarda varios minutos en la máquina medida.
(
  cd apps/web/scripts/experiments/opening-zk
  GOMAXPROCS=4 GOMEMLIMIT=4GiB go run . \
    ../../../../../docs/benchmarks/timelock-opening/pairing-input.json \
    /tmp/vendetta-opening-proof
)

# Forge y solc 0.8.28; SOLC_BIN permite indicar un compilador local.
pnpm --filter @vendetta/web exec tsx \
  scripts/experiments/measure-opening-evm.ts /tmp/vendetta-opening-proof

(
  cd apps/web/scripts/experiments/opening-zk
  go test ./...
)
```

Las fixtures cifradas están archivadas para repetir el mismo vector. El generador usa aleatoriedad real: regenerarlas cambia el vector y exige volver a generar la prueba del componente. Las pruebas/verificadores de un setup distinto no se mezclan con los inputs archivados. Para activar los tests web que necesitan anvil, su binario debe estar en PATH; la ejecución de esta fase lo incluyó y usó solc local.

El helper de anvil desactiva la caché del cliente de lectura de los tests: estos consultan el mundo inmediatamente después de minar y una cabecera cacheada podía ocultar la misión recién enviada. No se modificó el cliente de producción.

Artefactos: [Node](node-results.json), [input del pairing](pairing-input.json), [métricas de proving](pairing-proof-results.json), [prueba](pairing-proof.json), [verificador generado](PairingVerifier.sol), [EVM](evm-results.json), [fixtures](fixtures/cases.json). Los scripts están en [experiments](../../../apps/web/scripts/experiments/opening.ts) y el circuito en [opening-zk](../../../apps/web/scripts/experiments/opening-zk/main.go).

[Manifest de fuentes y artefactos](manifest.json). Tras regenerar los resultados puede actualizarse con `pnpm --filter @vendetta/web exec tsx scripts/experiments/snapshot-opening.ts`.

## Decisión recomendada

**Mantener drand y no integrar todavía el verificador parcial.** Hay evidencia suficiente para investigar una prueba posterior en servidor, pero no para prometer un coste completo ni descartar que convenga cambiar el sobre de cifrado.

El siguiente hito es implementar un programa completo de apertura/invalidez con una especificación de formato cerrada y comparar su comportamiento con estos vectores. Una zkVM permitiría investigar reutilizar parsing y primitivas convencionales; un circuito dedicado podría optimizar más, pero exigiría implementar y auditar todas las piezas pendientes. No se ha elegido ni medido esa alternativa todavía. También se puede estudiar autenticar una ronda una sola vez y reutilizar su certificado, sin dar por demostrada una mejora.

Al cerrar aquella fase, el estado de la investigación era **núcleo criptográfico medido, certificado completo pendiente**. No se ha resuelto aún el problema de impedir basura bloqueante en producción ni se ha aprobado cambiar el formato del protocolo.

Fuentes primarias: [tlock-js](https://github.com/drand/tlock-js), versión 0.9.0 instalada; [paper de tlock](https://eprint.iacr.org/2023/189); [timelock de drand](https://docs.drand.love/docs/timelock-encryption/); [gnark v0.16.4](https://github.com/Consensys-Incorporated/gnark/tree/v0.16.4), en particular `std/algebra/emulated/sw_bls12381` y el exportador Groth16 BN254. Las cifras anteriores son mediciones propias, no estimaciones tomadas de esas fuentes.

La [revisión de cobertura con Claude](coverage-review/README.md) registra las correcciones de la referencia, la auditoría del dominio real y H3 paginado medido en EVM. Este último aún no está ligado a una misión mediante prueba; publicar su preimagen antes de la ronda rompe la confidencialidad.

Continuación: [KEM con H3 paginado y vínculo verificable](paginated-kem/README.md). Se investiga una caché pública sin inicializador de confianza y la comprobación conjunta del prefijo exacto y el certificado; todavía no es una relación completa de misión.

Siguiente fase: [codec binario versionado para envíos futuros](codec-v2/README.md), con mensaje de 37 bytes, paquete de 273 y un único perfil experimental de misión. No está habilitado en producción.

Primer componente de integración: [ciclo de vida de resultados históricos](resolution-lifecycle/README.md), implementado en TS y Solidity y todavía sin activar en World/CoreState/Game.

Continuación de integración: [evidencia conectada a Game y cola](evidence-queue/README.md), con recepción sin drain y ejecución histórica en tests. El envío v2 sigue sin habilitarse; faltan contexto de admisión y auditoría completa de la frontera.

### Continuación: contexto desde almacenamiento

Se implementó el [constructor de contexto v2](game-context/README.md), compatible byte por byte con los nueve vectores archivados, junto con framing y binding interno desde el paquete. La admisión pública sigue deshabilitada. La revisión de mutaciones incluye ahora un contraejemplo ejecutable: el forfeit v1 puede cambiar el orden global de secuencias mientras v2 espera. Hace falta cerrar la política de transición antes de activar ambos protocolos.

### Continuación: admisión v2 opt-in

Se implementó la [activación de mundo y admisión v2](world-admission/README.md): solo el administrador, con cero misiones activas, fija consumidores una vez. Después de activarse, todo nuevo envío oculto se vincula a v2, cerrando la mezcla v1/v2 que alteraba secuencias. El loader/proyección reconoce los recibos. Los despliegues siguen en v1 y las pruebas integrales actuales usan mocks; falta el replay criptográfico real contra el contexto recién admitido y adaptar sender/keeper antes de uso operativo.
