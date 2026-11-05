Ya leí los tres documentos y verifiqué en el código los detalles de `reveal`, `forfeit` y el keeper. Esta es la segunda ronda.

# Segunda ronda: desacuerdos con Codex

No he editado ningún archivo. Comprobé en el código, en HEAD, `Missions.sol:378-421` (`reveal`, `forfeit`, `_checkTarget`), `keeper.ts:20` (`TICK_MS = 2000`) y `blockchain.md:83` y `:575-576`. Todo lo demás de este texto es razonamiento o una hipótesis declarada.

## 0. ¿Representó Codex fielmente mi postura?

En general, sí. Los cuatro desacuerdos citan lo que escribí. Hay que corregir dos atribuciones y debo reconocer tres errores míos que Codex señala con razón.

**Atribuciones que corrijo:**

- **Párrafo final:** «considerar demasiado costosa la barrera global» no es lo que defendí. Mis dos columnas de §2 usaban barrera, también la del plazo anclado a drand. Lo que pedí fue medir antes de invertir en criptografía, porque la barrera permite reducir `HEAD_START` y con ello su coste (§4.5). Mi desacuerdo era con el ZK, no con la barrera. Las cifras del 44 % y el 72 % eran ilustrativas. Además, en §4.3 escribí que el documento «debería tener números», y un ejemplo inventado no es evidencia: Codex hizo bien al dejarlo como ilustración.
- **Desacuerdo 2:** nunca dije «continuidad a cualquier coste». Lo que sí dije, «la diferencia está solo en la condición» (§9), es peor: trata igual una salida por timeout y una salida declarada por pérdida permanente. Retiro esa frase (punto 2).
- **«Calificó como omisiones requisitos ya previstos»:** no puedo comprobarlo. `docs/proposals/` no está versionado y no tengo el borrador anterior. Solo consta que en §4.1 reconocí que el documento «lo intuye». Lo acepto como plausible.

**Errores míos que Codex detectó bien:**

1. **§0.2:** «"Sin cancelación nunca" no es una garantía real.» Falso. Es una garantía real de *seguridad* (corrección). Lo que no da es *progreso*. Mezclé las dos cosas.
2. **§2, tabla, columna del plazo:** «Resultado exacto en la llegada original: Sí». Solo es cierto para las misiones que alguien revela. Para una misión válida cancelada por `T`, la respuesta es **No**.
3. **§5.1:** presenté «drand vivo pero nadie revela en `T`» como «el mismo supuesto de progreso que la propuesta ya acepta». No lo es. En la propuesta, ese fallo produce **espera**. En el plazo produce **cancelación**: convierte un fallo de progreso en un fallo de corrección.

---

## 1. Plazo desde la firma de drand publicada frente a la garantía estricta

**Postura anterior:** era la primera línea de investigación, y el ZK solo entraba «si `T > 0` resulta inaceptable».

**Postura actual:** **sí, admito que todavía cancela misiones válidas.** Una firma publicada `σ_R` demuestra que la información *existe*, no que el envío sea inválido. Que nadie revele durante `T` es ausencia de evidencia, no evidencia de basura. Puede ocurrir con un ciphertext correcto si fallan todos los keepers, el remitente está desconectado o la red está congestionada. **Bajo el requisito estricto, la opción no es admisible. Retiro la recomendación de priorizarla.** Solo es una alternativa si el usuario relaja expresamente el objetivo.

**Distinción entre seguridad y progreso:**

| | Seguridad (nunca cancelar ni alterar una misión válida) | Progreso (se sale de la espera en algún momento) |
|---|---|---|
| Plazo desde `σ_R` | **Se viola** si nadie revela durante `T` | Acotado por `T` una vez que drand publica |
| Frontera + validez a priori | Se conserva bajo las hipótesis criptográficas | Sin cota: depende de drand, o del remitente, y de los reveladores |

**Qué acepto de Codex:** todo el apartado «Alternativa sugerida por Claude». Añado dos matices que no cambian la conclusión:

- **La verificación on-chain de `σ_R` sigue siendo útil, pero no para cancelar.** Sirve como pieza de la opción que propongo en §6: probar la invalidez después de la llegada.
- **`blockchain.md:83` dice «Game logic must not depend on chain-specific precompiles».** Depender de EIP-2537 puede chocar con esa regla, sea para el plazo o para cualquier verificación BLS. Antes de construir nada sobre ese precompilado hay que aclarar cómo se interpreta (§4).

---

## 2. Política de fallo permanente: exigir una política frente a imponer continuidad

**Postura anterior:** «la salida tiene que ser obligatoria» y «la diferencia está solo en la condición».

**Postura actual:** exigir una **política explícita** sigue siendo necesario, y en eso Codex y yo coincidimos. No era necesario exigir una **salida que restaure la continuidad**, y retiro haberla equiparado con un timeout. **Sí: aceptar una pausa permanente conserva la seguridad.** Ninguna misión válida se cancela ni se altera. Lo que se pierde por completo es el progreso. Es un mal producto, pero es coherente con el requisito.

**Opciones reales y lo que cuestan en garantías:**

| Opción | Seguridad para la misión pendiente | Progreso | Confianza añadida |
|---|---|---|---|
| a) Pausa permanente (global o del ámbito de la frontera) | Se conserva | Se pierde | Ninguna |
| b) El remitente revela con `(kind, target, salt)` por el commit, sin drand | Se conserva | Se recupera **si el remitente coopera** | Ninguna, pero depende del remitente |
| c) Varias fuentes de descifrado (dos redes de time-lock y otras similares) | Se conserva | Baja la probabilidad de pausa, pero no la elimina | Confidencialidad: basta que se rompa **una** fuente |
| d) Custodia de umbral (un comité puede descifrar) | Se conserva | Se recupera si el comité responde | Confidencialidad y disponibilidad del comité |
| e) Intervención declarada (un rol cancela la misión o migra el mundo) | **Se viola para esa misión**, por decisión y no por demostración | Se recupera | Gobernanza (rol admin/arbiter) |
| f) Pausa limitada a la clausura de dependencias del disco de `cover` | Se conserva | El resto del mundo progresa; esa zona queda detenida | Ninguna, pero el diseño es más complejo |

Dos observaciones que el documento puede aprovechar:

- **La opción (b) ya existe hoy.** Con `Missions.sol:383`, cualquiera que tenga el preimage del commit puede revelar. «drand muerto» solo detiene el juego si además el remitente no puede o no quiere revelar. Con la frontera, retrasar la revelación no le cambia el resultado al remitente: solo detiene el mundo. Se puede castigar como abuso, pero no le da una opción estratégica.
- **(e) no es invalidez demostrada.** Si se elige, hay que declararla como lo que es: se renuncia a la garantía para esa misión bajo una confianza explícita. Aquí sigo estrictamente a Codex.

**Requisito imposible, formulado con precisión.** Supongamos que:

- el contrato no conoce el objetivo antes de la revelación;
- no hay historial ni rollback (`Settlement.sol:19-25`);
- el objetivo no es público;
- no se garantiza que drand ni el remitente estén disponibles.

Entonces **no se puede garantizar a la vez** que (S) toda misión válida se resuelva como si se hubiera revelado a su llegada y (L) que el estado finalizado de *su conjunto de posibles dependencias* avance pasada esa llegada en un tiempo acotado. Cualquier regla que avance tras una cota tiene que hacer una de dos cosas:

- cancelar la misión, o
- resolverla contra un estado que pudo cambiar.

Esto **no** afirma que el resto del mundo, fuera de esa clausura, tenga que detenerse. Tampoco afirma que el timeout demuestre invalidez.

---

## 3. Predicados redundantes en el circuito y en `reveal`

**Postura anterior:** las reglas estáticas «deben comprobarse **solo** en el circuito».

**Postura actual:** Codex tiene razón. **La redundancia no es incorrecta en sí misma: es un riesgo de divergencia que se puede mantener.** El peligro no es la comprobación duplicada, sino que **una misión probada como válida pueda revertir en `reveal`**. Quitar la comprobación tampoco elimina ese riesgo, solo lo traslada. Si el circuito aceptara un mensaje que el contrato considera inválido, esa entrada llegaría a la ejecución, con el mismo bloqueo o algo peor.

**Qué hacen hoy esas comprobaciones** (`Missions.sol:387-396`):

- `_checkTarget` es `pure`;
- el `cover` sale de `m.cover`;
- la carga se compara con `TRANSPORT`.

Todas son estáticas y dependen de constantes de `Ruleset` (`CITIES`, `NEIGHBORHOODS`, `SLOTS`, `DISTANCE_UNIT`).

**Dónde está el riesgo concreto:** en las **actualizaciones UUPS** (B-17). Si se cambia una constante o `Map.distance` mientras hay misiones probadas con la versión anterior, la divergencia aparece aunque el código del circuito y el de `reveal` fueran idénticos en el momento del envío.

**Qué lo mantiene bajo control:**

- una sola fuente para ambos (las constantes ya se generan desde `docs/spec/data`; el circuito tendría que salir del mismo codegen);
- pruebas de equivalencia y vectores negativos, que ya están en los criterios de aceptación de Codex;
- una regla de actualización: no se cambian los predicados estáticos mientras queden misiones pendientes probadas con la versión anterior, o se versiona el predicado por misión.

**Qué acepto:** el texto actual del documento, la línea 76 y el criterio de la línea 197. **Qué rechazo:** nada. Solo añado el riesgo de las actualizaciones.

---

## 4. Estimaciones de criptografía y de Gnosis no verificadas

**Postura anterior:** etiqueté las cifras como [supuesto], pero algunas frases sonaban afirmativas: «millones de restricciones», «minutos y GB», «150–250 k gas», «EIP-2537 basta», «congela unos 20 s».

**Postura actual:** ninguna es un dato medido. Codex hace bien en no usarlas para decidir. Las reformulo como hipótesis, cada una con la evidencia que la confirmaría y lo que cambiaría si resultara falsa:

| Hipótesis | Evidencia que la resuelve | Qué cambiaría |
|---|---|---|
| H1. La parte cara de una prueba de cifrado tlock es la aritmética no nativa de BLS12-381 (escalar en G2 y exponenciación en GT), no el sobre age | Recuento de restricciones de un circuito existente de pairing o IBE BLS12-381 en emulación, y un prototipo propio | Si es barata, la validez a priori pasa a ser la vía principal sin discusión |
| H2. Generar la prueba en el navegador no es viable en tiempo y memoria en un dispositivo medio | Benchmark en móvil y escritorio objetivo | Si no es viable y no hay alternativa local, la validez a priori queda **descartada**: delegarla revela el objetivo |
| H3. EIP-2537 está activo en Gnosis con un precio conocido | Documentación del hardfork de Gnosis/Chiado y una llamada real a los precompilados, con el gas medido | Afecta a la verificación de `σ_R` (plazo o prueba de invalidez) |
| H4. Usar EIP-2537 es compatible con `blockchain.md:83` | Decisión del dueño de la especificación | Si no lo es, cualquier verificación BLS on-chain queda fuera, salvo como prueba dentro de un circuito verificado con BN254 |
| H5. La verificación de `σ_R` con un pairing booleano y hash-to-G1 RFC 9380 basta para quicknet | Prototipo con vectores de drand | Si hace falta la salida en GT, no se puede hacer on-chain (`blockchain.md:575-576`) |
| H6. Espera por misión ≈ margen de reloj + tick del keeper (2 s, comprobado en `keeper.ts:20`) + inclusión | Medir en Chiado/Gnosis la diferencia entre UTC de drand y el timestamp de bloque, y la latencia de inclusión | Dimensiona la frontera global frente a la del disco |
| H7. La carga de envíos ocultos es la que suponíamos | Ninguna disponible: hay que fijar una carga objetivo | Decide si la frontera global es aceptable como producto |
| H8. Los logs con el ciphertext se conservan | Políticas de retención de los RPC y del indexador, y recuperación independiente | Si no se conservan, sin almacenamiento propio el ciphertext deja de estar disponible: es un fallo de progreso, no de seguridad |

---

## Consensos

- Rechazar el parche aislado de quitar la gracia.
- Resolver con `(arrival, seq)` originales; nunca reprogramar.
- La frontera es la referencia de corrección; `reveal` sale de `drained`.
- Separar seguridad y progreso, y no prometer un plazo finito.
- El plazo desde `σ_R` **no cumple** el requisito estricto.
- Hace falta una política explícita de fallo permanente, y la pausa permanente es una política legítima.
- Medir disponibilidad y abuso antes de invertir en criptografía.
- El disco de `cover` no filtra información nueva.
- Las cifras son hipótesis.

## Desacuerdos que quedan

Ya no queda ninguno sustantivo sobre el objetivo. Quedan dos matices:

1. **El documento no menciona la opción (b) de §2.** El remitente puede revelar siempre por el commit, sin drand. Eso cambia el análisis de «drand retirado»: la pausa permanente exige que drand y el remitente fallen a la vez.
2. **Falta un riesgo en §3:** la divergencia entre circuito y contrato causada por actualizaciones UUPS.

## Recomendación de investigación, respetando el objetivo estricto

1. **Fijar la política de fallo permanente** entre las opciones (a), (b), (c), (d) y (f), sin timeout. Si se plantea (e), dejar escrito que es una renuncia declarada, no una prueba de invalidez.
2. **Aclarar H4 con el dueño de la especificación** antes de prototipar nada que use EIP-2537.
3. **Simular la frontera** con un margen reducido (H6, H7) y con un ataque de misiones válidas desde varias cuentas, frente a la frontera por disco.
4. **Investigar en paralelo dos formas de excluir la basura que solo cancelan con invalidez demostrada:**
   - **Validez a priori (la propuesta):** prueba de conocimiento cero en el navegador. Decidir con H1 y H2.
   - **Invalidez a posteriori (nueva línea):** cuando se publica `σ_R`, cualquiera prueba on-chain que *descifrar el ciphertext comprometido con la clave de la ronda correcta* no produce un mensaje que encaje con el commit y los predicados. Si no se presenta esa prueba, la misión espera indefinidamente: nunca se cancela por tiempo. Su ventaja es que el testigo ya es público tras la ronda, así que no necesita conocimiento cero y se puede generar en un servidor sin privacidad ni navegador. Requiere guardar el hash del ciphertext y verificar `σ_R` (H3–H5). Su coste es que la basura bloquea hasta que alguien presenta la prueba (progreso, no seguridad), y que el remitente de basura conserva una opción de abortar tras ver el estado en la llegada. Eso es una regla de juego que se resuelve con una penalización, no un problema de corrección para misiones válidas. Es viable solo si H1 lo permite para un prover en servidor.
5. **Solo si el usuario relaja expresamente el objetivo:** comparar el plazo desde `σ_R` como simplificación.
