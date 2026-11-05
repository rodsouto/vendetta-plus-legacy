# Revisión: certificado de invalidez de U comprimido (rama experimental opening-zk)

## 0. Alcance y límites de esta revisión

- Leí: `point_encoding.go`, `point_encoding_input.go`, `point_encoding_test.go`, `invalid_point_v2.go`, `invalid_point_v2_test.go`, `mission.go`, `mission_v2.go`, `capsule.go`, `capsule_compact.go` (`unpack128`), `age.go` (`unpackPadded`, `sameBytes`), `age_input.go` (`packBytes`), `capsule_age.go`, `main.go` (`PairCircuit`), `codec-v2.ts` y `go.mod` (gnark v0.16.4).
- **No pude leer las dependencias.** El modo restringido bloqueó `/tmp/vendetta-opening-tools/gnark/...` y `~/go/pkg/mod/.../gnark-crypto...`. Todo lo que dependa de la implementación concreta de `AddUnified`, `IsEqual`, `Select`, `Ext2.One`, `emulated.IsZero`, `FromBits`, `ToBitsCanonical`, `cmp.IsLessBinary` y `SetBytes` de gnark-crypto queda marcado como **hipótesis por verificar**.
- No ejecuté nada. Las afirmaciones sobre los tests salen de leer su código, no de correrlos.

---

## 1. Resumen ejecutivo

| # | Severidad | Tipo | Resumen |
|---|---|---|---|
| H1 | **Media-Alta (vivacidad / griefing)**, hipótesis | Completitud | La multiplicación `[r]P` con `AddUnified` (`point_encoding.go:84-99`) probablemente tiene un caso excepcional no cubierto: `y1 = −y2` con `x1 ≠ x2` (es decir `x2 = ω·x1`). **No afecta a puntos de G2** (lo demuestro abajo), pero un emisor podría fabricar un U fuera del subgrupo (de orden pequeño, vector propio de φ) para el que el circuito calcule `inSubgroup=1`. Entonces no hay apertura ni certificado de invalidez, y la misión queda bloqueada. |
| H2 | Baja, hipótesis | Solidez (si se confirma) | `b := g2.Ext2.One()` y luego se sobrescriben `b.A0`/`b.A1` (`point_encoding.go:63-65`). Si `Ext2.One()` devolviera un puntero memoizado, se corrompería la constante 1 en todo el circuito, también dentro de `AddUnified`. |
| H3' | Baja | Evidencia | La restricción de signo (`:75`) **no es necesaria para la solidez de la invalidez** (±Y están ambos en G2 o ninguno lo está), y el test `opposite-root-cannot-forge-invalidity` no la ejercita: seguiría pasando si se borrara la línea 75. |
| H4 | Informativa | Código muerto | `yZero`, `tangentZero`, `signOK`, `norm≠0` y `nonIdentity` nunca se activan en esta curva (orden de E'(Fp2) impar y ningún punto con x=0). Son defensivos y correctos, pero no deben contar como cobertura. |
| H5 | Informativa | Redundancia | Las comprobaciones de ronda en `invalid_point_v2.go:30-36` ya están implicadas por `MissionContext` más `Words[15][1] == round`. |
| H6 | Media (proceso) | Evidencia | Los tests usan solo el solver honesto (`IsSolved`) y pocos vectores. No hay testigos adversarios, mutaciones, fuzzing diferencial, puntos de orden pequeño ni bordes `p−1` / bits altos de A0. |

**No encontré ningún bug de solidez en la dirección crítica** ("nunca certificar invalidez de un U válido"), siempre que los gadgets de gnark sean sólidos y H2 no se confirme. El argumento está en la §3.

---

## 2. Modelo de la relación

`InvalidPointMissionV2Circuit` (`invalid_point_v2.go:19-44`) prueba lo siguiente:

1. `MissionContext` con dominio `VENDETTA_OPENING_V2`; el público es `StatementPacked` = keccak de las 20 palabras (`mission.go:58-83`).
2. `packet` = 273 bytes privados (`unpackPadded(..., 273)` con 18 limbs; los 15 bytes de relleno se fuerzan a 0 en `age.go:213-215`), y `keccak(packet) == Words[19]` (`:37`). Por resistencia a colisiones de Keccak, esto liga **exactamente** los bytes del paquete al statement inmutable. ✔
3. Framing v2: `VDH2 ‖ quicknetHash` (`:28-29`), ronda BE de 8 bytes igual a `Words[15][1]` (`:30-36`).
4. `compressedG2Valid(packet[44:140]) == 0` (`:38-42`). `44:140` son los primeros 96 bytes de la cápsula, igual que en `codec-v2.ts:72` (`capsule: b.subarray(44, 172)`). ✔

No usa firma, beacon, H3 ni secretos del emisor. ✔

### Exclusión mutua con el camino válido

El camino de apertura válida (`capsule.go:91-96` y `main.go:39,45-47`) exige:
- bytes = `fieldBytes` canónicos de X.A1‖X.A0 con byte superior `+128+32·sign`, es decir flags `1,0,sign`;
- `AssertIsOnG2(U)`;
- U ≠ (0,0).

Es exactamente la misma definición de "válido" que `compressedG2Valid`. Mientras `AssertIsOnG2` de gnark sea sólido, no pueden existir a la vez una apertura válida y un certificado de invalidez para el mismo paquete. ✔

---

## 3. Solidez: argumento de por qué un U válido no se puede invalidar

Supongamos que U es válido: flags `1,0,s`, X canónico, punto P = (X, Y₀) ∈ G2 \ {O} con signo s.

1. **Bytes y flags** (`:42-56`). `top` sale en orden LSB-primero, así que `top[7]` es compresión, `top[6]` infinito y `top[5]` signo. Esto es coherente con `capsule.go:147-148`, que usa `top[1:]` como desplazamiento a la derecha. Los 3 bits altos se limpian antes de `parse`. `parse` arma 384 bits LE (último byte primero) y compara con `p` mediante `IsLessBinary` estricto. A1 usa los bytes enmascarados; A0 usa los 48 bytes completos. Coincide con zcash/gnark-crypto. Los tests cubren el borde `x = p` en ambos lados. Con esto, `compression=1`, `inf=0`, `canonical0=canonical1=1` y el prover no tiene ninguna libertad.
2. **X ligado** (`:58-59`). `AssertIsEqual` emulado trabaja mod p. Como los bits de entrada ya son canónicos, X es el valor exacto.
3. **Rama forzada** (`:68-71`). `rhs = X³ + 4(1+i) = Y₀² ≠ 0`. Con `HasSquare=0` haría falta `t² = −N(rhs)`. Pero N(rhs) = N(Y₀)² es un cuadrado en Fp, y −1 no lo es (p ≡ 3 mod 4), así que −N(rhs) no tiene raíz. **Insatisfacible.** Por tanto `HasSquare=1` y Y = ±Y₀.
   - Correspondencia norma/carácter: z^((p²−1)/2) = (z^(p+1))^((p−1)/2) = N(z)^((p−1)/2). ✔ La norma en Fp[i]/(i²+1) es a²+b² (`:68`). ✔
4. **Signo** (`:72-75`). Fuerza Y = Y₀. Aun sin esta restricción, −Y₀ ∈ G2, así que no sirve para forjar invalidez (ver H3').
5. **Subgrupo** (`:84-100`). La única libertad restante está en los hints emulados, cuya solidez depende de gnark. Las excepciones de la fórmula unificada son independientes de P cuando P ∈ G2:
   - Cada suma en la cadena es `add([m]P, P)` con m = 2·⌊r/2^(i+1)⌋ (par). Cada doblado es `add([k]P,[k]P)`.
   - Doblado excepcional ⇔ Y=0. Imposible: #E'(Fp2) = h₂·r es impar (h₂ termina en `…e5`), así que no hay 2-torsión.
   - Suma excepcional ⇔ y₁+y₂ = 0 ⇔ [m]P ∈ {−P, −φ(P), −φ²(P)} ⇔ m ≡ −1, −λ o −λ² (mod r), con λ ∈ {x²−1, −x²} (x = −0xd201000000010000, r = x⁴−x²+1).
   - −λ² ≡ x² = `0xac45a4010001a4020000000100000000` (128 bits). El único m de 128 bits en la cadena es 2·(r≫128) = `0xe7db4ea6…`. No coinciden.
   - −λ ≡ r+1−x² (255 bits). El único m de 255 bits es r−1, que corresponde a P+(−P) = O y es el caso **correcto** en el último paso.
   - **Conclusión:** para todo P ∈ G2 la cadena da [r]P = O y la excepción ω nunca se dispara. El test con el generador es representativo de todo G2 *en este aspecto concreto*, porque la condición depende solo de m mod r.
6. `nonIdentity = 1`, porque ningún punto de la curva es (0,0): con x=0, rhs = 4+4i tiene norma 32 = 2⁵, y 2 no es residuo porque p ≡ 3 mod 8.

Por tanto `valid = 1` y `AssertIsEqual(valid, 0)` falla. **Sólido**, condicionado a: (a) la solidez de los gadgets emulados de gnark (`IsZero` con reducción estricta, `Div`, `ToBitsCanonical`, `IsLessBinary`); (b) que `AddUnified` no tenga excepciones distintas de y₁+y₂=0, a verificar en `g2.go`; (c) H2.

Recomiendo dejar este argumento escrito en un comentario o un doc junto al circuito. Ahora mismo el comentario de `:82-83` afirma completitud sin justificarla.

---

## 4. Completitud: ¿se puede certificar todo U inválido?

| Clase | Testigo | ¿Completo? |
|---|---|---|
| compresión=0 o inf=1 | cualquier rama válida para X mod p | ✔ (`decodeG2Assignment` siempre produce uno) |
| X no canónico | X reducido mod p y una rama coherente | ✔ |
| rhs no cuadrado | `t = sqrt(−N)`, que existe porque N no es cuadrado | ✔ (`point_encoding_input.go:35-42`) |
| identidad `0xc0…` | inf=1; x=0 cae en la rama no-cuadrado | ✔ (testeado) |
| en la curva, fuera del subgrupo | Y forzado y `[r]P ≠ O` | ⚠️ **H1** |

### H1 — excepción ω de `AddUnified` para puntos fuera de G2 (Media-Alta, hipótesis)

**Línea:** `point_encoding.go:85` y el bucle `:94-99`.

Si `AddUnified` sigue el patrón de `sw_emulated` (λ = (x₁²+x₁x₂+x₂²)/(y₁+y₂); si `y₁+y₂=0` devuelve (0,0)), entonces para x₂ = ω·x₁, y₂ = −y₁ (Q = −φ(P), distinto de −P) devuelve O **incorrectamente**. Para un P de orden pequeño ℓ | h₂ (h₂ contiene 13² y 23²; con 13² | h₂ la 13-torsión es completa sobre Fp2), φ actúa sobre la 13-torsión con valores propios 3 y 9 mod 13. Si P es vector propio, cada suma con m ≡ −3 o −9 (mod 13) dispara la excepción, y en ~255 pasos es casi seguro que ocurra. El resultado final queda "aleatorio" dentro de un grupo pequeño. Con probabilidad del orden de 1/ℓ termina en (0,0): `inSubgroup=1`, `valid=1`.

**Consecuencias:**
- Para ese U no existe certificado de invalidez, y tampoco apertura, porque `AssertIsOnG2` lo rechaza. Un emisor malicioso puede buscar offline un U así y **bloquear la resolución** (griefing de vivacidad).
- `PointEncodingCircuit.Valid = 1` deja de ser un certificado positivo fiable de validez. Hoy nadie consume `Valid=1` de forma positiva, pero conviene documentarlo.
- **La solidez en la dirección crítica no se ve afectada** (§3.5).

**Recomendación:** sustituir la cadena por **fórmulas proyectivas completas Renes–Costello–Batina para a=0**. Son completas sobre cualquier curva sin puntos de orden 2, y E'(Fp2) tiene orden impar, así que no hay excepciones para ningún punto, tampoco para O. Se mantiene r como entero constante (nunca escalar reducido). La comparación final es Z == 0, donde ya no hace falta un centinela (0,0). La alternativa más barata es añadir un guard explícito que detecte `y₁+y₂=0 ∧ x₁≠x₂`, aunque entonces haría falta calcular la suma correcta en ese caso, lo que complica el circuito. RCB es más limpio y auditable.

---

## 5. Otros hallazgos

### H2 — mutación de `Ext2.One()` (Baja, hipótesis)
`point_encoding.go:63-65`. Si `One()` devuelve un `*E2` nuevo con copias de los valores (lo habitual en `fields_bls12381`), no hay problema. Si estuviera memoizado, sobrescribir `b.A0`/`b.A1` alteraría el 1 que usa `AddUnified` al sustituir el denominador. **Verificar en `fields_bls12381/e2.go`.** En cualquier caso, recomiendo construirlo explícitamente: `b := &fields_bls12381.E2{A0: emulated.ValueOf[...](4), A1: emulated.ValueOf[...](4)}`.

### H3' — la restricción de signo no está cubierta (Baja, evidencia)
`:75` es correcta y necesaria si alguna vez se quiere que el circuito identifique *qué* punto codifican los bytes. Para la invalidez es irrelevante, porque `inSubgroup(−P) = inSubgroup(P)`. El test `point_encoding_test.go:89-99` pasa igual sin `:75`, porque −G también es válido. Hacen falta un test de mutación y, si se quiere ejercitarla, un test que *pruebe* la identidad del punto (por ejemplo, exponer Y en un circuito de test y comprobar que con la raíz opuesta es insatisfacible).

### H4 — ramas defensivas muertas (Informativa)
`yZero` (`:72`), `signOK` (`:76`), `tangentZero` (`:87`), `norm≠0` (`:70`) y `nonIdentity` (`:101`) nunca valen distinto de lo trivial en esta curva. Conviene mantenerlas, pero con un comentario que explique *por qué* son inalcanzables (orden impar, x=0 fuera de la curva), para que nadie cuente "identidad" o "Y=0" como cobertura real. Nótese que la identidad solo es invalidable vía `inf=1` o x=0 en la rama no-cuadrado; nunca vía `nonIdentity`.

### H5 — redundancias en `invalid_point_v2.go` (Informativa)
`:34-35` ya están implicadas por `mission.go:78-80` más `:36`. Son inocuas, pero `cmp.IsLessOrEqual` sobre 64 bits añade restricciones. Se pueden dejar como defensa en profundidad o eliminarlas con un comentario.

### Notas de alcance (no son bugs)
- Solo se certifica **U**. Basura en V/W/mac/body es otra rama (pendiente declarado: "ramas criptográficas de basura").
- Un paquete con framing distinto de v2 (otra red, ronda distinta de la del contexto, longitud distinta de 273) **no tiene certificado aquí**. El test `wrong-network-is-not-admitted-v2-framing` lo confirma. Es aceptable *solo si* la admisión v2 garantiza el framing; eso es un requisito duro para el consumidor y la admisión futuros (pendiente declarado de disponibilidad/consumidor, que el README ya menciona para la ronda).
- La interoperabilidad con tlock-js/noble (que noble acepte y rechace exactamente los mismos bytes) no está probada. Conviene añadirlo como test diferencial off-chain, sin precompilados.

---

## 6. Límites de la evidencia actual

1. **Solver honesto.** `cs.IsSolved` ejecuta los hints de forma honesta. Ningún test explora salidas maliciosas de hints (Div, IsZero, ToBits emulados), así que la solidez frente a un prover adversario descansa en gnark, no en los tests.
2. **Pocos testigos adversarios.** Solo se prueba la raíz opuesta, que además es inocua. Faltan: `HasSquare=0` con t arbitrario sobre un U válido, Y arbitrario, `NonResidueRoot` arbitrario y `HasSquare=1` sobre rhs no cuadrado.
3. **Un único punto fuera del subgrupo**, de orden grande (x pequeño). No toca órdenes pequeños, que es donde vive H1.
4. **Bordes canónicos incompletos.** Se prueba `x=p`, pero no `x=p−1` (válido sintácticamente), A0 ≥ 2^381 (bits altos del byte 48), ni A0 = 2^384−1.
5. **`invalid_point_v2_test.go`** solo cubre el flag de compresión y la identidad dentro de la misión. No cubre no-canónico, no-cuadrado ni fuera de subgrupo dentro de la relación completa. Es el mismo gadget, pero cambia el contexto de bytes (`packet[44:140]`).
6. **Sin mutaciones.** Nada demuestra que cada restricción sea necesaria para que algún test falle.
7. El argumento de §3.5 es analítico; ningún test lo fija.

---

## 7. Recomendaciones (por prioridad)

1. **(H1)** Reimplementar `[r]P` con fórmulas completas RCB (a=0, sin 2-torsión), manteniendo r como entero constante de 255 bits.
2. **(H2)** Construir `b` sin mutar `Ext2.One()`, y verificar el código de `One()`.
3. Documentar en el código el argumento de §3 (exclusión mutua, rama forzada por −1 no residuo, ausencia de excepciones ω en la cadena de r para G2, orden impar).
4. Dejar explícito que `PointEncodingCircuit.Valid=1` no es un certificado positivo hasta resolver H1.
5. Mantener los guards defensivos con comentarios sobre por qué son inalcanzables.

## 8. Próximos tests propuestos

- **Puntos de orden pequeño:** para ℓ ∈ {13, 23, …} | h₂, generar P = [h₂·r/ℓ]Q a partir de Q aleatorios en la curva, incluidos vectores propios de φ (P y φ(P)−[λ_ℓ]P). Exigir `Valid=0` y que el certificado sea satisfacible. Si falla, confirma H1.
- **Puntos de orden r·ℓ y de orden h₂** (sin componente en G2).
- **Fuzz diferencial** de 96 bytes aleatorios y estructurados contra `bls.G2Affine.SetBytes` + `IsInSubGroup`, y fuera del circuito contra noble/tlock-js.
- **Testigos adversarios** sobre U válidos: `HasSquare=0` con t aleatorio, `HasSquare=1` con Y aleatorio y con −Y, y comprobar que todos son insatisfacibles con `Valid=0`.
- **Bordes canónicos:** `p−1`, A0 con bits 381-383 activos, `2^384−1`, y A1 con flags y X = p tras el enmascarado.
- **Test analítico** que recorra la cadena de r y afirme que ningún m de suma es ≡ −λ o −λ² (mod r) y que −1 solo aparece en el último paso.
- **Mutation testing**: borrar `:75`, `:52` (cada lado), `:41` y `:70` uno por uno, y exigir que algún test falle.
- **Relación completa** (`InvalidPointMissionV2Circuit`) con vectores no-canónico, no-cuadrado y fuera de subgrupo, además de un caso con relleno no nulo en el último limb de `PacketPacked`.

---

## 9. Pendientes ya declarados (fuera del alcance de estos archivos)

- H3 externo / agotamiento del muestreo por rechazo (`capsule.go:22`, "no witness ≠ proof of invalidity").
- Disponibilidad del paquete y garantías de admisión v2 (framing, ronda, longitud).
- El consumidor debe fijar el verificador y la versión y buscar el statement original (`invalid_point_v2.go:12`).
- Resolución histórica: no se reinterpretan las llegadas que el Game actual admite.
- No hay integración con Game ni nueva prueba Groth16, ni medición del certificado completo.

Lo que **sí es nuevo** en estos archivos: H1 (completitud y griefing por la fórmula unificada), H2 (hipótesis de mutación de una constante) y la falta de cobertura real de la restricción de signo y de los puntos de orden pequeño.
