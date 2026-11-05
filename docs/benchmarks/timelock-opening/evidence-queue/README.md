# Evidencia conectada a Game y a la cola histórica

Fecha: 2026-10-29. Continúa el [ciclo de vida del resultado](../resolution-lifecycle/README.md).

## Qué está conectado

Game ahora expone recepción de certificados sin `drained`. La cola y el simulador reconocen misiones con un binding v2: conservan la llegada y secuencia originales, esperan evidencia en su posición y consumen el resultado una sola vez.

**No existe todavía una admisión v2 pública.** `sendHiddenMission` sigue creando misiones v1 sin binding. Un jugador no puede convertirlas a v2 enviando una prueba: el receptor responde `ResolutionUnknown`. Solo los harnesses de prueba llaman al helper interno de admisión. Las misiones creadas por las interfaces actuales conservan la política B-22 vigente.

Los cambios están en [HiddenEvidence.sol](../../../../contracts/src/core/HiddenEvidence.sol), [Missions.sol](../../../../contracts/src/core/Missions.sol) y sus equivalentes [hidden-evidence.ts](../../../../packages/rules/src/sim/hidden-evidence.ts) y [missions.ts](../../../../packages/rules/src/sim/missions.ts).

## Binding y autoridad

El nuevo mapping al final de CoreState guarda el recibo, dos direcciones de consumidores y una marca de recall anterior a la llegada. El helper de admisión fija statement, llegada, secuencia y consumidores una sola vez. Exige una misión oculta saliente recién creada, todavía en la cola, y contratos de consumidores existentes.

**Comprobar que una dirección tiene código no la convierte en un verificador autorizado.** La futura admisión deberá elegir los consumidores desde configuración aprobada; nunca desde parámetros que el jugador pueda elegir libremente. También debe construir el statement usando los datos reales del contrato. Ese constructor todavía falta.

El relayer solo entrega id y certificado. El adaptador toma el statement y las direcciones del binding almacenado, de modo que el relayer no puede elegir un root alternativo ni un consumidor distinto.

La interfaz compacta de Game es:

```solidity
submitHiddenEvidence(uint64 mission, bytes certificate)
```

`certificate = abi.encode(uint8 kind, bytes proof, bytes encodedInputs)`. Kind 1 usa `abi.encode(uint256[55])` para la apertura; kind 2 usa `abi.encode(uint256[2])` para U inválido. La decodificación y comprobación del tamaño están en la librería enlazada. Un kind desconocido o longitud incorrecta revierte; nunca se registra INVALID por un error de formato o de verificación.

`getHiddenEvidence(id)` devuelve `abi.encode(HiddenEvidenceState)` para lectura. La ABI web se regeneró. El cargador de misiones v1 sigue creando el mapping vacío; antes de activar v2 deberá leer estos recibos y proyectar correctamente las esperas.

El callback del simulador es una frontera de verificación de confianza para el modelo. No implementa Groth16 ni concede autoridad a un booleano proporcionado por un jugador. Los consumidores criptográficos reales se comprobaron en [apertura](../mission-v2-proof/README.md) y [U inválido](../invalid-point-proof/README.md); los tests actuales de Game usan mocks para aislar almacenamiento y cola.

## Llegada original y bloqueo de adelantamientos

Antes de sacar una misión vencida del heap, la cola comprueba si tiene binding y sigue pendiente de evidencia. Si es así, se detiene: no la aparca, no le cambia la llegada y no la descarta al pasar 60 segundos. `advance` devuelve el progreso hecho; una acción con `drained` recibe Backlog si sigue habiendo una llegada vencida delante.

Recibir el certificado no intenta procesar esa cola. Por eso puede desbloquear la misión pendiente sin depender de poder drenar antes. La evidencia tampoco ejecuta inmediatamente un ataque adelantándose a otro anterior.

Al consumir:

- Apertura válida: se comprueban además compromiso, tipo, coordenadas, cover y cargo contra la misión, y se ejecuta con su llegada/seq originales. El instante del bloque solo decide si ya está vencida.
- Apertura inválida o U inválido: ambas se normalizan a INVALID y crean el retorno desde la llegada original, con la misma política en ambas rutas. El verificador rechazado no produce este resultado.
- Si la ejecución revierte, se revierten también el consumo y la extracción del heap. En el simulador lo cubre la transacción `atomic`.
- La creación de un retorno puede asignar una nueva secuencia, como en el motor actual. Lo que se conserva es la identidad temporal del tramo saliente, no la secuencia de sus descendientes.

Una misión pública del mismo segundo espera detrás del ataque anterior sin evidencia. La recepción tardía no le permite adelantarlo.

## Rutas alternativas

Una misión vinculada no admite revelación basada únicamente en el compromiso ni `forfeit` por tiempo. El resultado debe venir del criterio de validez del cifrado. Un recall anterior a la llegada sigue permitido, marca el binding como cancelado y vuelve inerte cualquier evidencia posterior. Después de la llegada no se puede usar recall para eliminar el ataque pendiente.

Duplicados de la misma evidencia son inocuos. Tras consumo o recall, el receptor devuelve sin cambiar el retorno ni ejecutar de nuevo. Los errores de consumidores se propagan y dejan intactos el recibo y la cola.

## Tamaño y compatibilidad

La primera interfaz excedió EIP-170; la prueba de despliegue en Anvil lo detectó. Se compactó la recepción y se trasladó la codificación de PlayerView a [GameViews.sol](../../../../contracts/src/core/GameViews.sol), conservando los tipos y bytes devueltos por `getPlayer`. Game reenvía esa respuesta ABI desde la librería. El cargador web y los escenarios existentes volvieron a pasar.

El runtime de Game quedó en **23.644 bytes** frente al límite de 24.576. Hay un test específico que comprueba el límite sobre una implementación desplegada, además del despliegue real de la suite web. La nueva librería de vistas mide 2.923 bytes y la de evidencia 3.328.

El mapping se añadió al final de CoreState. Se actualizó el snapshot mediante el script de layout compatible, sin `--force`, y el comprobador pasó. No se reordenaron campos existentes ni se introdujeron enums almacenados.

## Evidencia y límites de esta fase

Pasaron 8 tests nuevos de reglas y 10 de cola en Solidity, dentro de las suites completas: **767 reglas, 194 contratos y 107 web sin skips**. Pasaron también los 11 tests del comprobador de layout y los 25 escenarios diferenciales existentes.

El caso TypeScript compara el World completo contra un oráculo que recibe la evidencia a tiempo, con dos ataques empatados, ejecución dos horas tarde y sus retornos. Da el mismo estado final para ese historial. Los tests Solidity cubren el bloqueo del defensor, el orden del mismo segundo, el rechazo de timeout y de pruebas fallidas, retorno histórico, rollback, recall temprano, input inválido, tamaño y rechazo de bootstrap desde v1.

Esto **no es todavía una prueba de extremo a extremo con una nueva misión admitida por Game y un certificado real generado para ese contexto**. Los bindings y consumidores de los tests de cola son harnesses/mocks; las pruebas Groth16 reales se verificaron por separado. Tampoco se ha trasladado toda la frontera por recursos del experimento a Solidity.

## Antes de habilitar v2

1. Construir el contexto y validar el framing al enviar, con configuración de verificadores autorizada. Contrastar el hash on-chain con el formato probado por Go/TS.
2. Auditar todas las mutaciones alrededor de la frontera. El bloqueo del head protege las acciones con `drained`; **no demuestra que las demás sean inocuas**. Por ejemplo, `forfeit` legado no drena y asigna una secuencia nueva: requiere tratar explícitamente los mundos que mezclen protocolos. Esta es una condición pendiente, no una garantía implementada.
3. Definir y comprobar la política de transición v1/v2, sin convertir retroactivamente mensajes ya admitidos. El proyecto continúa sin despliegues, por lo que la primera activación puede evitar esa mezcla.
4. Adaptar carga/proyección, keeper e indexación antes de usar el nuevo sender. Mantener separadas espera, error operativo e invalidez certificada.
5. Hacer el replay de las nuevas rutas con certificados reales y ampliar los historiales adversarios, junto con la revisión de seguridad. No activar solo porque estos tests de cola pasen.

## Reproducción

Desde la raíz:

```sh
pnpm --filter @vendetta/rules test
pnpm --filter @vendetta/web test
```

Desde `contracts`, con Foundry y solc 0.8.28:

```sh
forge test --match-contract HiddenEvidenceQueueTest -vv
pnpm test
```

Los resultados y hashes están en [results.json](results.json). No se desplegó nada en una red real.

### Continuación: contexto desde almacenamiento

Se implementó el [constructor de contexto v2](../game-context/README.md), compatible byte por byte con los nueve vectores archivados, junto con framing y binding interno desde el paquete. La admisión pública sigue deshabilitada. La revisión de mutaciones incluye ahora un contraejemplo ejecutable: el forfeit v1 puede cambiar el orden global de secuencias mientras v2 espera. Hace falta cerrar la política de transición antes de activar ambos protocolos.
