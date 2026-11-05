# Admisión v2 y activación de mundo sin mezcla de protocolos

Estado actual: [v2 única desde la inicialización](../v2-only/README.md). La activación opcional y el motor v1 descritos en las fases históricas fueron eliminados; los resultados de cada fase conservan su alcance original.

Fecha: 2026-10-29. Continúa el [contexto construido desde almacenamiento](../game-context/README.md).

## Resultado y alcance

Game tiene ahora una admisión pública v2 **opt-in** mediante su sender existente. Un administrador puede activar una única pareja de consumidores del perfil experimental fijo. El despliegue no ejecuta esa activación y sigue empezando en v1; tampoco se activó nada en una red real.

Esta fase cierra el interleaving público v1/v2 reproducido anteriormente: la activación exige cero misiones activas y, una vez activado el mundo, todos sus nuevos envíos ocultos son v2. No hay una ruta pública para enviar mensajes v1 en ese mundo ni para convertir retroactivamente una misión.

Los contratos criptográficos siguen siendo experimentales. Las pruebas integrales de esta fase usan consumidores mock, no nuevas pruebas Groth16 ligadas a las misiones admitidas. El sender de la interfaz y el keeper todavía usan el protocolo anterior, por lo que no debe activarse v2 en un entorno operativo con esos clientes.

## Configuración y autoridad

[HiddenAdmission.sol](../../../../contracts/src/core/HiddenAdmission.sol) implementa:

```solidity
activateHiddenV2(address opening, address invalidPoint) // entrada de Game, solo ROLE_ADMIN
hiddenConsumers() returns (address opening, address invalidPoint)
```

La activación comprueba autorización administrativa, que no hubo una activación anterior, `activeMissions == 0` y que ambas direcciones tienen código. Cuenta también las misiones públicas, retornos y misiones v1 aparcadas: no basta con mirar el heap vencido. Permite usar un mundo con jugadores y edificios existentes si todas sus misiones anteriores terminaron.

La configuración es de una sola aplicación: no existe desactivación ni rotación por estos endpoints. El perfil/circuito es el V2 fijo de los experimentos; una nueva versión requiere otra implementación y revisión. Un upgrade autorizado sigue pudiendo sustituir las reglas y pertenece a la confianza administrativa existente.

**Tener código no prueba que un consumidor sea correcto.** El administrador autoriza esas direcciones; deberá revisar la identidad, verificador, perfil, setup y ausencia de mutabilidad no prevista de los contratos seleccionados. Un jugador o relayer no puede suministrar una pareja alternativa en su envío. La configuración no convierte el setup local inseguro de los benchmarks en un setup de producción.

No se añadió un método de activación a los scripts de deploy ni se cambiaron sus valores por defecto. Los dos campos de direcciones se añadieron al final de CoreState, con actualización compatible de layout, sin `--force`.

## Envío y atomicidad

`sendHiddenMission` conserva su firma. Antes de la activación funciona como v1. Después, aplica las validaciones económicas normales, crea la misión, fija su compromiso y llama a la librería de admisión con el paquete exacto que emite en `HiddenMissionSent`.

La librería comprueba el framing y ronda/llegada mediante HiddenContext, calcula el statement desde la misión real y el entorno EVM, y fija el recibo PENDING con la llegada, secuencia y consumidores autorizados. Todo ocurre en la misma transacción que cobra salario/cargo y asigna el id.

Un paquete v1, longitud errónea o ronda incompatible revierte **toda** la admisión: no descuenta tropas o recursos ni consume id, secuencia o capacidad. Los datos opacos con framing correcto pueden admitirse para certificarse luego como inválidos. El evento conserva exactamente los bytes usados por el hash del statement.

El simulador comparte el creador económico entre el helper v1 y `sendHiddenMissionV2`. En un World activado, el helper antiguo rechaza con `ResolutionV2Required`: el host tiene que aportar el paquete y su entorno de ejecución para calcular el binding. Los controles ROLE_ADMIN y existencia de código son responsabilidad del host EVM, igual que en las otras acciones administrativas del modelo.

## Por qué ya no se mezcla el orden

El contraejemplo anterior requería una misión histórica v2 pendiente y otra v1 cuyo forfeit pudiera asignar una secuencia sin drenar.

- Antes de activar, todas las misiones admitidas por Game son v1.
- La activación exige que hayan terminado todas, incluidos sus retornos.
- Después de activar, todo envío oculto admitido tiene binding v2. El framing v1 no se puede usar para crear una misión sin binding.
- Un forfeit de una de esas misiones exige un certificado; no tiene cancelación por timeout.

Por tanto, el interleaving anterior no se puede construir mediante estas entradas públicas. El experimento que usa bindings manuales sigue sirviendo como demostración histórica del fallo de una transición que permitiera la mezcla. No se reescribió el forfeit de mundos que siguen en v1.

Esto no implementa la frontera por recursos ni demuestra equivalencia para todos los historiales. Las acciones con drenaje siguen bloqueándose globalmente ante el head v2 pendiente. Una nueva ruta de escritura, cambio de reglas o política de transición obliga a revisar este razonamiento.

## Carga y proyección web

El loader lee `hiddenConsumers` en el mismo bloque del snapshot. Si está activado, carga los recibos con `getHiddenEvidence`, incluidos los consumidos que permanecen almacenados después de terminar una misión. El decodificador conserva los campos y los bytes de plaintext autenticado.

La proyección excluye esas misiones de la revelación local por compromiso. Si el head vencido espera evidencia, deja de proyectar edificios al tiempo actual; así no adelanta su estado más allá de la frontera detenida. Cuando el recibo tiene un resultado certificado, el motor puede resolverlo usando los tiempos originales.

Esta carga no adapta todavía la pantalla de envío, el cifrado productivo, el generador de certificados ni el keeper. Un cliente antiguo no puede abrir o cancelar una misión v2 con una revelación v1. Falta convertir esas herramientas antes de activar el modo en uso real.

## Validación y límites

Pasaron **779 tests de reglas, 207 de contratos y 109 web**, sin skips, además de los 11 tests del comprobador de layout y los 25 escenarios existentes incluidos en la suite Solidity. Los tamaños y resultados están en [results.json](results.json). Se añaden seis tests de reglas, cuatro de contratos y uno web con Anvil. Cubren activación única, autorización EVM, consumidores con código, espera por misiones aparcadas y retornos, cierre del helper v1, binding automático, rollback de admisión fallida, bloqueo de timeout y equivalencia con evidencia puntual en un historial controlado.

La nueva prueba web despliega Game y un consumidor mock en un Anvil privado, activa v2, envía desde la entrada pública y compara el statement real con el constructor TypeScript. Carga el recibo, comprueba el bloqueo de la proyección pese a conocer el plaintext y entrega evidencia dos horas tarde. Tras avanzar la cola, el World cargado coincide con el motor de referencia, incluida la conservación del recibo consumido tras terminar la misión.

El paquete de esa prueba tiene U cero y el mock devuelve un plaintext válido para aislar la integración: **no se presenta como una apertura criptográfica válida**. Los benchmarks Groth16 anteriores siguen siendo pruebas separadas; aún falta generar un certificado real para este nuevo contexto de Game y recorrer la misma ruta.

Game mide 24.000 bytes, por debajo de EIP-170 (24.576), con poco margen para nuevas funciones. La lógica de admisión está en una librería enlazada de 2.968 bytes para conservar ese límite. El despliegue real de la suite web y el test específico de tamaño pasan.

## Ventajas, costes y siguiente paso

- Evitar la mezcla elimina el interleaving identificado sin cambiar las reglas de mundos que permanezcan en v1.
- El binding y el evento forman parte de la transacción de envío; una admisión inválida revierte sus efectos económicos.
- Los consumidores quedan elegidos por la administración y fijados en cada recibo. A cambio, una configuración incorrecta no tiene rotación simple y puede bloquear la resolución; debe revisarse antes de activar.
- La activación necesita una ventana sin ninguna misión activa. Es simple para mundos nuevos, pero puede ser difícil de obtener en un mundo concurrido.
- El bloqueo global conserva el orden mientras falta evidencia, con un coste de disponibilidad y latencia de proving que continúa pendiente.

El siguiente paso es un replay con certificados Groth16 reales generados para una misión admitida por Game, antes de adaptar y activar los clientes/keeper. Siguen pendientes la revisión de seguridad, el setup de producción, más historiales adversarios y una política operativa para sostener la generación de certificados.
