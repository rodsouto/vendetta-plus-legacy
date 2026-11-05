# Contexto v2 construido desde la misión almacenada

Estado actual: [v2 única desde la inicialización](../v2-only/README.md). La activación opcional y el motor v1 descritos en las fases históricas fueron eliminados; los resultados de cada fase conservan su alcance original.

Fecha: 2026-10-29. Continúa la [recepción de evidencia y cola histórica](../evidence-queue/README.md).

## Objetivo y estado

El certificado debe describir exactamente la misión que Game admitió. El remitente y el relayer no pueden elegir un statement distinto, otra red, otro contrato, propietario, llegada, cargo o compromiso. Este paso implementa ese constructor y comprueba su compatibilidad con la relación criptográfica existente.

**Sigue sin existir un envío v2 público.** El nuevo helper es interno, está probado mediante harnesses y no lo llama `Game.sendHiddenMission`. Los envíos actuales siguen siendo v1. No se configuraron consumidores autorizados ni se activó el protocolo. Tampoco se generó una prueba Groth16 nueva contra una misión admitida por Game; se reutilizan los bytes de contexto archivados como vectores de compatibilidad.

## Constructor y framing

[HiddenContext.sol](../../../../contracts/src/core/HiddenContext.sol) lee la misión de GameStorage. Toma chain id y dirección de Game del contexto EVM, y usa la dirección del proxy si se ejecuta a través de este. El helper `HiddenEvidence.bindPacket` calcula el statement y lo entrega al binding existente, que fija también llegada, secuencia y consumidores. La versión TypeScript está en [hidden-context.ts](../../../../packages/rules/src/sim/hidden-context.ts); su entorno pertenece al host del simulador y no a los parámetros del jugador.

La codificación es exactamente la usada por el circuito completo: 20 palabras ABI estáticas, 640 bytes:

| Palabras | Contenido y origen |
| --- | --- |
| 0 | Dominio `keccak256("VENDETTA_OPENING_V2")` |
| 1–3 | Chain id EVM, dirección de Game e id de misión |
| 4 | Perfil fijo del experimento, con digest de reglas y configuración |
| 5–9 | Propietario, coordenadas de origen y cover almacenados |
| 10–13 | Cuatro recursos de cargo almacenados |
| 14–15 | Llegada almacenada y ronda leída del paquete |
| 16–17 | Identidad quicknet y hash de su clave pública fijados por el perfil |
| 18–19 | Compromiso almacenado y hash del paquete completo recibido al admitir |

El statement es keccak256 de esos 640 bytes. La secuencia está fijada por separado en el recibo; no se añadió una palabra incompatible con el circuito. Las tropas y demás reglas del envío se validan al admitir, no forman parte de esta relación de apertura.

El paquete debe tener 273 bytes, magic `VDH2`, la identidad quicknet correcta y ronda entre 1 y 2^53−1. Debe cumplir `1692803367 + (round−1) × 3 = arrival + 15`. No existe un control de vencimiento por retraso de la evidencia.

El framing **no comprueba U, MAC, tag ni mensaje descifrado**. Esos bytes opacos pueden ser basura y aun así tener un framing admisible; su certificado posterior determina INVALID. Rechazar una coordenada U aquí dejaría incoherente la ruta ya construida para certificar U inválido.

La admisión futura deberá llamar al helper con los mismos bytes que emite en la transacción. Todavía no hay una ruta pública que garantice esa disponibilidad. El helper tampoco autoriza las direcciones de consumidores: ese control sigue siendo responsabilidad de la configuración y del sender pendiente.

## Perfil fijado y compatibilidad

Se mantuvo el perfil de investigación usado por las pruebas reales, incluido su nombre histórico `vendetta-opening-research-v1` dentro del digest de reglas, aunque el dominio del paquete sea V2. Cambiar ese valor ahora invalidaría la compatibilidad con la relación archivada.

El test web vuelve a calcular el perfil desde `RULES_DIGEST` y comprueba identidad y clave quicknet. Un cambio de reglas/configuración o red debe hacer fallar ese test y exige decidir una nueva versión de circuito y perfil; no debe actualizarse solo una constante para silenciarlo. Este es un perfil fijado del experimento, no un registro de versiones autorizado para producción.

Solidity y TypeScript generan exactamente los bytes ABI y hashes de los **nueve vectores** del codec utilizados por la relación Go. Se comprueban además cambios de campos semánticos, separación por red, contrato e id, framing incorrecto, ronda y llegada incompatibles, binding tardío, misión inexistente, binding único y basura opaca. Solidity incluye 256 ejecuciones fuzz de mutaciones de campos almacenados.

## Auditoría de mutaciones sin `drained`

Se revisaron las entradas de Game y las lecturas del procesamiento de misiones, Settlement, Battle y la liquidación de Market. Esta clasificación es sobre el código actual; no sustituye una auditoría de seguridad ni cierra la política de transición:

| Entrada o grupo | Efecto durante una espera v2 | Estado |
| --- | --- | --- |
| Acciones con `drained`, incluidas reveal, recall, economía, vacaciones, familias, mercado y aceptación de cuentas | El head vencido pendiente impide adelantar esas acciones; revertir la acción revierte su drenaje parcial | Protección global existente; falta ampliar los historiales adversarios |
| `advance` | Se detiene antes del recibo PENDING; procesa resultados certificados en orden | Cubierto por tests de cola |
| `submitHiddenEvidence` | Registra un resultado; no liquida edificios, mueve el reloj ni asigna secuencias | Excepción necesaria para desbloquear la cola |
| `forfeit` v1 | Retira la misión y asigna una secuencia al retorno sin drenar | **Bloqueo para mezclar protocolos**, reproducido abajo |
| `setGlobalPremium`, `grantPremium` | Cambian elegibilidad de acciones futuras; la liquidación histórica actual no lee premium | No adelantan la liquidación de misiones. Preservar esta separación al cambiar reglas |
| `suspend` | Cambia autorización de acciones futuras; resolver ataques/retornos no consulta suspensión | No cancela ni invalida el ataque histórico |
| `cancelInvite`, `cancelRemoval`, `cancelTransfer`, `revokeSession` | Cambian autorización/protección de cuenta; no modifican las tropas, economía, tiempos o secuencias de misiones | Deben seguir disponibles durante una espera; no añadirles drenaje por defecto |
| `setRole`, `proposeRole`, `acceptRole` | Cambian autoridad privilegiada, no el contexto almacenado ni las lecturas actuales del combate | Mantener fuera del perfil criptográfico; requieren la política administrativa existente |
| Inicialización y upgrades UUPS | La inicialización es única; un upgrade autorizado puede sustituir las reglas | Frontera de confianza administrativa, no garantía que proporcione ZK |
| Getters | No escriben estado | Sin adelantamiento |

Esto no implementa una frontera por recursos. Sigue siendo un bloqueo global de la cola, con el coste de disponibilidad ya discutido. No se declara cerrada la auditoría de todas las interacciones futuras.

### Contraejemplo ejecutable de mezcla

[mixed-protocol-order.ts](../../resource-frontier/historical-source/mixed-protocol-order.ts) construye dos misiones con la misma llegada: primero v2 y luego v1. Compara evidencia v2 puntual con evidencia demorada dos horas. En ambos historiales se llama a forfeit v1 al mismo instante tardío.

Con evidencia puntual, el retorno v2 recibe primero su secuencia y el retorno v1 queda con seq **5**. Si v2 espera, el forfeit v1 se adelanta y su retorno queda con seq **4**. La hora del retorno v1 coincide; el estado completo ya no coincide. El experimento demuestra la divergencia de orden, **no afirma haber obtenido un combate distinto**. Usa un resultado mock de confianza, no un certificado criptográfico.

Por eso no basta con proteger los endpoints que tocan edificios. También hay que proteger la asignación global de secuencias. El código actual continúa permitiendo este escenario solo en harnesses/modelos, ya que no hay admisión pública v2.

La ruta recomendada, dado que aún no hay mundos desplegados, es activar v2 en mundos limpios y cerrar el sender v1 en esos mundos. Si se conserva una transición con misiones v1, se necesita una política explícita que impida este interleaving antes de activar v2. No se eligió silenciosamente una política ni se modificó la semántica B-22 actual.

## Ventajas y costes

- El hash esperado se construye desde almacenamiento y el entorno EVM, manteniendo la compatibilidad con el circuito existente.
- Los bytes del paquete quedan incluidos completos, sin depender de datos elegidos por el relayer al presentar la evidencia.
- El perfil fijo facilita comprobar la compatibilidad; obliga a versionar y revisar cualquier cambio de reglas, red o relación criptográfica.
- El framing cuesta mucho menos que verificar una apertura, pero no prueba validez del cifrado ni disponibilidad futura del relayer.
- La cola conserva el orden histórico a costa de bloquear acciones mientras falte un certificado. El constructor no resuelve ese coste.
- Evitar una transición mixta simplifica el orden; exige que la activación cierre explícitamente la ruta anterior.

## Validación y pendientes

Pasaron **773 tests de reglas, 203 de contratos y 108 web**, sin skips, incluidos los 25 escenarios existentes, 11 tests del comprobador de layout y el despliegue real en Anvil local. No se añadieron campos de almacenamiento y el snapshot de layout sigue coincidiendo. Los ocho tests Solidity nuevos y seis tests de reglas nuevos son de contexto; el test web adicional comprueba el perfil. No son nuevos benchmarks de proving ni una prueba criptográfica integral de admisión.

Antes de abrir v2 faltan: configuración autorizada y versión de consumidores; sender con validaciones normales y framing que emita el paquete exacto; política de mundo limpio/transición; adaptación de loader/proyección, keeper e indexación; replay con pruebas reales generadas para el contexto recién admitido y revisión de seguridad.

Reproducción del bloqueo, desde la raíz:

```sh
pnpm --filter @vendetta/rules exec tsx scripts/experiments/mixed-protocol-order.ts
```

Resultados: [results.json](results.json) y [contraejemplo](mixed-protocol-counterexample.json). No se desplegó en ninguna red real.

### Continuación: admisión v2 opt-in

Se implementó la [activación de mundo y admisión v2](../world-admission/README.md): solo el administrador, con cero misiones activas, fija consumidores una vez. Después de activarse, todo nuevo envío oculto se vincula a v2, cerrando la mezcla v1/v2 que alteraba secuencias. El loader/proyección reconoce los recibos. Los despliegues siguen en v1 y las pruebas integrales actuales usan mocks; falta el replay criptográfico real contra el contexto recién admitido y adaptar sender/keeper antes de uso operativo.
