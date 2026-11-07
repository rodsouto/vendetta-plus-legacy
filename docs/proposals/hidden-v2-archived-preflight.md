# Preflight conjunto de evidencia archivada

`pnpm preflight:archived-hidden-v2` conecta las comprobaciones locales existentes
en una sola revisión de coherencia, sin ejecutar nuevamente sus operaciones
nativas. Contrasta ambos circuitos y el replay terminado con un plan fijado
externamente por SHA-256. No importa claves, aprueba producción ni despliega.

Desde la raíz del repositorio:

```bash
pnpm preflight:archived-hidden-v2 \
  --plan docs/proposals/hidden-v2-archived-preflight-inputs.json \
  --plan-sha256 429587c48f8322b08ce1e53836eb1ce91e531b3df26327987e982468dbce0f9e
pnpm test:preflight-hidden-v2
```

`pnpm check:archived-hidden-v2` ejecuta los tests existentes de empaquetado,
evidencia, inventario, linaje y preflight; después ejecuta el plan con Python
aislado y exige stdout idéntico a `archived-preflight/result.json`. El mismo
wrapper `bash scripts/check-hidden-v2-archived.sh` se integra en un job separado
de CI y en `scripts/ci-local.sh`, sin dependencias Node/Go/Foundry ni acceso a la
caché externa. El wrapper requiere Python 3, Git para los tests del empaquetador
y utilidades shell (`cmp`, `mktemp`); el preflight individual conserva su modo
sin Git. CI usa Python 3.12. No ejecutar `ci-local.sh` sobre HEAD para validar
cambios sin commit: su clon sólo contiene el commit seleccionado.

Tras la revisión de fronteras del dossier, la suite comprende 38 tests Python.
Se rechazan también números no finitos por overflow (`1e999`), métricas negativas,
contadores bool/float, mediciones duplicadas o de circuitos incorrectos, secuencias
de reutilización incongruentes y claims de caché/cola no respaldados por los
contadores archivados. Estas reglas comprueban coherencia de este replay fijo;
no acreditan que un operador no haya fabricado informes coherentes. Los lectores
de inputs/recibos cierran sus descriptores incluso si falla la construcción del
stream o el path abierto resulta ser un directorio. Los pins y bytes históricos
del plan y resultado permanecen iguales.

Sin pnpm, Git o SDK Go también funciona con Python:

```bash
python3 -I -B scripts/hidden-v2-archived-preflight.py \
  --plan docs/proposals/hidden-v2-archived-preflight-inputs.json \
  --plan-sha256 429587c48f8322b08ce1e53836eb1ce91e531b3df26327987e982468dbce0f9e
```

Por defecto, el repositorio es el padre de `scripts/` donde reside la herramienta;
`--repository` permite seleccionar otra copia de los inputs. El plan y todas sus
rutas son relativos a esa raíz. La implementación utiliza las aperturas Linux
no bloqueantes/sin symlinks de los checkers existentes.

## Entradas y vínculos comprobados

El plan `vendetta-hidden-v2-archived-preflight-1` exige el resumen final y los dos
circuitos. Cada uno contiene referencias path/SHA-256 a inventario, metadatos
compilados, resultado PK, resultado VK y paquete/resultado de linaje. Sólo se
aceptan rutas JSON canónicas dentro del repositorio elegido, sin symlinks en los
componentes inferiores; no comandos, URLs ni paths absolutos del plan.

| Entrada                                | Relación comprobada                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Resumen y tres informes del replay     | Pins, claims del recorrido Game/H3, tres pruebas registradas y sus manifests, mediante el checker existente de evidencia |
| Inventario y manifest/keys del paquete | Identidad de CS/PK/VK/Verifier, inventario/tamaños y scope inseguro local                                                |
| Metadatos compilados e inicialización  | CS declarado, restricciones, dominio, wires, inputs y dimensiones de compromisos                                         |
| Resultado PK archivado                 | Mismos pins PK/VK/CS, digest de metadatos, tamaño/dominio/wires y alcance parcial                                        |
| Resultado VK archivado                 | Mismos pins VK/Verifier, inputs/compromiso y alcance VK→Solidity                                                         |
| Paquete de 12 recibos por circuito     | Se vuelve a comprobar su linaje JSON y se exige que reproduzca exactamente el resultado archivado                        |

Los cambios de estado/herramientas entre compilación, inicialización, extracción
y replay son históricos: no se exige una misma revisión de software para todos
ellos ni se interpretan los antiguos flags de medición como trabajo actual sin
terminar. Se vinculan identidades y dimensiones de los circuitos/artefactos.
No se declara que las fuentes actuales hayan reproducido esos resultados.

## Lectura protegida y snapshot

Cada fuente JSON se lee por descriptor regular con presupuesto y hash antes de
parsear. Límite por JSON 2 MiB, por plan/recibo 64 KiB y total de fuentes 8 MiB;
profundidad 16, sin campos duplicados o valores no finitos. Los schemas relevantes
y flags de alcance se comprueban estrictamente. Se rechazan mezclas de circuitos,
claims nuevos de aprobación/relación completa y referencias incongruentes aunque
los hashes de los informes y del plan se hayan recalculado.

Los checkers existentes que reabren archivos operan sobre copias privadas de
los bytes ya fijados, en un temporal eliminado al terminar. No reabren rutas del
operador después del preflight ni siguen los paths externos de originales que
contiene el resumen. Un test destruye el resumen original después del snapshot
y confirma que la comprobación delegada usa sólo su copia fijada. No hay snapshot
atómico del árbol entero: la coherencia se establece con los pins de cada fuente.

`sourceJsonBytesRead` cuenta sólo la lectura de fuentes, no las posteriores
relecturas de copias privadas. Los límites lógicos no son cuotas kernel ni una
medición de heap/RSS. Esta herramienta no sustituye al supervisor del productor.

## Alcance del resultado

Estado `archived-hidden-v2-preflight-consistent`. Indica correspondencia de los
informes fijados y sus entradas JSON, dos linajes de 12 recibos y tres pruebas
registradas. No transforma un informe histórico en evidencia de una ejecución
actual. `binaryArtifactsRead`, `nativeWorkRerun`, `currentArtifactsReverified`,
`currentSourceReproductionVerified`, `independentApprovalVerified` y
`productionApproved` permanecen false. Los originales de pruebas externas tampoco
se abren. Ante fallo, salida no cero sin JSON de éxito.

Los informes nativos de inventario/PK/VK conservan sus garantías y límites
originales; este comando sólo coteja sus resultados archivados. Para volver a
comprobar bytes/relaciones actuales se necesitan las herramientas correspondientes
y presupuestos revisados. No repetir el MPC o replay terminado para ejecutar
este preflight. Pins locales y recibos coherentes no autentican a un auditor ni
acreditan ceremonia independiente, cierre publicado o beacon impredecible.

[Evidencia y validación](../benchmarks/timelock-opening/archived-preflight/README.md).
La futura importación/registro de producción sigue pendiente de verificación
criptográfica y de la política/autoridad externa, con todas las barreras activas.
