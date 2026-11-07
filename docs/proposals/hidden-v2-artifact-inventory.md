# Inventario offline de exports locales

`pnpm inspect:artifacts-hidden-v2` verifica bytes de un export experimental
existente. Es una pieza de preflight para la futura importación, no un
importador de producción ni una política de aprobación. Sólo acepta el formato
inseguro local vigente y los dos CS conocidos del juego. No copia, instala,
deserializa ni modifica claves. No cambia la política del productor/despliegue.

```bash
pnpm test:artifacts-hidden-v2
pnpm inspect:artifacts-hidden-v2 \
  --directory /ruta/al/export/public \
  --kind opening \
  --manifest-sha256 <pin-externo-del-manifest> \
  --receipt-sha256 <pin-externo-de-keys-json> \
  --max-bytes 2147483648
```

Default: 64 KiB para todo el inventario; rechaza ambos exports del juego antes de
leer sus cuerpos. El operador debe elegir explícitamente un presupuesto mayor
(techo de formato 4 GiB). No se infiere suficiencia de CPU/wall/disco ni se impone
una cuota kernel mediante ese presupuesto. La lectura de cuerpos usa bloques
de hasta 1 MiB, sin buffers proporcionales al tamaño total.

## Comprobaciones

- Inventario exacto de seis archivos: `manifest.json`, `keys.json`, `circuit.bin`,
  `proving.key`, `verifying.key`, `Verifier.sol`. Sólo archivos regulares no vacíos;
  opens no bloqueantes y sin symlinks finales, relativos a un descriptor de
  directorio mantenido abierto. Un padre de la ruta puede ser un symlink; lo
  comprobado queda ligado al directorio abierto, no a una garantía de su nombre.
- Presupuesto total calculado con fstat antes de leer; JSON de hasta 64 KiB,
  profundidad 16, sin campos duplicados, valores no finitos ni campos de esquema
  desconocidos. Pins SHA-256 externos obligatorios para manifest y recibo.
- Kind/perfil/CS conocidos, restricciones e inputs públicos declarados exactos;
  dominio del recibo, beacon local fijo, flags inseguros explícitos y ausencia
  de aprobación. Los tamaños declarados se contrastan con el perfil conocido,
  no mediante deserialización del CS en esta herramienta.
- Inventarios de hashes completos, vínculo recibo→manifest y correspondencia de
  cada cuerpo por SHA-256. Pins de las referencias de procedencia bien formados;
  sus documentos/transcripts no se leen ni autentican.
- EOF y comparación antes/después de inode/tamaño/mtime/ctime, incluidas las
  entradas del directorio. Detecta sustituciones observadas durante la lectura;
  no es snapshot atómico ni protección contra todas las mutaciones concurrentes.
  Usar exports inmutables y conservar los pins por un canal independiente.

Un pin calculado desde la misma copia local sólo identifica esos bytes; no
acredita quién los revisó. Incluso un export coherente con todos los hashes
podría tener relaciones criptográficas incorrectas si los pins no son confiables.

Resultado: `unsafe-local-export-inventory-verified`, `artifactBytesVerified=true`.
`nativeDecodingPerformed`, `artifactRelationsVerified`, `mpcTranscriptsVerified`,
`beaconAfterClosureProven`, `independentApprovalVerified` y `productionApproved`
permanecen false. Ante fallo, salida no cero y ningún JSON de éxito.

## Ejecución local completada

[Informes conservados](../benchmarks/timelock-opening/artifact-inventory/README.md).
Se inspeccionaron en secuencia los exports existentes de ambos circuitos,
con presupuesto de 2 GiB por export. No se repitió setup, FFT, contribuciones,
MPC ni proving; no se reemplazaron sus artefactos.

La futura importación deberá añadir verificación de relaciones nativas y
transcripts contra CS autenticado, cierres/beacons independientes y aprobación
externa vinculada a los artefactos y destinos. Esta herramienta no implementa
esa autoridad ni concede permisos a partir de booleanos del operador.
