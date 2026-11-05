# Revisión de `docs/proposals/hidden-mission-resolution.md`

No he editado ningún archivo. Trato la propuesta como un borrador: nada de lo que plantea está aprobado ni implementado. Cada afirmación lleva una de dos etiquetas: **[código]** si la comprobé en el repositorio en HEAD (`feat/web3`), o **[supuesto]** si es una estimación o algo que todavía hay que medir o confirmar.

---

## 0. Veredicto

1. El diagnóstico es correcto: hoy, una revelación tardía se resuelve con el estado del momento de la revelación, no con el de la llegada. También es correcto rechazar el parche aislado de quitar la gracia.
2. La recomendación, cifrado verificable con ZK más una barrera global, **no cumple lo que promete**:
   - **La barrera global no se puede usar con la semántica actual.** `reveal` vacía la cola antes de ejecutarse (`drained`), así que con la barrera se bloquearía a sí misma. Además, con `HEAD_START = 15 s`, cada misión que revela el keeper congela el mundo unos 20 s.
   - **"Sin cancelación nunca" no es una garantía real.** Si nadie puede revelar, el resultado no es una cancelación sino un congelamiento global permanente. La pregunta de fondo no es si hay salida, sino con qué condición se sale.
   - **Una prueba de validez dice menos de lo que el documento asume** (sección 3) y probablemente sea la pieza más cara del proyecto.
3. Faltan dos ideas importantes:
   - **Con barrera, el `HEAD_START` y la ruta privada de revelación dejan de hacer falta.** Mientras la barrera está activa nadie puede actuar, así que adelantarse a una revelación no sirve de nada.
   - **Hay una alternativa sin ZK:** un plazo que empieza cuando se demuestra on-chain que drand ya publicó la ronda.
4. La fila "Fronteras por zona… filtra información" es incorrecta: el disco de `cover` ya es público.

Respuesta corta a la pregunta central: **no** se pueden conseguir a la vez, en sentido fuerte, (a) resolver exactamente en la llegada original, (b) que el mundo siga avanzando sin restricciones y (c) que la basura nunca bloquee. Hay que elegir qué condición se debilita (sección 2).

---

## 1. Hechos verificados en el código

| # | Hecho | Dónde |
|---|---|---|
| F1 | `reveal` lleva el modificador `drained`, que procesa hasta 4 misiones y revierte con `Backlog` si la cabeza de la cola sigue vencida | `contracts/src/Game.sol:80-83`, `:147-152`, `contracts/src/core/Missions.sol:68-73` |
| F2 | Una misión oculta vencida se aparca; no detiene la cola | `Missions.sol:83-95` |
| F3 | Pasada la gracia, `reveal` no revierte: **no hace nada** (`return`) | `Missions.sol:382` |
| F4 | Una revelación tardía cambia `arrival = block.timestamp` y asigna un `seq` nuevo | `Missions.sol:400-406` |
| F5 | `forfeit` no vacía la cola y devuelve la misión desde "ahora" | `Game.sol:156-158`, `Missions.sol:413-421` |
| F6 | **`recall` funciona sobre misiones aparcadas en cualquier momento después de la llegada.** Solo comprueba el dueño y que no esté `returning`. Hoy el remitente ya puede ver el estado del defensor en la llegada y elegir entre revelar y retirar | `Missions.sol:548-560`; B-22 lo describe en `docs/spec/blockchain.md:608` |
| F7 | `integrate` no hace nada si `lastUpdate ≥ t`. Una vez que un edificio avanzó, liquidarlo "hasta t" no reconstruye el estado en t | `contracts/src/core/Settlement.sol:19-25`, `:160-196` |
| F8 | `commit = keccak256(abi.encode(owner, kind, city, nbh, slot, salt))`. El ciphertext solo se emite en un evento; no se guarda ni su hash | `Missions.sol:383`, `:312-313` |
| F9 | En Gnosis, `arrival = tiempo_de_ronda − HEAD_START`, con `HEAD_START = 15`. La ronda se abre 15 s **después** de la llegada | `apps/web/src/chain/hidden.ts:43`, `:60-65` |
| F10 | `HIDDEN_ORDER_WINDOW = 15 = HEAD_START`. Una revelación del keeper llega como pronto en `arrival_X + 15 ≥ arrival_prev + 15`, así que **`OutOfOrder` nunca afecta a las revelaciones vía drand**; solo a las del propio remitente. B-22 dice que el keeper revela "8–11 s después de la llegada" y que la ventana "debe exceder la latencia del keeper": ese texto quedó desactualizado | `contracts/src/generated/VendettaRuleset.sol:62`, `blockchain.md:633-636` |
| F11 | El keeper decide si algo es basura **con una expresión regular sobre mensajes de error** (`/stanza\|armor\|…\|round\|parse\|decrypt…/`) y lo recuerda para siempre en `garbage`. Cualquier error del contrato distinto de `Backlog`/`OutOfOrder` también marca la misión como basura | `hidden.ts:115`, `apps/web/scripts/keeper.ts:94`, `:179-182` |
| F12 | Funciones que no vacían la cola: `forfeit`, `advance`, `cancelInvite`, `cancelRemoval`, `cancelTransfer`, `revokeSession`, `suspend`, `grantPremium`, `setGlobalPremium` y la gestión de roles | `Game.sol` |

Consecuencias directas:
- **F11** viola hoy el invariante 6: un error transitorio cuyo texto contenga "round" o "decrypt" se convierte en cancelación tras la gracia. Que esos textos aparezcan en errores reales de red es un [supuesto], pero es plausible.
- **F6** significa que la sección D describe un problema **que ya existe**, no uno hipotético.

---

## 2. ¿Se puede resolver siempre en la llegada original, sin cancelar, con el mundo avanzando y sin que la basura bloquee?

**No, en sentido fuerte.** Mientras falte la revelación, el contrato no sabe cuál es el objetivo. Por F7 tampoco puede reconstruir estados pasados. Solo quedan tres salidas:

1. **No dejar avanzar** nada que pueda ser el objetivo o influir en él: es una barrera, global o por zona.
2. **Guardar historial y reejecutar**: rollback o ejecución especulativa.
3. **Publicar el objetivo**: se pierde la ocultación.

Lo máximo alcanzable sin rollback ni publicar el objetivo:

| Garantía | Barrera global + ZK (propuesta) | Barrera + plazo anclado a drand (alternativa, §5.1) |
|---|---|---|
| Resultado exacto en la llegada original | Sí | Sí |
| Mundo avanzando | No: congelado unos 10–25 s por misión y sin límite si drand cae | Igual |
| Basura | No entra (si la prueba es sólida) | Bloquea como máximo `T` después de la ronda |
| Cancelación de una misión honesta | Nunca, pero si nadie revela el mundo queda congelado **para siempre** | Solo si drand **ya publicó** la ronda (verificado on-chain) y **nadie** revela durante `T` |
| drand caído para siempre o red retirada | Congelamiento permanente salvo salida administrativa | Igual |

La primera columna no es estrictamente mejor. "Nunca cancelar" se paga con un riesgo de congelamiento permanente. Las dos variantes necesitan una salida para el caso "la información desaparece", y el documento la trata como opcional ("debe declararse"). **Tiene que ser obligatoria y formar parte del diseño.**

---

## 3. ¿Qué garantiza realmente una prueba de validez sobre la descifrabilidad futura?

Supongamos una prueba sólida de la relación "C = tlock-Enc(pk_quicknet, R, M; r) ∧ R = f(arrival) ∧ commit = H(owner, M) ∧ pred(M, origen, cover, carga)".

**Lo que sí garantiza:**
- Existe un único M tal que, **si alguien obtiene la firma BLS de la ronda R** (que es única), el descifrado da M de forma determinista.
- M cumple los predicados que no dependen del estado.

**Lo que no garantiza:**
- **Que drand produzca la ronda R.** La red puede caer o retirarse, como ya pasó con otras redes de drand [supuesto sobre la historia de drand]. La prueba solo convierte "basura" en "válido condicionado a que drand siga vivo".
- **Que C esté disponible.** Hoy solo vive en los logs (F8). Hace falta guardar `keccak256(C)` en la misión y que la prueba quede ligada a ese hash. Aun así, la disponibilidad de los logs es un supuesto de infraestructura.
- **Que el circuito y el contrato acepten exactamente lo mismo.** Si el circuito acepta algo que `reveal` rechaza (`_checkTarget`, `cover`, carga…), tenemos una misión probada como válida que nunca se puede revelar: **congelamiento permanente**. Las reglas que no dependen del estado deben comprobarse **solo** en el circuito, y `reveal` no debe revertir con una misión probada; lo que falle por estado debe terminar en rebote.
- **Solidez del sistema de pruebas.** Un ceremonial de setup comprometido (Groth16) o un bug en el circuito deja entrar basura, lo que de nuevo produce un congelamiento permanente.
- **Privacidad.** La prueba tiene que ser de conocimiento cero, no solo sólida. **Si generarla en el navegador no es viable y se delega a un prover externo, ese prover conoce el objetivo**, que es justo la opción "keeper privado" que B-22 rechazó.
- **Que la ronda se abra pronto.** El retraso mínimo sigue siendo `HEAD_START`.
- **Confidencialidad frente a drand.** Un umbral de operadores de drand puede descifrar antes de tiempo. Eso no cambia con la prueba.

**Coste [supuesto, estimación de orden de magnitud]:** lo caro no es el sobre age/ChaCha/HKDF, sino la parte IBE de Boneh–Franklin:
- una multiplicación escalar en G2 y una exponenciación en GT de BLS12-381;
- en aritmética no nativa dentro de un circuito sobre BN254 (el que verifican de forma barata los precompilados del EVM).

Eso son millones de restricciones, y generar la prueba en el navegador puede tardar minutos y necesitar GB de memoria. Cambiar el commit de keccak a Poseidon y usar un formato propio sin age ayuda, pero no elimina la exponenciación en GT. El documento debería decirlo explícitamente.

---

## 4. ¿Se puede usar una barrera global con el `HEAD_START` y la semántica de revelación/vaciado actuales?

**No sin cambios.** Problemas concretos:

1. **Interbloqueo [código, F1].** Con barrera, `drain` ya no aparca y revierte mientras la cabeza sea una oculta vencida, así que `reveal` (que es `drained`) también revierte. `reveal` tiene que salir del modificador y quedarse solo con "validar y guardar el texto en claro". El documento lo intuye (B, invariante 4), pero conviene marcarlo como requisito bloqueante.
2. **Duración del congelamiento [código F9 + supuesto sobre latencias].**
   - Remitente conectado: espera el bloque con `timestamp ≥ arrival` y luego la inclusión, unos 5–10 s.
   - Remitente desconectado: 15 s (`HEAD_START`) + 2 s (tick del keeper) + unos 5 s (slot), es decir, unos **22 s**.
3. **Frecuencia [supuesto, ejemplo ilustrativo].** Con 500 jugadores activos y 10 envíos ocultos al día por jugador salen 5 000 llegadas diarias, una cada ~17 s. Con llegadas tipo Poisson, la fracción de tiempo congelado es ≈ 1 − e^(−D/17): **~44 % con D = 10 s** y **~72 % con D = 22 s**. El "`advance` + acción + un reintento" de B-08 fallaría constantemente. El documento menciona el problema de capacidad, pero sin números, y debería tenerlos.
4. **Bloqueo con misiones válidas, aunque haya ZK.** Un jugador con 20 misiones de una unidad y `cover` mínimo, escalonadas y sin revelar, congela el mundo unas 20 × D. Con varias cuentas, de forma casi continua. La prueba de validez no lo impide. Hace falta un límite de misiones ocultas pendientes después de la llegada, coste o tasa máxima.
5. **Lo que se vuelve obsoleto con la barrera** (y el documento no lo dice; es una ventaja):
   - **El riesgo de que el defensor se adelante a una revelación pública desaparece**, porque su envío también revertiría. La ruta privada de revelación (RPC privado, bundler separado) deja de ser obligatoria.
   - **`HEAD_START` ya no tiene que cubrir la inclusión de la revelación del remitente.** Basta con un margen para la diferencia entre el reloj UTC de drand y el tiempo de la cadena: la ronda tiene que abrirse después de la llegada **en tiempo de la cadena**. Eso deja D en unos 3 + 2 + 5 ≈ 10 s, y la revelación del remitente pasa a ser una simple optimización.
   - `HIDDEN_ORDER_WINDOW` y `OutOfOrder` sobran, porque el orden ya lo da `(arrival, seq)`. El descanso `TroopsResting` pierde su justificación por intercepción; solo queda la de "estacionar y enviar en la misma operación" (`blockchain.md:640-662`).
   - Por eso la frase "Abrir antes facilita que el defensor conozca el objetivo antes de la llegada" es cierta solo si la ronda se abre **antes de la llegada en la cadena**. Abrirla en la llegada más el margen de reloj es seguro con barrera.
6. **`forfeit` y las funciones que no vacían la cola (F12).** `forfeit` tiene que desaparecer o redefinirse. Las demás hay que clasificarlas: `suspend` afecta al mercado a través de `block.timestamp` (`Market.sol:257`).
7. **Plazos basados en reloj real.** `TooLate` en los envíos ocultos, `closesAt` del mercado, sesiones e invitaciones dependen de `block.timestamp`. Un congelamiento consume esos plazos. Hay que decidir si se compensan o se acepta perderlos.

---

## 5. Alternativas que faltan

### 5.1 Plazo anclado a la firma de drand verificada on-chain (recomendado como primera línea de investigación)

1. Cualquiera publica `σ_R`, la firma de quicknet para R = f(arrival).
2. El contrato la verifica con una comprobación de pairing que solo devuelve verdadero o falso (EIP-2537 basta: no hace falta sacar un valor de GT, que era el obstáculo de B-22) y aplica hash-to-G1 RFC 9380 al número de ronda.
3. Desde ese momento corre `T`. Si en `T` nadie aporta una revelación que coincida con el commit, la misión se trata como basura: vuelve a casa o se quema, según la política que se elija.

Propiedades:
- Si drand cae, no hay `σ_R` y no hay cancelación: el mundo espera, igual que en la propuesta.
- La basura bloquea como máximo `T` tras la ronda.
- Sin circuito, sin prueba en el navegador y sin ceremonial de setup.
- Cubre también "ronda futura" y "ciphertext perdido".

Coste: depende de que **EIP-2537 esté activo en Gnosis** [supuesto: B-22 solo lo confirma para Arbitrum]. Estimo unos 150–250 k gas por misión basura [supuesto].

Garantía más débil que la propuesta en un solo caso: drand funciona, pero ningún keeper ni el remitente revela durante `T`. Con varios keepers independientes y un `T` de minutos, eso es un fallo total de infraestructura, el mismo supuesto de "progreso" que la propuesta ya acepta.

### 5.2 Congelamiento por disco de `cover`

El disco (origen + `cover`) **ya es público** (B-22, "Accepted leaks", y `MissionSent`/`HiddenMissionSent`), así que congelar solo ahí no filtra nada nuevo. Hay que congelar:
- los edificios y casillas vacías del disco, para cubrir `register` y `OCCUPY`;
- el estado de nivel jugador de sus dueños y del atacante: investigación, honor/número de edificios (B-07 lo menciona) y vacaciones;
- cualquier misión que toque ese conjunto.

El heap tendría que poder saltar misiones que no interfieren, lo que obliga a un análisis de conmutación y añade divergencia potencial entre el simulador TS y Solidity. Ayuda en mundos grandes; en mundos de ~200 edificios el disco cubre una fracción grande [supuesto]. Es una buena fase 2, no una base.

### 5.3 Cola de intenciones diferidas

Durante el congelamiento se aceptan acciones con su timestamp y se ejecutan en orden al levantarse la barrera. El orden es exacto y no hay reversiones, pero la validez se evalúa tarde (fallos asíncronos para el usuario) y añade gas y almacenamiento. Vale mencionarla, aunque sea para descartarla.

### 5.4 Mejora inmediata, compatible con el diseño actual

Corregir F11: que la decisión de basura no dependa de mensajes de error y que solo se tome con el texto en claro en la mano (o con la cabecera age parseada). Corregir también el texto desactualizado de F10. Esto reduce cancelaciones honestas hoy, sin esperar a ninguna decisión.

---

## 6. Problemas, ordenados por gravedad

1. **Crítico.** La barrera global, tal como está, se bloquea a sí misma (F1). Con la latencia actual, en un mundo activo congela el juego una fracción alta del tiempo (§4.3), y las misiones válidas sin revelar permiten bloquearlo a propósito (§4.4).
2. **Crítico.** "No cancela nunca" equivale a "congelamiento permanente posible": por caída de drand, por desajuste entre circuito y contrato o por un setup roto. Hay que diseñar desde el principio la condición de salida.
3. **Alto.** Las garantías de la prueba de validez están sobreestimadas y su coste infravalorado. Faltan: el hash de C on-chain, la equivalencia exacta de predicados, la privacidad si se delega la prueba y la solidez del setup (§3).
4. **Alto.** Falta la alternativa 5.1, que cumple casi todos los objetivos sin ZK.
5. **Alto.** No se menciona que con barrera sobran `HEAD_START` como ventaja del remitente, la ruta privada y la ventana de orden. Esto cambia el "coste inevitable" del documento.
6. **Medio.** La fila de fronteras por zona es incorrecta en cuanto a filtración (§5.2).
7. **Medio.** La sección D describe como futuro un problema que ya existe con `recall` sobre misiones aparcadas (F6).
8. **Medio.** Los criterios de aceptación no son comprobables (§8).
9. **Bajo.** No se clasifican las funciones que no vacían la cola ni los plazos de reloj real (§4.6–4.7).
10. **Bajo.** Hechos del documento que conviene precisar (§7).

---

## 7. Correcciones concretas al documento

- **"Comportamiento actual", punto 3:** "Pasada la gracia, `reveal` no revierte: no hace nada (`Missions.sol:382`)."
- **Punto 5:** añadir que `recall` sobre una misión aparcada es posible en cualquier momento tras la llegada (`Missions.sol:548-560`), y que eso ya da al remitente la opción de retirarse según lo que vea.
- **Punto 6:** añadir F10, que la ventana de orden no afecta a las revelaciones vía drand porque coincide con `HEAD_START`, y F11, que la clasificación de basura del keeper es heurística.
- **"Coste inevitable de la disponibilidad":** sustituir el argumento de `HEAD_START = 15 s` por: "con barrera, la ronda puede abrirse en la llegada más un margen de reloj; el congelamiento por misión ≈ margen + latencia del keeper + inclusión". Añadir una estimación de la fracción de tiempo congelado con la carga esperada.
- **Sección A:**
  - exigir que la prueba sea de conocimiento cero;
  - guardar `keccak256(C)` en la misión y ligar la prueba a ese hash;
  - cambiar el commit a un hash adecuado para circuitos si se sigue por ZK;
  - aclarar que el coste dominante es la exponenciación en GT de BLS12-381, no age;
  - excluir explícitamente delegar la prueba a un prover externo.
- **Sección B:** "`reveal` deja de ser `drained` y no revierte con una misión probada como válida. Las comprobaciones de `reveal` no pueden ser más estrictas que el circuito."
- **Sección C:**
  - eliminar `OutOfOrder`/`HIDDEN_ORDER_WINDOW`;
  - recalcular la justificación de `TroopsResting`;
  - quitar el requisito de revelación privada, o justificar por qué se mantiene;
  - inventariar las funciones que no vacían la cola.
- **Tabla de alternativas:**
  - fila "por zona": el disco ya es público, así que no hay filtración nueva; el coste está en la clausura de dependencias y en el heap.
  - fila nueva: "Plazo anclado a `σ_R` verificada on-chain".
  - fila nueva: "Cola de intenciones diferidas".
- **"Contras":** añadir el bloqueo con misiones válidas sin revelar, el congelamiento permanente por desajuste entre circuito y contrato y el consumo de plazos de reloj real.
- **"Recomendación provisional":** reformular (§9).
- **"Revisión externa":** este texto.

---

## 8. Criterios de aceptación propuestos

El criterio actual "dos ejecuciones con las mismas acciones admitidas" no se puede comprobar: con distinta latencia, el conjunto de acciones admitidas cambia. Propuesta:

1. **Oráculo.** Para todo historial de acciones con timestamp y toda latencia de revelación L: si A_L es el conjunto de acciones aceptadas, entonces `Exec_L(A_L) == Oráculo(A_L)`. El oráculo es el simulador revelando cada misión exactamente en su llegada. Se comprueba con fuzzing diferencial (TS ↔ `Scenarios.t.sol`).
2. **Rechazos acotados.** Una acción solo se rechaza si su timestamp cae en un intervalo [llegada, revelación) de alguna misión pendiente, y lo hace con un error identificable que incluya el id de la misión que bloquea.
3. **Equivalencia de predicados.** Todo mensaje que acepta la validación de envío (circuito, o alternativa 5.1) se revela sin revertir.
4. **Basura.** Con ZK, la basura no entra. Con 5.1, la basura bloquea como máximo `T` tras `σ_R`, y no se puede declarar basura sin una `σ_R` válida.
5. **Caída de drand.** Ninguna cancelación mientras no exista `σ_R`. Al recuperarse, el estado coincide con el oráculo.
6. **Capacidad.** Con una carga objetivo concreta (por fijar), la fracción de tiempo congelado y la mediana de espera de una acción quedan por debajo de umbrales fijados de antemano. El ritmo de recuperación (misiones por hora en lotes de gas acotado) supera la tasa de llegadas.
7. **Bloqueo intencionado.** Un jugador o un grupo de N cuentas no puede congelar el mundo más de X s por hora.
8. **Privacidad.** No aparece ninguna filtración nueva respecto a B-22: el objetivo no es visible antes de la llegada en la cadena, ni siquiera con la ronda de drand abierta en `arrival + margen`.
9. **Retiradas.** `recall` después de la llegada original no evita el combate. Valen los casos de vacaciones, abandono, `register` y ocupación en una casilla del disco.
10. **Keeper.** Un error de red o de drand nunca termina en clasificación de basura (cubre F11).

---

## 9. En qué no estoy de acuerdo

- **"Investigar primero cifrado verificable + frontera"**: recomendaría el orden inverso.
  1. Arreglar F10/F11.
  2. Medir la frecuencia de congelamiento con barrera y un `HEAD_START` reducido al margen de reloj. Si sale inaceptable, la barrera global se descarta antes de gastar en ZK.
  3. Prototipar la alternativa 5.1: confirmar EIP-2537 en Gnosis y medir el gas.
  4. Recurrir al ZK solo si `T > 0` resulta inaceptable.
- **"Garantía fuerte de corrección bajo las hipótesis criptográficas"**: es fuerte en corrección pero débil en vida, y el documento debería presentarlo así.
- **"No hace falta conservar una cancelación por tiempo"**: sigue haciendo falta una salida, por drand muerto o por un circuito defectuoso. La diferencia está solo en la condición.
- **"Coste inevitable" ligado a `HEAD_START`**: con barrera no es inevitable en esa magnitud (§4.5).
- **"Fronteras por zona… filtra información"**: no filtra (§5.2).

## 10. Supuestos que hay que confirmar antes de decidir

- EIP-2537 activo en Gnosis Chain y su coste en gas.
- Diferencia real entre el reloj de la cadena en Gnosis y el UTC de drand (para dimensionar el margen).
- Latencia real del keeper (tick + inclusión) en Gnosis.
- Carga esperada de envíos ocultos (para la estimación de congelamiento).
- Coste real de la prueba BF-IBE en el navegador, si se mantiene la opción ZK.
- Retención de logs en los RPC que se usen, para que C siga disponible.
