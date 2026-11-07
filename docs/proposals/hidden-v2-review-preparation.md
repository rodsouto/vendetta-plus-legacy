# Preparación de revisión tras el cierre local

Estado: 6 de noviembre de 2026. Ambos circuitos completaron el MPC experimental
local; las claves nuevas ya pasaron tres pruebas reales y replay Game/H3.
El siguiente trabajo es revisión técnica y procedencia de artefactos. No hace
falta repetir setup, FFT ni proving para preparar esta revisión.

## Modalidad elegida para el proyecto hobby

El propietario indicó que no puede contratar una firma de auditoría y autorizó
usar Claude como segundo revisor técnico y en otros roles de análisis necesarios.
Se adopta revisión asistida por IA con entradas congeladas, respuestas reales
archivadas, contraste de hallazgos, correcciones y regresiones pertinentes.
El propietario descartó colaboradores externos para este alcance experimental.
Contratar una empresa no es una precondición para seguir trabajando localmente.

Esta modalidad no convierte a Claude en participante MPC independiente ni en
firmante de una aprobación criptográfica: no se le atribuyen identidades,
firmas, ensayos o autoridad que no existan. No cambia los flags inseguros de
los setups ni las barreras de producción. Las referencias inferiores a auditoría
independiente describen garantías todavía no obtenidas, no una orden de contratar
una empresa antes de continuar el desarrollo hobby. Una futura decisión del
propietario sobre riesgos y lanzamiento se registrará por separado.

La [revisión real del 5 de noviembre](../reviews/hidden-v2-claude-review-20261105.md)
incluye cuatro respuestas originales, entradas fijadas y disposición de hallazgos:
se corrigieron las defensas de Seal/Layout/CS previo al sellado; las tres hipótesis
condicionales de circuitos se retiraron al proporcionar el código faltante.
Se conserva el alcance de cada revisión y de las correcciones posteriores.

## Comprobar la evidencia existente

```bash
pnpm test:evidence-hidden-v2
pnpm check:evidence-hidden-v2 --summary docs/benchmarks/timelock-opening/local-mpc-staged/completed-results.json --summary-sha256 1ad3b946d00bb9fa6f0ee1fc85afac2601bc0b9cd0c4e8e93ae5cf6279caf645
```

Añadir `--originals` cuando estén disponibles las rutas externas del informe:
lee también los tres JSON originales de pruebas y los informes originales.
No escribe en esas rutas. Cada JSON tiene presupuesto de lectura de 2 MiB;
no lee CS, claves ni transcripts grandes. Sin esa opción se pueden comprobar
las copias públicas desde el bundle de fuentes. El pin debe conservarse por un
canal independiente: editar informe y pin conjuntamente no autentica nada.

El resultado acredita correspondencia de hashes y coherencia de las referencias
a setups, metadatos de pruebas, aserciones del replay y métricas resumidas.
No revalida las pruebas Groth16, los transcripts MPC, los bytes de claves ni
el bytecode EVM; tampoco establece seguridad del setup o independencia.
`unsafeLocalSetup=true` y `productionApproved=false` siguen siendo obligatorios.

La lectura individual de evidencia ahora abre el descriptor con `O_NOFOLLOW` y
`O_NONBLOCK`, comprueba tipo/tamaño con `fstat` antes de leer y cierra también
ante rechazo. Se corrigió una sustitución reproducida entre `lstat` y `open`
que podía seguir un symlink final; un FIFO sustituido podía bloquear la apertura
anterior. No se autentican directorios padre ni se garantiza snapshot atómico:
mantener la evidencia y sus directorios bajo control e inmutables. El preflight
conjunto ya operaba sobre copias privadas fijadas y no dependía de esa ventana.

La revisión posterior coteja además la distribución de las tres mediciones por
circuito, nombres únicos, reutilización frío/caliente, perfiles de tiempo y
contadores de pruebas/caché/cola del worker. Números no finitos (incluido overflow
de exponentes), duraciones negativas y contadores bool/float se rechazan.
Los metadatos de pruebas exigen pins/statements canónicos y valid booleano,
incluso sin abrir originales. Son relaciones de JSON declarados: no vinculan
criptográficamente mediciones con pruebas ni autentican autoría de informes.

## Entradas para quien revise

Congelar el árbol actual con `pnpm audit:hidden-v2 create` y verificar el archivo
con `pnpm audit:hidden-v2 verify`, siguiendo el
[procedimiento de empaquetado](hidden-v2-audit-bundle.md). El receipt externo
conserva digest y número de fuentes. No enviar el paquete sin instrucción del
usuario; la creación local no autoriza publicación ni contacto con terceros.
Los bundles de lanzamiento v6/v7 conservan los bytes que produjeron la evidencia;
un bundle posterior identifica las fuentes para revisión, no reemplaza esos pins.

| Entrada                                                                      | Revisión requerida                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/scripts/experiments/opening-zk/mpcstaged/{lagrange,initialize}.go` | Derivación respecto a gnark v0.16.4, FFT inversa, orden de sumas y distribución de bases públicas/privadas/compromisos; dependencia de dimensiones                    |
| `mpcstaged/{cache,commons}.go` en ese mismo directorio                       | Contexto CS/commons/algoritmo, pins externos, límites antes de asignar, puntos/canonicalidad, reanudación y archivos parciales                                        |
| `mpcstaged/seal.go` y `mpcstream/`                                           | Mutación de buffers, máscaras de infinito G1/G2, campos omitidos de commons y condiciones exactas para delegar a `Phase2.Seal`                                        |
| Tests de esos paquetes y `cmd/mpc-local-pipeline/`, `mpcinspect/`            | Comparaciones nativas exactas pequeñas, contribuciones/verificaciones entre procesos, corrupción y recuperación; identificar lo que no demuestran en dominio completo |
| `scripts/hidden-v2-local-{sequence,replay}.py`                               | Pins de fuentes/binarios/etapas, supervisión y límites kernel frente a umbrales muestreados; reutilización de inicialización completada                               |
| `local-mpc-staged/completed-results.json` y sus tres informes referidos      | Manifests usados, tres pruebas, rechazos y World completo; separar integridad de autenticidad/procedencia                                                             |

Las rutas de benchmark anteriores están bajo
`docs/benchmarks/timelock-opening/`. El README de `mpcstaged/` explica las
transformaciones; el README del benchmark registra picos por operación y límites
de la medición. La matriz completa de revisión del juego sigue en
[preparación de producción](hidden-v2-production-readiness.md).

## Decisiones externas imprescindibles

- Para la modalidad hobby, usar las revisiones reales de Claude, contrastar sus
  hallazgos y fijar criterios de cierre. Eso no acredita una auditoría profesional
  independiente; esa garantía seguiría necesitando revisores externos si se
  quisiera obtener. No exigir contratar una firma para seguir trabajando.
- Elegir participantes independientes y el procedimiento de ceremonia revisado,
  publicación autenticada de cierres y beacon futuro impredecible posterior.
  Las identidades bajo el mismo operador y beacons fijos del ensayo no sirven.
- Definir quién aprueba procedencia/artefactos y la política de confianza fuera
  del manifest del operador: quórum, vigencia, revocación y vinculación a circuito,
  claves, compilación, runtime y red. Las firmas `design-review-only` existentes
  no autorizan producción. Implementar y revisar importador/registro contra esa
  política antes de retirar cualquier bloqueo.
- Fijar carga objetivo, presupuesto, entorno operativo y responsables para la
  evidencia de capacidad/disponibilidad pendiente. El replay corto no fija SLA.

Con esas entradas se podrán cerrar hallazgos, ejecutar el procedimiento final,
importar/verificar/aprobar artefactos y repetir los checks con los artefactos
finales. El despliegue real requiere una instrucción posterior separada.
No se ha implementado una autoridad ficticia ni convertido el setup experimental
en producción para suplir estas decisiones.

## Revisión interna posterior

La [revisión de fronteras del adaptador](../reviews/hidden-v2-staged-boundaries-internal.md)
reprodujo y corrigió dos defensas de API: comprobar el hash del CS dentro de
`Prepare` antes de usar caché, y devolver nil en cargas G1/G2 fallidas. La CLI
ya comprobaba el CS y sus callers comprueban errores; no se atribuye un fallo
a los runs completados. Pasaron 158 eventos Go de regresión en cuatro paquetes,
vet y verificación offline de módulos. Es revisión interna, sin sustituir al
auditor independiente. Las métricas y pruebas históricas siguen ligadas a los
binarios congelados v6/v7, no a una nueva ejecución del código corregido.

## Preflight de exports implementado

El [inventario offline](hidden-v2-artifact-inventory.md) coteja manifests/recibos
fijados externamente y los bytes de CS/PK/VK/Verifier en un directorio abierto,
con presupuesto previo y rechazo de archivos especiales/sustituciones observadas.
Ambos exports existentes pasaron sin deserialización ni nuevas pruebas. Es una
pieza de integridad utilizable antes del futuro importador; no verifica relaciones
criptográficas, transcripts ni aprobación independiente. La política del productor
y el bloqueo de redes reales siguen activos, con tests de rechazo aprobados.

## Relación VK → Solidity implementada

La [comprobación nativa de exportación](hidden-v2-vk-export-check.md) valida
longitudes antes del decoder, puntos/subgrupos, canonicalidad y coincidencia
exacta con Verifier.sol mediante exportación a SHA-256. Ambas VK existentes
pasaron sin leer PK/CS/transcripts ni generar pruebas. No acredita binding al
circuito, correspondencia con PK, runtime EVM o procedencia; los flags de esas
relaciones y aprobación permanecen false. Los tests rechazan dos compromisos,
no soportados por el exportador Solidity fijado. Continúan pendientes revisión
y política externas antes de habilitar importación de producción.

## PK en streaming: relación parcial implementada

El [scanner de PK](hidden-v2-pk-structure-check.md) coteja la estructura completa,
dimensiones contra metadatos de compilación fijados y los cinco parámetros
compartidos con una VK comprobada. Ambas PK existentes pasaron, sin CS nativo,
arrays de puntos de la PK ni FFT/setup/proving nuevos. Tags de vectores no
acreditan validez de todos sus puntos; constantes compartidas no prueban toda
la relación CS/PK/VK. El resultado conserva false en esas relaciones completas,
transcripts y producción. El importador final y su política externa siguen
pendientes; estas herramientas no habilitan manifests autodeclarados seguros.

## Validación de puntos PK para exports pequeños

El modo opt-in del [scanner PK](hidden-v2-pk-structure-check.md) añade decoder
nativo curva/subgrupo y canonicalidad por punto, sin arrays PK. Exige cota
conservadora <=65.536 puntos antes de construir el reader. Los tests y wrapper/
pnpm pasaron con exports pequeños; ambos metadatos del juego se rechazaron por
presupuesto sin recorrer sus PK. La herramienta sigue sin acreditar ecuaciones
CS/PK/VK, transcripts o aprobación. El modo por defecto y los informes anteriores
permanecen framing-only para los puntos de vectores PK.

## Linaje de recibos empaquetado

El [checker de linaje](hidden-v2-receipt-lineage.md) reconstruye el grafo completo
de recibos locales hasta cada export final: 12 JSON por circuito, con dos
contribuciones por fase. Los paquetes pequeños conservan bytes originales y
pueden verificarse sin la caché de transcripts/claves. Se comprueban pins,
enlaces y coherencia de claims/metadatos, sin convertirlos en nueva verificación
criptográfica o autenticación de autores/cierre/beacon. Producción sigue bloqueada;
el reviewer dispone ahora de las referencias transitivas del export sin tener
que inferirlas de paths históricos o relanzar ninguna operación MPC.

## Preflight conjunto disponible

`preflight:archived-hidden-v2` y su [plan fijado](hidden-v2-archived-preflight.md)
conectan ambos circuitos, reportes PK/VK, compilación, linajes y el replay archivado.
Lee sólo JSON dentro de la raíz seleccionada y vuelve a comprobar linaje/claims
sobre copias privadas ya fijadas. Detecta mezclas de circuitos, metadatos o
alcances; no declara nuevos checks nativos ni reproducción de fuentes actuales.
Es la entrada de revisión portable del dossier, con flags de aprobación false.
No reemplaza las decisiones externas ni habilita importación o despliegue.
