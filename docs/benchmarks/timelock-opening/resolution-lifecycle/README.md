# Primer componente de integración: recibir y consumir resultados históricos

Fecha: 2026-10-29. Continúa las dos rutas medidas: [apertura de misión](../mission-v2-proof/README.md) y [U inválido](../invalid-point-proof/README.md).

## Alcance exacto

Se añadió el mismo núcleo de ciclo de vida en [TypeScript](../../../../packages/rules/src/sim/hidden-resolution.ts) y [Solidity](../../../../contracts/src/core/HiddenResolution.sol). En esta fase inicial aún no estaba conectado a World/CoreState/Game. La [continuación conecta evidencia y cola](../evidence-queue/README.md), manteniendo deshabilitada la admisión pública v2. Las misiones actuales siguen usando B-22 vigente; este paso no elimina todavía su gracia ni su reprogramación.

La separación sirve para evitar el bloqueo circular de exigir drenar una cola antes de recibir el certificado que la desbloquea. Recibir evidencia y ejecutar efectos son operaciones diferentes.

## Estado e invariantes

Cada registro fija un statement, llegada y secuencia originales, un estado PENDING/VALID/INVALID, el mensaje certificado y una marca de consumo. Los códigos almacenados son constantes numéricas; no se introducen enums ni se altera el layout de CoreState.

- `initialize` fija la identidad una sola vez. El hash cero también es un registro inicializado, sin usarlo como centinela de ausencia.
- `recordVerified` recibe el resultado **ya verificado** y exige el mismo statement. Conserva llegada y secuencia, no recibe un reloj, no drena ni ejecuta combates.
- Un duplicado idéntico no cambia nada, incluso después del consumo. Un resultado contradictorio para el mismo statement revierte, en vez de seleccionar otro desenlace según el orden de transacciones.
- Un resultado válido conserva exactamente un mensaje v2 de 37 bytes. Un resultado inválido exige mensaje vacío. La validación criptográfica y del predicado pertenece al adaptador de certificados; el núcleo no la sustituye.
- `consume` exige evidencia y que se haya alcanzado la llegada original; devuelve ese instante y secuencia originales y permite consumir una sola vez. Un registro pendiente sigue pendiente por mucho que pase el tiempo.
- TypeScript copia los bytes recibidos y devueltos, incluido un Buffer de Node, para reproducir la independencia de memoria del almacenamiento Solidity.

La API no contiene una operación de caducidad ni una forma de reinicializar el registro. Esto solo protege el registro: **no protege todavía el resto del estado del juego frente a adelantamientos**.

## Paridad y pruebas

El [generador](../../../../packages/rules/scripts/experiments/hidden-resolution-vectors.ts) produce cinco trazas deterministas y 33 pasos usando la implementación TypeScript. Foundry reproduce cada paso y compara estado completo, errores y valores devueltos con el [archivo generado](../../../../packages/rules/generated/hidden-resolution.json).

Las trazas cubren evidencia recibida 7200 segundos tarde, consumo sin evidencia, llegada todavía futura, duplicados antes y después del consumo, statement incorrecto, mensajes mal formados, conflicto entre válido/inválido, consumo doble, reinicialización y statement cero. Las expectativas de tiempo original también se comprueban directamente, fuera de los datos generados.

Una prueba fuzz de Solidity recorre 256 combinaciones de llegada uint40, secuencia uint64 y retraso uint32, y exige devolver los valores originales. Los tests TypeScript comprueban además que modificar un Buffer de entrada o la respuesta no muta el recibo almacenado.

Pasaron **759 tests de reglas y 184 tests Solidity**, incluidos los 25 escenarios diferenciales vigentes, además de 11 tests del comprobador de layout. El layout de almacenamiento de Game sigue coincidiendo con el registrado. Los [resultados](results.json) identifican las verificaciones y el hash del fixture.

Los harnesses tratan los resultados como verificados para probar exclusivamente el ciclo de vida. **No son endpoints seguros para aceptar booleanos de jugadores**, ni una prueba de combate completo con certificados. Los consumidores criptográficos se midieron por separado; falta unirlos mediante un adaptador que lea el statement almacenado en Game.

## Siguiente conexión necesaria

1. Guardar al enviar v2 el hash/contexto y la identidad originales que deberá usar el adaptador. Rechazar el framing fuera del dominio antes de crear una misión.
2. Conectar ambos consumidores a `recordVerified`, normalizando la apertura inválida y U inválido al mismo resultado. El endpoint de recepción debe funcionar sin `drained`; nunca convertir una excepción de verificación en INVALID.
3. Antes de `consume`, aplicar la frontera de dependencias. No se puede ejecutar un evento tardío sobre un edificio que ya avanzó más allá de él. Tampoco basta conservar timestamps si se permite al defensor retirar tropas mientras falta el ataque anterior.
4. Ejecutar el resultado desde la cola con la llegada y secuencia devueltas, incluyendo retornos y sus dependencias, y sin segunda transición. Si falla la ejecución, el consumo y los efectos deben revertirse juntos.
5. Restringir las rutas v2 de reveal, forfeit y recall: una preimagen de compromiso no equivale por sí sola a validez del cifrado; después de la llegada no puede elegirse abortar un ataque válido. Mantener la política coherente entre rutas.
6. Adaptar vistas, cliente, keeper e indexación antes de habilitar v2. La regresión principal sigue siendo comparar el mismo historial aceptado contra resolución puntual, con caídas prolongadas.

Este paso no elige ni activa una frontera global o local. La [referencia de frontera por recursos](../../resource-frontier/README.md) sigue separada y sus ámbitos no se han trasladado todavía a Solidity.

## Reproducción

Desde la raíz:

```sh
pnpm --filter @vendetta/rules exec tsx scripts/experiments/hidden-resolution-vectors.ts
pnpm --filter @vendetta/rules test
```

Desde `contracts`, con Foundry y solc 0.8.28:

```sh
forge test --match-contract HiddenResolutionTest -vv
```
