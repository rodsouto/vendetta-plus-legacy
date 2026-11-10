# Revisión documental real: especificación integradora hidden v2

Por solicitud del propietario se redactó [la especificación](../hidden-v2-implementation-spec.md)
para otro implementador. No se cambió lógica ni se ejecutó setup, MPC, FFT,
proving/replay del juego o suites de implementación. Los resultados anteriores
33/5 y182/27 permanecen asociados a sus recibos originales, no a esta documentación.

Tres consultas reales Claude CLI2.1.321, modelo reportado claude-opus-5-5, sin
herramientas, MCP vacío estricto y no-session-persistence. Claude leyó las entradas
suministradas, no inspeccionó el repo ni ejecutó tests. Respuestas literales:
[initial](hidden-v2-claude-implementation-spec-20261110-initial.md),
[followup](hidden-v2-claude-implementation-spec-20261110-followup.md),
[closure](hidden-v2-claude-implementation-spec-20261110-closure.md).
La [metadata](hidden-v2-claude-implementation-spec-20261110-metadata.json) fija
prompts, JSON originales, stderr, inputs y el hash final de la especificación.
Las líneas de respuestas corresponden a sus fuentes congeladas, no necesariamente
al texto final. Closure recibió secciones numeradas seleccionadas; metadata conserva
sus rangos. Las dependencias externas aportadas son código público fijado por hash.

## Correcciones contrastadas

- Verificador gnark sin bool: el consumidor actual exige revert ante proof inválida;
  una ABI que retorna false requiere un consumidor distinto que compruebe ese valor.
  También se documenta que out-of-gas puede quedar envuelto en InvalidProof y provocar
  eviction sin acreditar invalidez de misión.
- Flags de cápsula/header/payload y resultado final son funciones exactas, no
  elecciones del witness. Se explicita la composición con U no identidad, H3 exacto
  y comprobaciones defensivas de _applyReveal. Discrepancias pueden atascar una
  cabeza VALID; no se inventa recuperación por timeout.
- Se detalla la detención de acciones drained de todos los jugadores, incluidas
  registro/vacaciones/cuentas, y las funciones que no drenan. Game.sol sigue siendo
  referencia exacta; las listas no otorgan bypass de autorizaciones.
- Se señalan resúmenes B-07/B-08/B-20/B-26 y comentarios antiguos contradictorios.
  El helper opening.ts sólo aporta RULES_DIGEST/PROFILE; su codec/contexto V1 no
  sustituye v2. Owner es playerId numérico, no dirección de wallet.
- Se precisan eventos, doble ABI del view, unknown-view status0 frente a unknown-submit,
  evidencia inactiva sin verificación y duplicados por resultado, no por bytes de proof.
- Se precisan transporte a slot vacío (pérdida de carga), trade no oculto y fórmula
  de vacaciones sobre el último registro, con su posible sustitución en viajes largos.
- Se corrige GT: una única serialización de576 bytes, doce coeficientes canónicos
  Fp en el mismo orden cliente/circuito/productor. Se incluyen orden explícito,
  la relación con ToTower, y vectores exigidos desde los mismos signature/U.
  La comprobación propia de orden de fuentes cliente/native no es prueba formal de
  equivalencia de pairing ni reejecución criptográfica.
- Se documentan proof384 bytes con compromiso/PoK, esquema público55/2, prefijo
  H3 completo1..65534 y scalar0 de EXHAUSTED sin confundirlo con validez. El test
  h3-zero-boundary existente no acredita una preimagen SHA ni witness completo.

## Cierre y límites

Closure no encontró ambigüedad bloqueante en las secciones aportadas. Se aplicaron
sus recomendaciones finales: lista de seis etapas separada, consecuencia del
último registro de vacaciones, listas drained ilustrativas, requisito explícito
scalar0/identidad y precisión de vectores GT, más formato. No se atribuye a Claude
verificación de hashes, tests o soundness. Es revisión documental asistida.

Verificación propia: enlaces locales, aritmética de37/273/640/290 bytes y sobres
2304/608, clave pública y PROFILE contra las fuentes, orden de coeficientes GT
cliente/native, Prettier, inventario y diff check. No se repitieron suites: el
código previo se compara byte a byte con el bundle de guardado anterior. La revisión
no acredita procedencia de claves, hardening del host, capacidad, SLA o producción.

Originales y cierre reproducible persistente nuevos:
/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261110-implementation-spec/receipt.json.
Los cierres anteriores se conservan sin sustitución. Sin commits/push/publicaciones
o despliegues reales. Anvil sigue efímero y gates de producción intactos.
