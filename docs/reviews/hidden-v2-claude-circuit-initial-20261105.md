# Segunda revisión técnica de Vendetta hidden v2

**Veredicto:** no he encontrado ningún defecto demostrado en el código suministrado que certifique INVALID para un paquete válido, VALID para uno inválido, ni un cruce de statement, ronda, H3 o escalar.

Quedan dos comprobaciones condicionales de impacto alto (H1 y H2) y una de impacto limitado (H3). Dependen de código no incluido o de cálculos que hay que reproducir.

Esta es una revisión técnica con IA, no una auditoría profesional independiente ni una aprobación de producción. Solo leí el código: no ejecuté nada. Los cálculos de H3 son manuales.

## Hallazgos por severidad

### H1. Crítica si se confirma: los consumidores no quedan fijados en el código visible
**Estado:** hipótesis, no es una vulnerabilidad demostrada. Falta `HiddenAdmission`.

- **Referencias:** `HiddenEvidence.sol:30-48` y `:72-78`.
- **Trigger:** `bind` solo comprueba `opening.code.length` e `invalidPoint.code.length`. Si la admisión aceptara esas direcciones del emisor, este podría registrar un contrato que devuelva `(true, plain)`.
- **Consecuencia:** VALID arbitrario para esa misión, sin ninguna prueba real.
- **Segundo punto:** tampoco se ve si `HiddenResolution.initialize` impide un segundo `bind` en el mismo timestamp, lo que permitiría cambiar statement o consumidores.
- **Regresión acotada:** en Foundry, admitir una misión con un consumidor mock y con un segundo `bind` en el mismo bloque. Ambos casos deben revertir.
- **Corrección mínima:** usar direcciones inmutables o constantes en la admisión, y rechazar el re-bind. No toca circuitos.

### H2. Alta si se confirma: las comparaciones de `cmp` podrían admitir alias de campo
**Estado:** hueco en upstream no suministrado. No está demostrado. Recuerdo que `bits.ToBinary` incluye comprobación de módulo por defecto, pero no lo he verificado en v0.16.4.

- **Referencias:** `mission.go:136`, `:199`, `:229` y `:233`.
- **Trigger:** si `cmp.IsLessOrEqual` descompusiera a ancho completo sin imponer la forma canónica, un valor pequeño `a` admitiría `a+q_BN254`, que cabe en 254 bits.
- **Consecuencia:** el prover podría forzar a 0 `coverOK`, `domain` o `inRange` y obtener un INVALID falso con `Valid=0` para una misión válida. Las aserciones que exigen resultado 1 no se debilitan así.
- **Regresión acotada:** un circuito pequeño con solo `IsLessOrEqual(a, C)`. Sustituir el hint de bits con `solver.OverrideHint` por la descomposición de `a+q`; debe fallar en `IsSolved`.
- **Corrección mínima:** ninguna si la regresión pasa. Si falla, comparar con anchos acotados (`api.ToBinary(x,n)` e `IsLessBinary`), lo que cambiaría el circuito y exigiría un setup nuevo.

### H3. Media-baja: «unified» no significa completo en una curva con j=0
**Estado:** hipótesis acotada. El cuerpo de `G2.AddUnified` no está suministrado. Asumo la fórmula de Brier-Joye, con salida `(0,0)` cuando `y1+y2=0`.

- **Referencia:** el comentario de `point_encoding.go:81-82` y el bucle de `:83-98`.
- **Trigger:** en `y²=x³+b`, si `Q=(x,y)` y `P=(ωx,-y)`, entonces `y_P+y_Q=0` con `x_P≠x_Q`. La suma real no es la identidad, pero esa fórmula devolvería `(0,0)`. Equivale a `acc=-φ^e(safe)`, con `φ(x,y)=(ωx,y)`.
- **Puntos válidos, sin efecto:**
  - En G2, `-φ^e` actúa como `x²` o `1-x²` módulo r.
  - Tendría que cumplirse `K=2·(r>>(j+1))`, con `K ∈ {x², r+1-x²}`.
  - Con 128 bits, `K=0xe7db…` y `x²=0xac45…`. El otro candidato solo podría coincidir con `r-1`, y tampoco coincide.
  - Por tanto, esta vía no produce un INVALID falso.
- **Puntos fuera del subgrupo:** el acumulador puede reiniciarse y dar un `inSubgroup=1` falso.
- **Consecuencia máxima:** `compressedG2Valid=1` bloquearía el certificado de punto inválido. `AssertIsOnG2` (`main.go`, no suministrado) tampoco daría testigo honesto, así que la misión quedaría sin certificado. Sería griefing de liveness, no VALID falso.
- **Traza manual para orden 13:**
  - `E'[13]` tiene dos subespacios propios de φ (valores 3 y 9), y solo ahí aplica la excepción, con `K≡4` o `K≡10 (mod 13)`.
  - La primera excepción ocurre en el prefijo 56.
  - Al simular los 255 bits, el estado final es 12, no 0, así que **no hay falso positivo para orden 13**. Sin excepciones, `r≡7 (mod 13)`.
  - El orden 23 no aplica porque 23 es inerte en `Z[ω]`.
  - Quedan sin comprobar 2713, 11953, 262069, el primo grande y los órdenes compuestos. La estimación heurística es muy baja, pero no es una prueba.
- **Hueco de tests:** `order-13-torsion` probablemente no cae en un subespacio propio. El test no lo fuerza.
- **Regresión acotada:**
  1. Factorizar `#E'(Fp²)` y simular en enteros el autómata «doblar, sumar o reiniciar» sobre los bits de r, para cada orden compuesto y valor propio compatible.
  2. Construir `φ(P)-[9]P` y `φ(P)-[3]P` desde un punto de orden 13.
  3. Evaluar esos puntos solo en `PointEncodingCircuit` y exigir `Valid=0`.
- **Corrección mínima:** si no aparece ningún orden con estado final 0, corregir solo el comentario. Si aparece, tratar el caso `y1+y2=0 ∧ x1≠x2` o usar fórmulas completas, con setup nuevo.

## Trazas revisadas sin defecto

| Área | Resultado |
|---|---|
| Rama no cuadrática | Es correcta: `-Norm(z)` tiene raíz con `Norm(z)≠0` solo si z no es cuadrado, porque `p≡3 (mod 4)`. Un U con x cuadrado no puede usar `HasSquare=0`. |
| Raíz y signo | Con `y≠0`, el signo fija la raíz. `y=0` no aparece en la curva, porque el orden es impar. Tampoco existe el punto `x=0`, porque b no es cuadrado en Fp². |
| Bytes canónicos | Las banderas y los tres bits altos de A1 se separan. Los de A0 quedan cubiertos por `canonical0`. La reducción módulo p no oculta bytes no canónicos. |
| Offsets del paquete | `4+32+8+128+32+69=273`. U ocupa `[44:140]`, y coincide en Go, TS y Solidity. |
| Ronda | La fórmula de tiempo, el límite de 2^53 y el `uint64` big-endian coinciden entre circuito y `packetRound`. |
| Esquema público | Los índices 14, 45, 46 y 50 son booleanos. Statement es 48-49, Valid 50, pre 51-52 y escalar 53-54. `plain` son 37 bytes. |
| H3 Solidity | Contador little-endian, desplazamiento solo del primer byte y rango 1..65534 coinciden con el circuito visible. |
| Exhausted | Requiere un `pre` agotado y además `supplied=0`, `x[14]=0` y `x[50]=0`. Exige unos 65534 rechazos, cada uno con probabilidad aproximada de 0,094. |
| Geometría | Filas y columnas son únicas. La distancia máxima al cuadrado es `849²+749²=1281802`, por debajo de `2048²`, así que el recorte es exacto. |
| Statement | Las 20 palabras salen de storage y del paquete. La id, la cadena y la dirección impiden reutilizar pruebas entre misiones. |

**Sobre la revisión anterior:** la observación de que `check` devuelve `plain` siempre ya no aplica, porque ahora devuelve bytes vacíos si `valid=false` (`MissionV2Consumer.sol:68`). No puedo reevaluar H7, porque `main.go` no está incluido.

## Alcance que falta

- **KEM real:** `CapsuleAgeCircuit` usa `CompactCapsuleCircuit` (`capsule_age.go:18`, `:111`), que no está incluido. `capsule.go` es otra implementación, así que la vinculación de U, GT, sigma, pre y rP solo queda revisada por analogía.
- **Go:** `PairCircuit`, `externalH3`, `unpack128`, `packBytes` y las asignaciones de los productores.
- **Solidity:** `HiddenAdmission`, `HiddenResolution`, `GameStorage`, los verificadores generados, `hiddenCommit` y el cálculo de distancia del juego.
- **Upstream:** `AddUnified`, `IsEqual`, `emulated.IsZero`, `ToBitsCanonical`, `cmp`, `uints`, el comb de base fija, `HashToG1` y `PairingCheck`.

## Supuestos matemáticos sin resolver

- **Cofactor de G2:** usé de memoria `h2=13²·23²·2713·11953·262069·L`. Debe recomputarse.
- **Estructura de 13-torsión:** deduje a mano `E'[13]≅(Z/13)²` eligiendo el twist compatible con `13²|h2`. Si hubiera puntos de orden 169, la traza de H3 no los cubriría.
- **Firma G1:** para U∈G2, si `T` tiene orden coprimo con r, espero `e(S+T,U)=e(S,U)`, por lo que una firma `sig+T` no cambiaría GT. Esto debilita la preocupación anterior sobre `sig+T`, pero no lo he demostrado para la implementación de `Pair` ni para el flujo de `CompactCapsuleCircuit`.
- **Unicidad de GT:** la invalidez falsa por criptografía sigue dependiendo de que `AssertIsOnG1`, `HashToG1`, `PairingCheck`, `IsZero`, `IsEqual` y el comb sean sólidos. Eso no queda demostrado aquí.
