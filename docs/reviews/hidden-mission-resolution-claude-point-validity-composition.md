# Adenda (ronda 5): H7 dentro de la relación completa

Solo he leído código; no ejecuté comandos ni edité nada. Esta vez leí el módulo que se compila de verdad (`gnark@v0.16.4`): `g2.go:559-670` y `:743-807`, `fixedbase_g2.go` completo, `g1.go:236-257` y `pairing.go:329-380`. No lo comparé con la copia de `/tmp`, así que la duda de procedencia de H1 sigue igual.

## Veredicto

**El argumento es correcto en lo esencial.** Dentro de `MissionV2Circuit`, H7 no da validez falsa ni invalidez falsa de una misión válida. Pero no elimina la dependencia: la cambia de sitio. Además, el argumento olvida un punto: la autenticación de G1 no tiene un ancla externa equivalente.

## Por qué H7 no afecta al resultado

1. **`AssertIsOnG2` no produce ningún valor que se use después.** `xQ` y `psiQ` solo entran en `AssertIsEqual` (`g2.go:570-575`). La libertad 0/0 solo puede hacer que se acepten más testigos. No puede cambiar ningún bit calculado (`CapsuleValid`, `Valid`). Esto refuerza el argumento más que el rP check en sí.
2. **valid = 1 implica U ∈ G2, sin usar `AssertIsOnG2`.**
   - `Valid = And(crypto, predicado)` y `crypto` incluye `KEM.CapsuleValid` (`mission_v2.go:63-65`, `mission.go:241`).
   - `CapsuleValid = IsEqual(ScalarMul(G, r), U)` (`capsule.go:170-172`).
   - G es constante, así que `ScalarMul` va por el comb de base fija (`g2.go:767-768`), cuyas tablas se validan en subgrupo (`fixedbase_g2.go:76`).
   - Si el comb y `IsEqual` son sólidos, U = [r]G coordenada a coordenada.
3. **Una U válida da un `CapsuleValid` fijo.**
   - U queda fijada por sus bytes. `AssertIsOnTwist` es polinómico y sin divisiones (`g2.go:559-562`). Están ligados X y el bit de signo, con `ToBitsCanonical` (`capsule.go:91-96`), y no hay 2-torsión que deje el signo ambiguo.
   - r lo fija el consumidor (`MissionV2Consumer.sol:51-55`).
   - Para U de orden primo q, `scalarMulBySeed` no llega a 0/0: haría falta k₁U = ±k₂U con |k₁∓k₂| < q. Por tanto, la parte de completitud también se cumple.
4. **Una U fuera del subgrupo no tiene testigo honesto en este circuito**, porque `AssertIsOnG2` es una restricción dura (`main.go:39`). Solo la puede probar `InvalidPointMissionV2Circuit` (`invalid_point_v2.go:42`). Si H7 fuera explotable, un prover obtendría además un `MissionV2` con `Valid = 0`. Ese resultado es verdadero: tlock también exige rP == U. No hay conflicto mientras el Game trate «inválida» igual en las dos ramas.

**Clasificación:** H7 es como mucho un **bug genérico de gnark** (`AssertIsOnG2` o `IsOnG2` usados de forma aislada). **No es explotable en esta relación.** No pido cambiar el circuito por H7.

## Dependencias que el argumento no menciona

- **La solidez pasa de `AssertIsOnG2` a `ScalarMul` de base fija.** El comb usa cuerdas incompletas con λ sacado de un hint (`fixedbase_g2.go:321-350`). Si λ quedara libre, `expected` sería arbitrario. Eso daría validez falsa e invalidez falsa a la vez, así que es más grave que H7.
  - gnark dice que el comb está «provably collision-free» (`:18-24`). No lo he demostrado.
  - El recodificado admite varias representaciones k′ ≡ r (mod q) (`:404-411`). El prover tiene un margen pequeño y la ausencia de colisiones tiene que valer para cualquier patrón de bits.
  - Supuesto adicional: que `curve.NewG2Affine(gen)` dé limbs constantes (`g2CombTryConst`, `:472-497`). Si no, se usaría GLV+FakeGLV con `assertPointInSubgroup` (`g2.go:770-771`), que también es un supuesto genérico.
- **`IsEqual` depende de `emulated.IsZero`** (`g2.go:666-670`). Es el mismo supuesto que ya estaba abierto en la ronda 4.
- **Salidas cuando `Valid = 0`.** `check` devuelve `plain` siempre (`MissionV2Consumer.sol:67-68`). En la rama hipotética de H7, o cuando falla la parte criptográfica, `plain` no significa nada. El Game no debe usarlo si `valid == 0`.
- **Agotamiento (EXHAUSTED).** Con s = 0 el comb devuelve (0,0) (`fixedbase_g2.go:394`) y U ≠ identidad. Por tanto `CapsuleValid = 0`, y además el consumidor exige `x[14] = x[50] = 0` (`:59`). Queda cubierto por el consumidor.

## G1: aquí sí falta una garantía

Para U, el rP check actúa como ancla externa. Para la firma no hay nada equivalente:
- `SignaturePacked` es entrada pública, pero el consumidor no la compara con nada.
- La firma solo queda fijada por la verificación BLS dentro del circuito (`beacon.go:33-72`). Esa verificación depende de:
  - `AssertIsOnG1`: preimagen S a partir de un hint, comprobando [x−1]S == P (`g1.go:242-256`). No he auditado la completitud de la cadena [x−1] en `sw_emulated`.
  - `HashToG1`.
  - `PairingCheck` con G2 fijos.
  - La unicidad de las firmas BLS.

Para tener invalidez falsa haría falta una sig′ ≠ sig que pase esa verificación y dé un GT distinto. Si se saltara el chequeo de subgrupo con sig′ = sig + T, donde el orden de T es coprimo con q, el emparejamiento reducido probablemente anula T. Entonces GT y σ serían los mismos y no habría efecto, **pero no está demostrado** (incluye la evaluación de líneas en P dentro del circuito). La forma barata de quitar esta dependencia es que el Game ligue `SignaturePacked` a un beacon verificado de forma independiente (`BeaconCircuit` o almacenado on-chain). La alternativa es un test adversario con sig + T, con T de orden 3 y 11.

## Garantías pendientes (resumen)

| Garantía | Tipo | ¿Bloquea esta relación? |
|---|---|---|
| Solidez genérica de `AssertIsOnG2` / `IsOnG2` (H7) | gnark genérico | No |
| Comb de base fija sin colisiones, para cualquier recodificado | gnark genérico | **Sí** (sustituye a H7) |
| Solidez de `emulated.IsZero` / `ToBitsCanonical` | gnark genérico | Sí |
| G1: subgrupo, `HashToG1`, `PairingCheck` y unicidad de la firma | gnark + diseño | Sí para la invalidez falsa, salvo que el Game fije `SignaturePacked` |
| No usar `plain` cuando `valid = 0`; mismo efecto «inválida» en las dos ramas | consumidor/Game | Sí |
| Procedencia de v0.16.4 frente a `/tmp` (H1) | proceso | Sin cambios |

**Estado de H7:** como riesgo de esta composición, **queda descartada por la estructura de la relación**, condicionada a la solidez del comb de base fija y de `IsZero`. Como defecto genérico de gnark, **sigue abierta** y no está demostrada.
