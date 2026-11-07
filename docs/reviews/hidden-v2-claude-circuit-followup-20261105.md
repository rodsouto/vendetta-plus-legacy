# Revisión de seguimiento de H1, H2, H3 y `CompactCapsuleCircuit`

**Veredicto:** H1, H2 y H3 no quedan abiertas como vulnerabilidades, y retiro la redacción condicional de impacto crítico o alto. Con el código suministrado no queda ningún defecto concreto demostrado, así que no hace falta cambiar circuitos, repetir un setup ni ejecutar el juego.

Solo leí el texto suministrado y no ejecuté nada. Es una revisión técnica con IA, no una auditoría profesional ni una aprobación de producción.

## Hipótesis

| Hipótesis | Estado | Motivo principal |
|---|---|---|
| H1, emisor elige consumidores | **Falsada en las librerías visibles** | La admisión no recibe direcciones del emisor |
| H1, segundo `bind` | **Falsada** | `initialize` revierte si `status != 0` |
| H2, alias de campo en `cmp` | **Falsada** | `ToBinary` aplica la comprobación de módulo por defecto |
| H3, `AddUnified` incompleta | **Falsada y retirada** | La implementación real separa cuerda y tangente |

### H1: consumidores y re-bind

**Retracto la severidad crítica.** Mi trigger suponía que la admisión podía aceptar direcciones elegidas por el emisor, y el código visible no lo permite:

- `HiddenAdmission.bind(id, packet)` no recibe direcciones. Lee las de storage (`HiddenAdmission.sol:26-29`).
- Esas direcciones se fijan en `initialize`, que es `internal` y exige código en ambas (`HiddenAdmission.sol:11-18`).
- `HiddenEvidence.bind` y `bindPacket` son `internal`. En el código visible, solo `HiddenAdmission.bind` llega a ellas.
- La misión copia los consumidores una sola vez, y `submit` usa esa copia (`HiddenEvidence.sol:45-47`, `:73`, `:77`).

El re-bind también queda cerrado:

- `HiddenResolution.initialize` revierte si `status != 0` (`HiddenResolution.sol:35`).
- `HiddenEvidence.bind` llama a esa comprobación antes de escribir los consumidores (`HiddenEvidence.sol:45-47`).
- `HiddenContext.t.sol:79-80` ya cubre un segundo `bind`, aunque con el mismo paquete.

La regresión de Foundry que propuse para H1 no es necesaria por este motivo. Solo queda confirmar la superficie de `Game` (dependencia 1).

### H2: alias en `cmp`

**Retracto la hipótesis.** La ruta real es esta:

1. `cmp.IsLessOrEqual` llama a `bits.ToBinary(api, a)` sin opciones (`generic.go:34-36`).
2. El ancho por defecto es `FieldBitLen` (`conversion_binary.go:76`).
3. Por tanto, `omitReducednessCheck` es falso: `upperBound` es nil, no se pidió omitir el módulo y `NbDigits` no es menor que `FieldBitLen` (`:125-126`).
4. Se aplica `MustBeLessOrEqCst(bits, q-1, v)` (`:161-167`).
5. Si el builder no expusiera esa función, el código entraría en `panic` (`:168-169`). No se omite en silencio.

La descomposición `a+q` queda rechazada y el INVALID falso por alias no aplica. La regresión con `OverrideHint` era opcional y no hace falta para cerrar H2. Tampoco procede cambiar a anchos acotados.

### H3: `AddUnified`

**Retracto H3 por completo.** Asumí Brier-Joye con salida `(0,0)` cuando `y1+y2=0`, y v0.16.4 no hace eso. El propio comentario describe exactamente ese antiguo fallo y su sustitución (`g2.go:245-258`).

Casos de la implementación real:

| Caso | Comportamiento | Referencia |
|---|---|---|
| `x_P≠x_Q` | Cuerda correcta, incluso con `y_P+y_Q=0` | `g2.go:274-279`, `:281-287` |
| `P=Q`, `y≠0` | Tangente correcta para `a=0` | `g2.go:270-275` |
| `P=-Q`, ambos finitos | Infinito | `g2.go:297-307` |
| Una entrada es `(0,0)` | Devuelve la otra | `g2.go:294-295` |
| Ambas son `(0,0)` | Devuelve `(0,0)` | `g2.go:294-295` |

En `point_encoding.go`:

- `safe` siempre está en la curva. Si `HasSquare=1`, `curveOK` queda forzado a 1 (`:70`). Si no, `safe` es el generador (`:78`).
- `(0,0)` no pertenece a la curva, porque `b≠0`, así que no colisiona con ningún punto finito.
- Por tanto, cada paso del bucle es la ley de grupo exacta, `acc=[r]safe`, e `inSubgroup` es exacto (`:93-99`).
- `tangentZero` (`:85-87`) es inofensivo. Tampoco aplica a puntos finitos si el orden del grupo es impar, como se deduce del `h` y el `r` que usa el test.

Con esto retiro también lo siguiente:

- El reinicio del acumulador y el `inSubgroup=1` falso.
- El griefing de liveness.
- La traza de orden 13 y los subespacios propios de φ.
- La factorización pendiente y el supuesto sobre 13-torsión.
- La regresión con `φ(P)-[k]P`.
- La corrección del comentario de `point_encoding.go:81-82`, que es correcto para esta versión.

## Contexto de `CompactCapsuleCircuit`

**Retracto que `capsule.go` fuera «otra implementación» y que la vinculación del KEM solo quedara revisada por analogía.** `CompactCapsuleCircuit` es un envoltorio:

- Construye `CapsuleCircuit` con `Signature`, `U`, `GT` y `CapsuleValid` (`capsule_compact.go:44`).
- Desempaqueta firma, cápsula y `FileKey` (`:45-51`).
- Delega en `inner.defineWithExternalH3` (`:52`).

Lo que queda visible:

- `unpack128` limita cada entrada a 128 bits, en big-endian, coherente con `compactCapsuleAssignment` (`:26-37`, `:72-78`). El test rechaza el desbordamiento de 2^128 (`capsule_compact_test.go:59-61`).
- `PairCircuit` exige `AssertIsOnG1`, `AssertIsOnG2`, puntos distintos de `(0,0)` y `Pair == GT` (`main.go:38-39`, `:44-47`, `:52`).
- El beacon usa la misma firma del KEM (`beacon.go:108`).
- `Round` se vincula a la palabra 15 del contexto (`mission_v2.go:38`).
- La `U` testigo no aporta líneas precomputadas: los placeholders no las inicializan, así que `Pair` las calcula en el circuito (`g2.go:37-42`). Las líneas constantes del beacon se crean con puntos fijos, y `NewG2AffineFixed` rechaza puntos fuera del subgrupo (`beacon.go:69-70`, `g2.go:149-164`).

**Límite:** este paquete no incluye `capsule.go`, así que no puedo citar el cuerpo de `CapsuleCircuit.defineWithExternalH3`. Mi lectura previa de ese archivo pasa a ser directa si corresponde a esta misma función (dependencia 2).

## Defectos restantes

**Ninguno demostrado.** No propongo regresiones nuevas, porque ninguna responde a un defecto concreto. Las dependencias siguientes son comprobaciones de lectura o de aritmética acotada.

## Dependencias restantes

1. **`Game.sol`, solo lectura.**
   - `HiddenAdmission.initialize` debe ejecutarse únicamente en el inicializador protegido, sin setter posterior de `hiddenOpeningConsumer` ni `hiddenInvalidPointConsumer`.
   - Todo envío oculto debe llamar a `HiddenAdmission.bind` con el paquete exacto emitido en esa transacción.
   - Ningún camino debe hacer `delete` de `hiddenEvidence[id]`.
   - Un upgrade del admin puede cambiar esta lógica. Es un supuesto de confianza, no un fallo del emisor.

2. **`capsule.go`.** Hay que confirmar que `defineWithExternalH3` es la función revisada y que ejecuta las restricciones de `PairCircuit`. No está visible que `inner` invoque `Pair.Define`.

3. **`mission.go`.** No viene en este paquete. El cierre de H2 asume que `:136`, `:199`, `:229` y `:233` siguen usando `cmp.IsLessOrEqual`, como en la ronda anterior.

4. **Upstream de campo y comparación.**
   - `Ext2.IsZero`, `Ext2.IsEqual` y `emulated.IsZero`, de los que depende que el selector de `AddUnified` sea sólido.
   - El cuerpo de `MustBeLessOrEqCst` y `ToBase`.
   - `BoundedComparator`, solo si alguna comparación tiene dos operandos no constantes (`generic.go:83-95`). El cierre del alias no depende de esto.

5. **`Pairing.AssertIsOnG1` y `Pairing.AssertIsOnG2`.** No están suministrados.
   - La consideración sobre `sig+T` solo importa si `AssertIsOnG1` no comprueba el subgrupo.
   - Si `AssertIsOnG2` delega en `g2.go:564-576`, usa fórmulas incompletas (`triple`, `doubleAndAdd`). El cierre de `AddUnified` no se traslada a esa ruta.
   - Esto no es un hallazgo. Un caso `0/0` que dejara λ libre exigiría `ord(Q) | z-1` en algún `doubleAndAdd` (`g2.go:219-228`).
   - La comprobación acotada es `gcd(z-1, h·r)=1` para `z ∈ {6, 52, 26880, 53761·2^31}`, con `h` de `point_encoding_test.go:178`. Solo es aritmética entera, sin tocar circuitos ni ejecutar el juego.

6. **Política de despliegue.** Hay que confirmar en `Deploy.s.sol` si es una lista de permitidos. `DeployPolicy.t.sol:11` solo prueba cuatro cadenas rechazadas. Esto afecta a la operación, no a la solidez del protocolo.

7. **Resto de upstream criptográfico.** `HashToG1`, `PairingCheck` y el comb de base fija siguen siendo supuestos para la unicidad de GT, sin indicio de fallo.
