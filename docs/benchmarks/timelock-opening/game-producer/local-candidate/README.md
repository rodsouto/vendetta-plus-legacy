# Hidden v2: candidato local del 31 de octubre de 2026

Las etapas locales 1–5 del roadmap están cerradas con límites explícitos. El
hito 6 de producción permanece pendiente: estos setups son inseguros y no se
autoriza un despliegue a partir de esta validación.

[Checks, hashes y límites](checks.json),
[roadmap/handoff](../../../../proposals/hidden-v2-session-handoff.md),
[carga real](../worker-soak/README.md) y
[fallos sostenidos](../worker-faults/README.md).

| Check | Resultado |
| --- | --- |
| Rules y typecheck | 763/763, 14 archivos |
| Contratos | 206/206, 26 suites; incluyen 43 tests de escenarios |
| Layout | 11/11 y storage-layout.json compatible |
| Web | 188/188, 30 archivos |
| Productor Go | Seis tests principales ^TestProducer y subtests |
| Playwright estándar | 5/5 |
| Playwright AA | 2/2, passkeys y recuperación multidispositivo |
| Builds | Web e indexer aprobados |
| Scripts | Typecheck aprobado, incluidos fixtures e historias nuevas |
| Formato | Prettier, forge fmt y git diff --check aprobados |
| Codegen | 75 artefactos comparados, ningún cambio |

Los checks corrieron en el árbol de trabajo con los cambios de esta sesión,
no en un clon de HEAD, que no contiene esos archivos no comprometidos. No se
creó commit ni hubo despliegue de red real. Los logs locales y sus hashes están
en checks.json; las evidencias de cada benchmark se mantienen separadas.

## Recuperación y correcciones verificadas

El keeper persiste el envío firmado antes de broadcast y espera su settlement
antes de leer/enviar otra acción. Los plazos RPC/recibos son 15/60 segundos.
Los reintentos conservan bytes y nonce; un status desconocido no borra el
journal. Un nonce atascado sigue pendiente y uno reemplazado externamente se
mantiene bloqueado hasta intervención: detener instancia, conservar el journal
y configurar otro signer dedicado/fondeado con archivo nuevo. No hay fee bump
ni cancelación automática. El directorio persistente queda fuera de la raíz web;
las cadenas privadas nuevas usan carpetas distintas.

El índice de ciphertexts comprueba hashes incluso para ids cacheados, reconstruye
tras un reorg y rechaza consultas cuyo rango cambió durante la lectura. El
historial del CLI keeper y Game reemplaza una admisión por otro packet para el
mismo id mientras falta un recibo: el certificado anterior revierte, la evidencia
nueva se indexa/certifica y el World completo coincide con TS. Usa consumidor y
productor mock explícitos para aislar esta operación; la criptografía/H3 real
se valida en los benchmarks distintos.

La revisión e2e encontró un bucle de forecastAttack cuando processDue no avanzaba
ante un head oculto pendiente. La previsión cliente retorna null en esa frontera,
no altera World y reanuda tras certificación. No cambia la máquina de estados
ni tiene contraparte Solidity. La regresión y los flujos de envío repetido pasan.
Los tests Playwright aportan certificados mock explícitos sólo a DeployTest;
no existe una ruta plaintext ni cancelación automática en app/keeper.

Los fixtures Anvil aíslan broadcast y recovery cache de Forge para no colisionar
al desplegar en paralelo. Se ajustaron selectores AA a las etiquetas actuales
sin relajar las comprobaciones de prompts/sesión. Los únicos cambios Solidity
de esta continuación son formato en Account.sol y Scenarios.t.sol; se volvieron
a comprobar contratos/layout y la generación de artefactos después.

## Reproducción de checks

Con dependencias y Foundry en PATH (ver CLAUDE.md):

```bash
pnpm codegen
pnpm test
pnpm --filter @vendetta/web build
pnpm --filter @vendetta/indexer build
pnpm --filter @vendetta/web typecheck:scripts
pnpm format:check
forge fmt --check --root contracts
pnpm --filter @vendetta/web e2e
pnpm --filter @vendetta/web e2e:aa
```

En opening-zk, con el SDK Go documentado: `go test -v -run '^TestProducer' -count=1 .`.
Los benchmarks requieren las claves locales existentes y sus variables de
entorno; sus READMEs conservan comandos/resultados. No regenerar esos setups.

## Límites pendientes para producción

Setup seguro y auditoría independiente con sus correcciones, validación de
capacidad/costes/disponibilidad remotos, supervisión externa y durabilidad de
operador siguen pendientes. La carga finita no prueba ausencia de fugas o SLA;
GOMEMLIMIT no es un límite físico de RSS. Las recepciones no implican finalidad,
la recuperación del índice supone RPC coherente y la rotación es manual. La
validación local no cubre todo reorg profundo, corte de energía ni muerte abrupta
del padre. El build web conserva avisos no bloqueantes de tamaño de chunks e
imports tlock; no se añadieron optimizaciones ajenas a los criterios de cierre.
