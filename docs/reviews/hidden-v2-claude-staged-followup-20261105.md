# Revisión de las correcciones F1-F3 y residuales

Esta revisión asistida por IA no es una auditoría independiente ni aprueba producción. No ejecuté nada: los conteos de tests son afirmaciones del agente primario. No recibí `main.go`, `phase2_init.go`, `persistNative`, `pinned*`, `EvaluationWireSize`, `GetPublicAndCommitmentCommitted`, el README actualizado ni el test de proceso. Las rutas son relativas a `apps/web/scripts/experiments/opening-zk/`.

**Veredicto:** F1-F3 quedan bien corregidos en el código suministrado. La corrección no introduce ningún defecto en entradas soportadas, y no demuestro ningún rechazo excesivo de layouts nativos. Queda un `panic` de severidad baja, previo a la corrección, y faltan regresiones para varias comprobaciones nuevas.

## 1. Estado de F1-F3

| Hallazgo | Estado | Base en el código |
|---|---|---|
| **F1** | Corregido | `seal.go:16-45` valida antes de `p.Seal`. La compactación empieza en la línea 64, tras el chequeo de máscaras, así que un rechazo no muta `p` ni `evals`. |
| **F2** | Corregido | `Assemble` rechaza antes de cualquier carga o `emit` si no hay `Prepare` exitoso o si el layout difiere (`initialize.go:285`). |
| **F3** | Corregido para un CS incorrecto | El hash previo ocurre antes de leer commons y del beacon (`phase2_seal.go:56-78`). Se conserva el mismo descriptor y hay comprobación posterior a la copia (`:156-163`). |

### Nil, alias e invalidación
- **Nil:** `Prepare`, `Assemble` y `Seal` rechazan sus punteros principales. La excepción es `open == nil` con caché incompleta, que causa `panic` en `initialize.go:55`. Es un contrato de API; la CLI suministrada no se ve afectada, pero no vi `phase2_init.go`.
- **Invalidación:** `s.layout = nil` se ejecuta antes de cualquier fallo, y el layout congelado solo se asigna al final. Un `Prepare` fallido deja el `Store` sin preparar.
- **Clonado:** `slices.Clone` conserva la distinción entre nil y vacío, así que `DeepEqual` no produce falsos rechazos con el layout recién devuelto. Clona los dos slices internos, lo que basta si `Groth16Commitment` no tiene otros campos de referencia.
- **Partición:** con `len(k) == Wires`, `positions` completas y `VKK == Public+k`, el tamaño de `PKK` queda determinado. El chequeo de `cap` es redundante, pero inocuo.

### Rechazo excesivo
- **`Assemble`:** `seen == len(Commitments)` y el tamaño de `VKK` solo rechazan estados no soportados, como un wire que sea a la vez compromiso y privado comprometido. El cursor sigue siendo el nativo.
- **`Seal`, rango:** `index >= 1` e `index < public+i` coinciden con mi recuerdo del verificador de gnark, que usa `publicWitness[idx-1]` y añade cada compromiso tras procesarlo. Esa fuente no estaba incluida.
- **`Seal`, orden:** el orden estrictamente creciente es más fuerte que lo que necesita ese acceso. Depende de la ordenación y deduplicación de `Commit` y de la traducción de índices. No lo veo violado, pero queda como supuesto (A1).

## 2. Residuales demostrados por lectura

### D1. `panic` con capacidad negativa (baja, previo a la corrección)
- **Referencia:** `initialize.go:310`.
- **Disparador:** un CS cuyo hash coincide con el pin, pero con `committed + Public + len(Commitments) > Wires`. Por ejemplo, listas privadas solapadas o sobredimensionadas.
- **Consecuencia:** `make` entra en `panic` antes de llegar a los errores de las líneas 321, 341 o 346. Falla cerrado y sin escribir claves, pero no devuelve un error.
- **Alcance:** F2 ya no permite provocarlo con un `Layout` sustituido, pero sí con un CS malformado que esté pineado.
- **Corrección mínima,** antes de `LoadG1("k")`, moviendo allí el cálculo de `committed`:

```go
free := l.Wires - l.Public - committed - len(l.Commitments)
if free < 0 {
	return nil, native.Phase2Evaluations{}, errors.New("assembly wire partition differs")
}
```

- **Regresión:** ampliar `PrivateCommitted` en el CS antes de pinearlo, de modo que `Prepare` pase y `Assemble` devuelva error.

### D2. Comprobaciones nuevas sin regresión visible (baja)
En los tests suministrados, estos mutantes sobrevivirían:

| Código | Por qué no se detecta | Regresión pequeña |
|---|---|---|
| `seal.go:35-41` | `public-translation` solo pone `nil` y se rechaza en la línea 25. | Índice `0`, no creciente, duplicado y `>= public+i`. |
| `seal.go:43-45` | `length` se rechaza en la línea 21. | Truncar `A`, `B` y `G2.B` a la vez, o quitar un punto de `PKK`. |
| `initialize.go:145` | Ningún test llama a `Assemble` tras un `Prepare` válido seguido de otro fallido. | Secuencia exitoso → fallido → `Assemble`, que debe rechazar. |
| `initialize.go:345` | Todos los modos de `TestAssembleRejectsSubstitutedLayout` terminan en la línea 285. | Usar un CS malformado pineado que llegue a esa línea, por ejemplo con compromisos invertidos antes del pin. |

Si la línea 294 hace `panic` con ese CS, conviene añadir la validación estructural antes de esa línea.

Otros archivos de test podrían cubrir estos casos, pero no los recibí.

### D3. El `Layout` devuelto comparte memoria con el CS (muy baja)
- **Referencia:** `initialize.go:167,194`.
- **Evidencia:** el propio modo `private-wire` del test muta `c.CommitmentInfo`, y `reordered` lo reordena.
- **Consecuencia:** falla cerrado. `Assemble` rechaza, y un nuevo `Prepare` también si esos campos están en la serialización.
- **Corrección opcional:** devolver un clon. Evítalo si esa memoria importa; no es necesario para F2.

### D4. Fallo posterior a la copia del CS (muy baja, aceptable)
Si el archivo muta tras el hash previo, la línea 161 falla después de escribir `proving.key`, `verifying.key`, `Verifier.sol` y `circuit.bin`, sin `manifest.json` ni `keys.json`. F3 cubre el CS incorrecto, no este caso de carrera. No hace falta más trabajo, salvo documentar que esa salida parcial no es válida.

### D5. Contratos de alias en `Seal` (solo llamadores directos)
- **`A` y `B` solapados:** si comparten memoria, la segunda compactación usa sus flags sobre datos ya compactados. El nativo, si recuerdo bien, filtra sin esa dependencia. Pasar el mismo slice a ambos corrompe la clave con máscaras de infinito no triviales.
- **`CKK` y `SigmaCKK` solapados:** `p.update` los mutaría juntos.
- **Alcance:** `Assemble` clona `SigmaCKK`, y la CLI lee `p` y `evals` por separado. Basta con documentarlo en el contrato de `Seal`.

## 3. Supuestos no demostrados

| ID | Supuesto | Si fuera falso | Comprobación proporcionada |
|---|---|---|---|
| A1 | `PublicAndCommitmentCommitted` real cumple `1 <= idx`, orden estricto y el rango de `seal.go:37`. | Rechazo temprano antes del beacon. | Evaluar esa condición, solo lectura, sobre el dato pineado. |
| A2 | `circuit.bin` real cabe en el presupuesto de 400 MiB. | Rechazo temprano. | Comparar con el tamaño archivado. |
| A3 | `persistNative` llama a `WriteTo` una sola vez. `copyCS` es de un solo uso sobre el descriptor conservado. | Salida vacía o incompleta, detectada por el hash si se hashea esa pasada. | Confirmarlo leyendo `persistNative`; el test de proceso debería ejercitarlo. |
| A4 | Los `Layout` y clones extra no alteran de forma relevante el pico de memoria real. | Solo importaría en una ejecución futura a gran escala. | Sin repetir la ceremonia, estimar `8 × |PrivateCommitted|` por copia. |
| A5 | `vk.Precompute` no falla con dimensiones válidas. | `panic` tras compactar y actualizar `p`, antes de escribir salidas. | Revisar esa fuente. |

### Alcance inalterado
- **`Seal` solo valida forma:** no detecta que `VKK`, `PKK` o `CKK` contengan puntos intercambiados con conteos correctos. Esto es esperable, porque no recibe el CS.
- **Código y artefactos archivados:** estas correcciones son posteriores a la ejecución archivada. Las regresiones nuevas no demuestran qué código exacto produjo esos artefactos, salvo que la procedencia ya lo vincule.

## 4. S3, S4 y F4

- **S3:** la regla descrita para `main.go:709-713` lo cerraría. No pude verificarlo porque esa fuente no estaba incluida.
- **S4:** el orden descrito lo cerraría si `maxPrivate`, el número de vectores y la suma quedan acotados antes de multiplicar. Tampoco pude verificarlo.
- **F4:** una nota separada es la opción adecuada, sin reescribir recibos. Enlaza artefactos, pero no aporta autenticación independiente, tal como indicas. La copia exacta de `index-11` solo vincula sus bytes; no prueba por sí sola cómo se generaron los vectores.

## 5. Siguiente paso mínimo

1. Aplicar D1 y añadir las regresiones de D2. Son cambios pequeños, sin MPC ni FFT nuevas.
2. Comprobar A1-A3 con lecturas locales.
3. Mantener los límites de alcance actuales. Nada de lo anterior establece equivalencia con el flujo nativo en el circuito real, independencia de participantes ni aprobación de producción.
