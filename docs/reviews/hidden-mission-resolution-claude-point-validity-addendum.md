# Adenda (ronda 4): verificación de H1 y H2 con acceso a las dependencias

Revisión de solo lectura. No he editado ni ejecutado nada. La revisión original queda como histórica.

## Acceso y procedencia

- He leído `/tmp/vendetta-opening-tools/gnark/std/algebra/emulated/sw_bls12381/g2.go` (líneas 192-476, 564-670), `fields_bls12381/e2.go`, `std/math/emulated/field.go` (`One`/`Zero`), `field_ops.go` (`Select`) y `field_assert.go` (`IsZero`, solo la primera parte).
- **Limitación que sigue abierta.** `go.mod` del experimento exige `gnark v0.16.4` y no tiene `replace`, así que se compila la copia de `~/go/pkg/mod/github.com/consensys/gnark@v0.16.4`. Ese directorio no se añadió con `--add-dir` (solo se añadió gnark-crypto). Sin ejecutar comandos no puedo calcular el SHA256. Que la copia de `/tmp` coincida con lo que se compila **lo tomo de la palabra del usuario, sin haberlo verificado yo**.

## H1: descartada por el código (ya no es bug)

`AddUnified` (`g2.go:243-310`) ya no usa Brier–Joye. Revisé todos los casos con entradas en la curva o el centinela (0,0):

| Caso | Rama | Resultado |
|---|---|---|
| x₁ ≠ x₂, incluido el caso ω (x₂ = ω·x₁, y₂ = −y₁) | cuerda, den = x₂−x₁ ≠ 0 | correcto |
| P = Q, Y ≠ 0 | tangente, den = 2Y ≠ 0; `isInverse = 0` porque `yEqual = 1` | correcto |
| P = −Q (Y ≠ 0) | `isInverse = 1` → (0,0) | correcto |
| una entrada es (0,0) | `Select(isPInf/isQInf)`; `isInverse` exige `areFinite` | correcto |
| ambas (0,0) | devuelve p = (0,0) | correcto |
| P = Q con Y = 0 | λ = 0 → (−2x, 0) | **incorrecto en gnark**, pero lo cubre el wrapper local (`point_encoding.go:86-88`) y además es inalcanzable (no hay 2-torsión) |

Con esto, la cadena `[r]P` de `point_encoding.go:90-99` es **completa** para cualquier punto de E'(Fp2), también los de orden pequeño. El escenario de griefing de la §4 (un U fuera del subgrupo con `inSubgroup = 1`) **no existe**. Dejan de ser necesarias:
- la recomendación de usar RCB (§7.1);
- la advertencia de que «`Valid = 1` no es certificado positivo» (§7.4).

El argumento de la §3.5 sobre los m de la cadena sigue siendo cierto, pero ya no hace falta para la solidez.

**Corrección a H4.** `tangentZero` **sí se activa**: en los doblados iniciales de `acc = (0,0)` se cumplen `same = 1` y `Y = 0`. Es inocuo, porque `AddUnified` ya devuelve (0,0) en ese caso. Lo que nunca se activa es el caso Y = 0 en un punto finito.

**Supuestos que quedan:** que `emulated.IsZero` sea sólido (reducción y comparación con 0 o p, `field_assert.go:153+`) y que `DivUnchecked` sea sólido con `denSafe ≠ 0`. Ambos son gadgets estándar de gnark y no he auditado el final de `IsZero`.

## H2: descartada

- `Ext2.One()` (`e2.go:225-232`) devuelve un `&E2{A0: *z0, …}` **nuevo**.
- `fp.One()` sí está memoizado (`field.go:200-205`), pero se desreferencia y se copia por valor.
- `b.A0 = ValueOf(4)` reemplaza el struct completo y no escribe en el array de `Limbs` compartido. La constante 1 global no se corrompe.

Sigue siendo recomendable, por estilo, construir `b` con `fp.NewElement(4)` (como hace `g2.go:70`) en vez de mutar `One()` y usar `ValueOf` (pensado para asignar testigos). No es un bug.

## Nueva hipótesis (H7, sin resolver): `AssertIsOnG2` en el camino de apertura válida

La exclusión mutua de la §2 da por hecho que `AssertIsOnG2` (`main.go:39`, `g2.go:564-576`) es sólido. Esa función usa `scalarMulBySeed`, que se apoya en `triple`/`double`/`doubleAndAdd`. Son fórmulas **incompletas** con `DivUnchecked` sin protección. Si numerador y denominador son ambos 0, la restricción `x == div·y` deja λ libre al prover.

- Ejemplo concreto: `scalarMulBySeed` calcula [24]Q y llama a `doubleAndAdd(z, q)` (`g2.go:221-223`). Si Q tiene orden 23 (23 | h₂), entonces [24]Q = Q y `doubleAndAdd` (`:455-457`) da 0/0.
- Para explotarlo, el prover tendría que elegir λ de forma que el resultado final sea igual a ψ(Q). Eso parece exigir resolver una ecuación racional de grado enorme en Fp2, así que **probablemente no es explotable en la práctica, pero no está demostrado**.
- Si lo fuera, rompería la exclusión mutua: habría apertura «válida» de un U inválido. No afecta al certificado de invalidez en sí.
- Es un problema de solidez de la apertura, no de este circuito, pero condiciona la conclusión de la §2.

## Pruebas que siguen siendo necesarias

1. **Regresión de H1.** Puntos de orden 13 y 23 (incluidos los vectores propios de φ) y pares P, −φ(P) dentro de `compressedG2Valid`: exigir `Valid = 0` y certificado satisfacible. Así se fija que una versión futura de gnark no reintroduzca la excepción.
2. **H7.** Un testigo adversario sobre `AssertIsOnG2` con Q de orden 23 (y también 13·23, etc.), con un hint de división malicioso. Como mínimo, documentar el supuesto o sustituirlo por una comprobación de subgrupo con suma completa (por ejemplo, reutilizar la cadena `[r]P` de `point_encoding.go`).
3. Siguen vigentes de §8: testigos adversarios sobre U válidos, bordes canónicos (`p−1`, bits 381-383 de A0), tests de mutación (`:75`, `:52`, `:41`, `:70`), la relación completa `InvalidPointMissionV2Circuit` con vectores no canónicos, no cuadrados y fuera del subgrupo, y fuzz diferencial contra gnark-crypto y noble.
4. **Procedencia.** Comprobar en CI el SHA256 de `g2.go` en el módulo realmente compilado (`go mod verify` y el hash del archivo), porque el arreglo de ω no está en el `AddUnified` de upstream que describía la §4.

## Estado actualizado

| # | Estado |
|---|---|
| H1 | **Descartada** por el código (con el supuesto de procedencia indicado arriba) |
| H2 | **Descartada** |
| H3', H5, H6 | Sin cambios |
| H4 | Corregida: `tangentZero` se activa sobre (0,0), de forma inocua |
| H7 | **Nueva, sin resolver**: posible libertad 0/0 en `AssertIsOnG2` (camino de apertura válida) |
