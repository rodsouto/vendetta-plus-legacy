# Preparación de revisión tras el cierre local

Estado: 5 de noviembre de 2026. Ambos circuitos completaron el MPC experimental
local; las claves nuevas ya pasaron tres pruebas reales y replay Game/H3.
La siguiente frontera es revisión independiente y procedencia segura. No hace
falta repetir setup, FFT ni proving para preparar esta revisión.

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
| Tests de esos paquetes y `localmpc/`, `mpcinspect/`                          | Comparaciones nativas exactas pequeñas, contribuciones/verificaciones entre procesos, corrupción y recuperación; identificar lo que no demuestran en dominio completo |
| `scripts/hidden-v2-local-{sequence,replay}.py`                               | Pins de fuentes/binarios/etapas, supervisión y límites kernel frente a umbrales muestreados; reutilización de inicialización completada                               |
| `local-mpc-staged/completed-results.json` y sus tres informes referidos      | Manifests usados, tres pruebas, rechazos y World completo; separar integridad de autenticidad/procedencia                                                             |

Las rutas de benchmark anteriores están bajo
`docs/benchmarks/timelock-opening/`. El README de `mpcstaged/` explica las
transformaciones; el README del benchmark registra picos por operación y límites
de la medición. La matriz completa de revisión del juego sigue en
[preparación de producción](hidden-v2-production-readiness.md).

## Decisiones externas imprescindibles

- Designar revisores/auditor independientes, alcance y criterios de cierre de
  hallazgos, y sus identidades de confianza. Los tests locales no pueden hacerlo.
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
