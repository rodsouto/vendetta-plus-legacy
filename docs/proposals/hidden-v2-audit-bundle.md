# Paquete de fuentes para auditoría de hidden v2

`pnpm audit:hidden-v2` congela las fuentes modernas del árbol de trabajo,
incluidos archivos Git nuevos aún no comprometidos. El paquete es una entrada
reproducible para revisión; no acredita auditoría ni aprobación de lanzamiento.

```bash
pnpm test:audit-hidden-v2
pnpm audit:hidden-v2 create /ruta/fuera-del-repo/hidden-v2-source.tar.gz
pnpm audit:hidden-v2 verify /ruta/fuera-del-repo/hidden-v2-source.tar.gz
```

La salida de create/verify contiene SHA-256 del archivo, número de fuentes y
commit base. Conservar el digest mediante un canal independiente del paquete.
Verify comprueba el inventario y sus bytes; no autentica quién aprobó ese
digest. El script no envía archivos ni contacta auditores.

## Contenido y límites

El archivo contiene `audit-manifest.json` y `source/` con archivos visibles para
Git en `apps/`, `packages/`, `contracts/`, `docs/`, `scripts/`, `.github/` y los
archivos de configuración raíz expresamente admitidos. Los bytes proceden del
working tree, no de HEAD ni del índice. Una eliminación local permanece ausente.
El commit base sólo identifica el origen, no todos los cambios empaquetados.

El manifest registra tamaño, modo y SHA-256 por archivo. Headers tar y fecha
gzip fijos permiten reproducir exactamente el archivo a partir del mismo
inventario y commit base. Antes de publicarlo se vuelve a leer el inventario:
si cambia, se aborta. Evitar editar mientras se crea el paquete; esa comprobación
final no sustituye un snapshot atómico de filesystem frente a cambios concurrentes
transitorios. El destino debe estar fuera del repositorio; nunca se sobrescribe
un archivo existente. La publicación usa un enlace atómico en el mismo volumen.

Se excluyen archivos ignorados por Git, dependencias instaladas, artefactos de
build/caché, journals en `.keeper-state`, `.env*` salvo `.env.example`, y sufijos
de claves/binarios de setup. Se rechazan symlinks y archivos especiales entre
las fuentes seleccionadas. El script verifica el archivo sin extraerlo y rechaza
duplicados, entradas extra, paths fuera de alcance y fuentes alteradas.

La selección por rutas no es un detector de secretos dentro del contenido:
revisar el inventario antes de compartirlo y mantener credenciales/estado de
operador fuera de las fuentes. Los fixtures criptográficos archivados y los
consumidores mock conservan sus etiquetas y límites originales. Sus certificados
son evidencia de test, no una aprobación del setup para producción.

El árbol PHP legado no se incluye; es referencia de las reglas especificadas en
`docs/spec/`. Los lockfiles de pnpm y Go fijan las dependencias externas; sus bytes
instalados tampoco se incluyen. Registrar toolchains y resolver/verificar esas
dependencias antes de reproducir los checks. El [alcance de auditoría](hidden-v2-production-readiness.md)
abarca también las dependencias transitivas que el auditor estime necesarias.

Una nueva corrección exige otro paquete y digest. La ceremonia final, verificadores
de producción y sus direcciones deberán incorporarse a una entrega posterior;
este paquete todavía utiliza las evidencias y fixtures locales existentes.
