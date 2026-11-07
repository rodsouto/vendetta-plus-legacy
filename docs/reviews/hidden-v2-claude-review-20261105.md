# Hidden v2: revisión técnica asistida por Claude

El propietario eligió esta modalidad para el proyecto hobby, sin contratar una
firma. Se invocó realmente Claude Code 2.1.318, modelo reportado
`claude-opus-5-5`: dos revisiones iniciales y dos seguimientos. Las llamadas
recibieron fuentes numeradas y fijadas por SHA-256, con herramientas deshabilitadas,
sin hooks/MCP del proyecto ni persistencia de sesión. Claude no ejecutó pruebas.
Los hallazgos se contrastaron y las pruebas se ejecutaron por el agente principal.

Esto es revisión con IA, no auditoría profesional independiente, participación
MPC independiente, firma de aprobación ni autorización de producción. Se envió
el subconjunto de fuentes a Claude por instrucción expresa del propietario;
no se publicaron fuentes ni se contactaron participantes humanos.

## Respuestas originales y entradas

- [Adaptadores: revisión inicial](hidden-v2-claude-staged-initial-20261105.md).
- [Adaptadores: seguimiento de correcciones](hidden-v2-claude-staged-followup-20261105.md).
- [Circuitos/consumidores: revisión inicial](hidden-v2-claude-circuit-initial-20261105.md).
- [Circuitos/consumidores: seguimiento y retractaciones](hidden-v2-claude-circuit-followup-20261105.md).
- [Metadatos y pins por llamada/fuente](hidden-v2-claude-review-20261105-metadata.json).

Los números de línea de cada respuesta corresponden a sus entradas congeladas,
no necesariamente al código corregido posterior. Las respuestas se conservan
sin editar; la clasificación vigente es la de este documento. JSON raw, prompts,
inventarios y logs originales están fuera de Git en
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-claude-{staged,circuit}-review/`,
con seguimientos en `followup/`. La entrega inicial de fuentes del repositorio
tenía SHA-256 `426beea7171def63fff1dfd1ac9895257e866886f66dc353beef7bd132145836`.
Las dependencias upstream suministradas tienen sus propios pins de contenido.

## Disposición de los hallazgos de adaptadores

| ID                                          | Resultado vigente                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1, forma incompleta en Seal                | Reproducido antes del parche: CKK extra causaba panic después de mutar la contribución. Se comprueban punteros, dominio, bases/contadores, traducciones y partición de wires antes de compactar o aplicar el beacon. Regresiones comprueban rechazo y estado sin actualizar. La CLI histórica cargaba objetos fijados y coherentes; no se atribuye un fallo a esos runs.                             |
| F2, Layout sustituible                      | Reproducido con truncado, reordenación y mutación de listas. Store conserva una copia profunda privada después de Prepare exitoso; Assemble exige ese mismo layout antes de cargar vectores. Preparación fallida invalida el layout. Se validan dimensiones/orden/capacidad antes de asignar y la partición final. No se cambia el formato de caché ni la firma pública de Assemble.                 |
| F3, CS comprobado tarde                     | Confirmado en fuente y cubierto por regresión entre procesos: un CS sustituido ahora se rechaza antes del beacon y antes de crear el directorio público de claves. Se conserva el descriptor para la copia y se vuelve a comprobar su hash. Una mutación posterior todavía puede dejar salida parcial sin recibo final; las fuentes deben permanecer inmutables.                                     |
| F4, método de inicialización poco explícito | Se añadió una nota separada de procedencia local y copia exacta del índice final, enlazando lanzamiento v6, binario/fuentes, init, checkpoints y keys finales. No se reescriben recibos ni se presenta la nota como autenticación independiente.                                                                                                                                                     |
| D1/D2 del seguimiento                       | Se rechaza la capacidad negativa/orden de un layout malformado pineado antes del trabajo. Se añadieron casos de índices cero/duplicados/invertidos/fuera de rango, partición de wires e invalidación tras Prepare fallido. También se rechaza un opener nil cuando falta un vector. Estas últimas defensas son posteriores al seguimiento de Claude y están comprobadas por las regresiones locales. |

La nueva nota está en
[initialization-provenance.json](../benchmarks/timelock-opening/local-mpc-staged/initialization-provenance.json).
Sólo enlaza metadatos/claims locales; no vuelve a leer cuerpos de vectores ni
prueba las ecuaciones que los produjeron. El esquema histórico de init permanece
intacto. Cambiar a otro esquema sólo sería necesario si se autorizara otro flujo
de inicialización, que esta revisión no ejecuta.

### Sospechas y límites de los adaptadores

- S1: se cubren directamente los coeficientes especiales, incluido `CoeffIdTwo`,
  y las ramas de scheduling secuencial/paralelo con 32 puntos. No es una FFT
  del juego ni una nueva medición de capacidad.
- S2: el CLI histórico ya llamaba a `ShapeFromCS`, que hashea `compiled.WriteTo`
  después de `ReadCompiledCS`. Prepare añade el mismo binding a la API. No se
  repitió una lectura/round-trip grande; coste de la pasada adicional y copias
  de Layout sigue sin nueva medición en dominio real.
- S3: `main.go` ya rechazaba resume-cache sin staged y pins emparejados. Se
  añadió el caso a la regresión de argumentos; no se arrancan workers.
- S4: `EvaluationWireSize` acota cada conteo y la suma wire antes de calcular
  payload. La multiplicación planteada no puede alcanzar overflow con la
  política aceptada. No se añadió otro scanner para repetir esa comprobación.
- S5: un G2 nativo en curva pero fuera de subgrupo, con encoding/pin coherentes,
  se rechaza por el decoder de caché sin devolver puntos.
- A1/A2/A3: los índices públicos del init archivado cumplen el rango y orden
  comprobados; tamaños CS archivados caben en 400 MiB; persistNative llama una
  vez a WriteTo. Son comprobaciones locales de metadatos/fuente, no criptografía.
- Seal requiere buffers independientes y propiedad exclusiva: A/B/B2 no deben
  solaparse y CKK no debe aliasar SigmaCKK. Assemble y los decoders del CLI
  producen objetos separados. No se habilita importación de objetos arbitrarios.

Claude no encontró divergencia aritmética en entradas soportadas. Eso no es una
prueba formal de equivalencia para todo el dominio. No se implementó ni lanzó
el verificador algebraico masivo sugerido: no se demostró un defecto que exigiera
ampliar esta línea con otro checker o cálculo grande.

## Disposición de las hipótesis de circuitos/consumidores

| ID                                   | Resultado vigente                                                                                                                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1, selección de consumidores/rebind | Retirada por Claude al leer HiddenAdmission/HiddenResolution. Las direcciones provienen de storage inicializado en Game; initialize es protegido, sin setter posterior visible. El segundo bind revierte con status != 0. Pasaron los dos tests Foundry focalizados de binding/configuración. |
| H2, alias a+q en cmp                 | Retirada: la versión fijada aplica comprobación de módulo en ToBinary por defecto. Además pasó un circuito de comparación pequeño con hint adversario a+q: el resultado falso se rechaza y el hint se ejercita. No se compila ni modifica el circuito del juego.                              |
| H3, AddUnified incompleta            | Retirada explícitamente: el código instalado ya implementa split cuerda/tangente y tratamiento de infinito, no la fórmula antigua supuesta por Claude. Se retiraron también las consecuencias y pruebas de torsión propuestas para esa hipótesis.                                             |

Se contrastaron las referencias faltantes con las fuentes reales: CompactCapsule
delega en CapsuleCircuit y éste llama a Pair.Define; los archivos coinciden con
los pins de la revisión inicial. Se comprobó la ruta Game → Missions → bind,
ausencia de setters/deletes adicionales en el alcance buscado y allowlist
1337/31337 en Deploy.s.sol. No se cambiaron circuitos, consumidores o contratos.

La aritmética entera sugerida para una dependencia genérica de AssertIsOnG2 da
gcd=13 en uno de los cuatro prefijos, no 1 en todos. Esto no demuestra un ataque
a la composición ni cierra formalmente la primitiva genérica: en el circuito de
apertura U está ligada a los bytes inmutables y CapsuleValid a rP; la ruta de
invalid-point usa la suma completa revisada. Se mantiene el límite de la revisión
anterior de composición H7. No se convirtió un gcd aislado en una vulnerabilidad
demostrada ni en una prueba de solidez. HashToG1, pairings, campos emulados y comb
siguen siendo dependencias criptográficas, no garantías nuevas de estas llamadas.

## Validación y continuidad

Los logs separan regresiones pequeñas Go, comparación adversaria, dos tests
Foundry y cotejo portable del dossier. Los counts finales y pins de cierre se
conservan en el recibo externo de
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-claude-review-close/`.
No se ejecutó MPC, inicialización/FFT/sellado/proving/replay del juego ni se
reemplazaron artefactos. Los tests pequeños sí ejercitan sus propias relaciones
efímeras para comprobar la equivalencia y los fallos corregidos.

El flujo hobby puede seguir con nuevas revisiones Claude cuando aparezca un
defecto o cambio concreto. Esta revisión no asigna autoridad de aprobación,
participantes independientes ni evidencia de cierre/beacon impredecible; tampoco
retira barreras de producción. No queda un hallazgo confirmado de este ciclo
sin resolver dentro de las entradas soportadas.
