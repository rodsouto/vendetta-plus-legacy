# Revisión técnica de `mpcstaged`, `mpcstream` e integración CLI

Esta revisión asistida por IA no es una auditoría independiente ni aprueba la ceremonia o el despliegue. No ejecuté nada: todo sale de leer las fuentes suministradas. Las rutas son relativas a `apps/web/scripts/experiments/opening-zk/`.

**Veredicto:** no encontré ningún defecto aritmético ni divergencia con el código nativo suministrado en entradas soportadas. Los hallazgos demostrados son cuatro y de severidad baja: tres son contratos de API o de orden de fallo que la CLI actual evita o solo retrasa, y uno es de procedencia.

**Límite principal:** ni las comparaciones pequeñas, ni `Phase2.Verify`, ni las tres pruebas reales demuestran que los vectores iniciales correspondan a todas las filas y wires del circuito grande.

## 1. Hallazgos demostrados

### F1. `Seal` no valida todas las dimensiones (baja)
- **Referencias:** `mpcstaged/seal.go:16-19`, `mpcstaged/README.md:71-72`, upstream `setup.go:31,103-111`.
- **Disparador:** llamar a `Seal` con `len(evals.G1.CKK) > len(p.Sigmas)`, por ejemplo tras `append(e.G1.CKK, nil)`.
- **Consecuencia:** hay un `panic` en `setup.go:107` después de `p.update`, aunque el README promete fallar antes del beacon. Con menos CKK, o con `AlphaTau` de otro dominio, las líneas visibles no devuelven error antes de `vk.Precompute` (fuente no incluida).
- **CLI actual:** no se dispara, porque usa artefactos pineados (`phase2_seal.go:48-69,75,86`).
- **Regresión mínima:** añadir a `seal_test.go` los modos `extra-commitment`, `missing-commitment` y `domain`. Cada uno debe exigir error y `p` sin cambios.
- **Corrección mínima**, antes de calcular los flags:

```go
k := len(p.Sigmas)
if len(commons.G1.AlphaTau) != len(p.Parameters.G1.Z)+1 || len(commons.G1.BetaTau) == 0 ||
	len(p.Parameters.G1.SigmaCKK) != k || len(p.Parameters.G2.Sigma) != k ||
	len(evals.G1.CKK) != k || len(evals.PublicAndCommitmentCommitted) != k {
	return nil, nil, errors.New("seal dimensions differ")
}
for i := range k {
	if len(evals.G1.CKK[i]) != len(p.Parameters.G1.SigmaCKK[i]) {
		return nil, nil, errors.New("seal commitment dimensions differ")
	}
}
```

### F2. `Assemble` acepta un `Layout` no vinculado al CS (baja)
- **Referencias:** `mpcstaged/initialize.go:24-27,268-319`.
- **Disparador:** `Layout` es exportado y `Assemble` solo comprueba `Wires` mediante el conteo de los vectores.
  - Truncar `Commitments` a un elemento en un fixture de dos compromisos mueve wires a `PKK` sin error.
  - Invertir `Commitments` deja una entrada sin consumir en `seen`, y tampoco hay comprobación final. `GetPublicAndCommitmentCommitted` no está incluido, pero las líneas visibles no lo rechazan.
- **Consecuencia:** un llamador directo puede obtener una partición distinta de la que corresponde al CS vinculado por `Prepare`.
- **CLI actual:** pasa el `Layout` recién devuelto (`phase2_init.go:185,195`) y valida los tamaños después (`:239,254`).
- **Regresión mínima:** con `fixture(t, 9, 2)`, probar `Commitments[:1]` e invertido. Ambos deben devolver error.
- **Corrección mínima:** guardar el layout en un campo no exportado de `Store` durante `Prepare` y usar `Assemble(s)` sin parámetro. Comprobar además, antes de devolver:
  - `seen == len(l.Commitments)`
  - `len(e.G1.VKK) == l.Public+len(l.Commitments)`
  - `len(p.Parameters.G1.PKK) == cap(p.Parameters.G1.PKK)`

### F3. El CS se comprueba después de escribir las claves (baja)
- **Referencias:** `cmd/mpc-local-pipeline/phase2_seal.go:99,112-148`.
- **Disparador:** pasar un `o.CS` incorrecto.
- **Consecuencia:** el error llega tras completar el sellado. Quedan `proving.key`, `verifying.key`, `Verifier.sol` y `circuit.bin`, sin `manifest.json` ni `keys.json`. No se emite el recibo final, pero queda salida parcial con nombres válidos.
- **Regresión mínima:** en una prueba de proceso con dominio `log2=3`, usar un CS distinto. Debe fallar sin crear `proving.key`.
- **Corrección mínima:** abrir y hashear `o.CS` antes de leer commons, conservar el descriptor y hacer `Seek(0)` antes de copiarlo.

### F4. El recibo final no distingue el camino de inicialización (baja, procedencia)
- **Referencias:** `cmd/mpc-local-pipeline/phase2_init.go:24-39,230`, `phase2_seal.go:163`.
- **Disparador:** cualquier ejecución staged o reanudada.
- **Consecuencia:** el esquema de `phase2-init.json` es idéntico al nativo y no registra `Algorithm` ni el índice final. La cadena de `keys.json` no vincula esa procedencia; hay que inferirla de `checkpoints.jsonl` y `staged-cache`.
- **Regresión mínima:** comprobar que los recibos futuros staged y nativo difieren en campos explícitos.
- **Corrección mínima:** añadir esos campos solo en un esquema futuro. Para las ejecuciones existentes, crear un recibo aparte sin tocar los originales.

## 2. Sospechas no demostradas

| ID | Sospecha | Forma de falsarla |
|---|---|---|
| S1 | El fixture probablemente no ejercita `CoeffIdTwo`, pese al comentario de `initialize_test.go:40`: usa `17`, `-2` y `5`, y el `+2` de `api.Add(v, i+1)` entra en `Commit`. La rama es textualmente nativa (`initialize.go:101-102,119-120`). | Contar `t.CoeffID()` en el fixture. Si falta, añadir `api.Mul(c.X, 2)`. |
| S2 | El hash de `Prepare` depende de que `ReadFrom` + `WriteTo` reproduzca byte a byte el CS real, y ese coste de memoria puede no estar en las mediciones congeladas. El fallo sería cerrado. | Sin MPC ni FFT, leer el CS real bajo los límites staged y comparar `WriteTo` con el pin. |
| S3 | Los flags de reanudación se ignorarían sin `--staged-initialization`; `phase2_init.go:180-181` solo los usa en staged, y `main.go` no está incluido. | Ejecutar `log2=3` con `--resume-cache` sin el flag staged; debe rechazarse. |
| S4 | `payload` (`evaluations.go:98`) podría desbordarse si `EvaluationWireSize` no acota `Committed`. Requiere un JSON pineado incorrecto, así que no es entrada soportada. | Probar `Committed: []uint64{1 << 58}` y exigir rechazo. |
| S5 | La validación de puntos con pin correcto depende del chequeo de subgrupo por defecto del decoder. Las pruebas suministradas cubren framing y digest, no ese caso. | Crear un vector G2 en curva, fuera del subgrupo y con pin coincidente; debe fallar. |

## 3. Cobertura y dependencias

### Establecido por lectura
- **FFT:** butterflies, kernels, recursión y `bitReverse` coinciden con upstream.
- **Twiddles:** `inverseDomain` reproduce `buildTwiddles`, y el cálculo paralelo solo reparte índices independientes.
- **Acumulación:** `A`, `B`, `G2.B` y `k = C + αB + βA` usan las mismas filas y bases que `phase2.go:232-245`.
- **Z:** la última posición queda fija con `bitReverse` en tamaño `n`. El `bitReverse` de `Seal` es un no-op para todo `n ≥ 2`, porque `n-1` es impar y el desplazamiento es de 64.
- **Commons:** `tau1`, `tau2`, `beta` y `alpha` coinciden con la disposición cubierta por las pruebas, y `ReadSealCommons` retiene los campos que `Seal` usa.
- **Seal:** la compactación in-place es segura porque `j ≤ i`, y `Phase2.Seal` solo usa `A/B/B2` para el filtrado que el adaptador rellena después.
- **Reanudación:** el contexto, el orden de las 11 etapas y los fallos parciales son coherentes. Un vector con hash válido sigue siendo trabajo confiado, no prueba de derivación.

### Lo que las comparaciones pequeñas no establecen
- **Rama secuencial de la FFT:** con `n ≤ 128`, las etapas no-kernel llegan a 3. En hosts con más de 8 CPUs, `lagrange.go:163-166` no se ejecuta en la prueba integral, aunque el texto sea nativo.
- **Conmutatividad:** la igualdad con otro orden de suma depende de que `Add` sea completo y normalice a afín canónico. Esa fuente no está incluida.
- **Forma real del circuito:** el fixture no prueba blueprints reales, listas grandes de compromisos ni el round-trip del CS real.
- **Verificación MPC:** `Phase2.Verify` solo comprueba las actualizaciones de δ y σ. Upstream obtiene la corrección inicial reejecutando `Initialize` (`phase2.go:155-157,321`).
- **Pruebas Groth16 reales:** tres pruebas válidas no cubren un wire con valor 0 en los tres testigos, ni una fila con `l=r=o=0` en ellos. Una fila omitida en esas condiciones podría pasar las tres pruebas y perder esa restricción para otros testigos. No veo que esto ocurra, pero estas pruebas no lo excluyen.

### Invariantes de la API frente a llamadores actuales

| Invariante | ¿Lo aplica la API? | ¿Lo aplica la CLI? |
|---|---|---|
| CS coincide con el contexto de `Store` | Sí, en `Prepare` | Sí |
| CS no muta durante `Prepare` | No, solo por documentación | Sí, uso secuencial |
| `Layout` corresponde a `Store` y CS | No (F2) | Sí |
| Compromisos ordenados y disjuntos | Parcial; falta el cierre de `seen` | Sí, según el CS pineado y los tamaños |
| Vectores derivados correctamente | No, solo pin y forma | Solo confianza local |
| Dimensiones de `Seal` | Parcial (F1) | Sí, según los pines |
| Máscaras de infinito G1/G2 | Sí | Sí |
| `SrsCommons` parcial solo para `Seal` | No por tipos; `Initialize` entraría en panic por `Tau` vacío | Sí |
| `PublicAndCommitmentCommitted` autenticado | No por `evaluations.bin`, solo por el JSON pineado | Depende de `pinnedInitialization`, no incluido |

### No revisado
- `mpcinspect`, `ceremony`, `main.go` y sus funciones `regular`, `outside`, `limitsFor`, `pinned*`, `readPhase2State` y `fileBytes`.
- Las implementaciones de grupo, el encoder/decoder, `R1CIterator`, `MergeIterator`, `Commit`, la serialización del CS y las claves, y `Precompute`.
- El inventario SHA, los artefactos reales y las pruebas de proceso.
- `phase1.go` solo tuvo una lectura ligera, porque queda fuera del alcance principal.

## 4. Trabajo local recomendado

Ninguno de estos pasos requiere MPC, activar producción, ni inventar identidades, firmas o aprobaciones.

1. **Corregir F1-F3** con sus regresiones sobre circuitos pequeños y `log2=3`.
2. **Resolver S1, S3, S4 y S5** con pruebas pequeñas, y S2 con la comprobación de solo lectura del CS.
3. **Crear un verificador algebraico separado** y probarlo primero en circuitos pequeños. Con `r` derivado por hash de los pines de CS, commons, `initial.bin` y `evaluations.bin`:
   - Calcular por fila `ℓ_c`, `ρ_c` y `ο_c`, y obtener `a`, `b` y `o` con iFFT sobre escalares en orden natural.
   - Comprobar:
     - `MSM(A, r) = MSM(τ¹, a)`
     - `MSM(B, r) = MSM(τ¹, b)`
     - `MSM(G2.B, r) = MSM(τ², b)`
     - `MSM(K, r) = MSM(ατ¹, b) + MSM(βτ¹, a) + MSM(τ¹, o)`
   - Reconstruir `K` desde `VKK`, `CKK` y `PKK` con un mapeo de wires escrito aparte.
   - Comprobar `Z` con una combinación aleatoria frente a `τ^(i+n) - τ^i`, respetando el bit-reverse.
   - Exigir rechazo con mutantes: fila omitida, wires intercambiados, `α/β` cruzados, `CKK/VKK` mal ubicados y `Z` reordenado.
   - Tener en cuenta que el iterador del CS sigue siendo una dependencia común, salvo que se implemente un recorrido alternativo.
4. **Decidir si ejecutarlo sobre los artefactos reales.** No sería un replay: no repite la FFT de grupo, no sella y no modifica artefactos, solo escribiría un informe en un directorio nuevo. Es una ejecución nueva a escala de dominio completo, así que queda a tu criterio. Primero conviene confirmar si `pk-structure-check` o `pk-point-validation`, que no revisé, ya cubren parte de esto.
5. **Mantener la producción bloqueada.** Aunque el paso 3 pasara, solo aportaría evidencia de consistencia algebraica de esos artefactos. No aportaría independencia de participantes, aprobación de la ceremonia ni autorización de despliegue.
