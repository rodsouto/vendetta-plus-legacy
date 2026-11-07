# Linaje de recibos del MPC local

`pnpm check:lineage-hidden-v2` comprueba enlaces entre recibos JSON existentes:
las dos contribuciones y verificaciones de cada fase, commons, inicialización,
export de claves y manifest final. Sólo establece coherencia de recibos fijados
por hash. No verifica de nuevo el MPC, firmas, puntos o binarios referidos.

Desde la raíz del repositorio, el paquete opening incluido se comprueba así:

```bash
pnpm check:lineage-hidden-v2 \
  --packet docs/benchmarks/timelock-opening/receipt-lineage/opening \
  --index-sha256 c83a34751cccd806eeede0cb419c21620c73dea48ce4dbd52a8f90dcc0ca7d03 \
  --keys-sha256 12d13e25808ac946278b14dfce0d6c78ad39a55439dd251662d0fff322b261fc \
  --manifest-sha256 e1c210611c3c110ff45027f7fc7f2459c2b065ee3ffcb3a1b9ed38a4dfcc1455 \
  --circuit-sha256 06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f
pnpm test:lineage-hidden-v2
```

También funciona directamente con Python, sin SDK Go ni dependencias pnpm:
`python3 scripts/hidden-v2-receipt-lineage.py ...`. Conservar los pins mediante
un canal independiente. Los pins incluidos son identificadores de la evidencia
local, no aprobación ni autenticación de sus autores.

## Paquete de entrada y límites

El directorio contiene `index.json`, con exactamente cuatro campos:

- `schema`: `vendetta-unsafe-local-receipt-packet-1`.
- `kind`: `opening` o `invalid-point`, correspondiente al dominio 2²³ o 2²².
- `rootKeysSha256`: digest del `keys.json` final, que debe coincidir con el pin
  externo del caller.
- `documents`: objeto digest→nombre, donde cada nombre es exactamente
  `<digest>.json`. Copiar los bytes originales del recibo bajo ese nombre;
  no reformatear los JSON fijados. Hasta 32 entradas, sin duplicados.

El verificador abre un descriptor de directorio y archivos regulares no vacíos,
no bloqueantes y sin symlinks finales. Los nombres del índice no pueden contener
rutas arbitrarias. Cada JSON <=64 KiB, profundidad <=16, sin campos duplicados,
valores no finitos o campos de esquema desconocidos. El límite total leído,
incluido índice, es 2 MiB. Se rechazan recibos indexados no alcanzables. Otros
archivos que no figuran en el índice no se leen; esto no es inventario completo
del filesystem ni detector de secretos.

No descubre rutas fuera del paquete, escribe recibos ni sigue nombres de archivos
nativos. La preparación de los paquetes incluidos copió exclusivamente los bytes
públicos ligados a los pins finales y conservó sus paths/digests originales en el
recibo de construcción externo. El verificador no requiere esa caché original:
los dos paquetes pequeños están incluidos en el bundle de fuentes para revisión.

## Relaciones comprobadas

- Root keys, manifest y CS declarado coinciden con los pins externos. Inventarios
  de hashes completos, kind/perfil inseguros locales y dos beacons fijos conocidos.
  Un booleano de aprobación o de beacon posterior no puede convertirlos en seguros.
- Inicialización ligada al commons y al CS declarados; coherencia de restricciones,
  inputs públicos, shape, evaluaciones y tamaños wire declarados según el formato
  fijado. No reconstruye esas evaluaciones ni lee el CS.
- Dos contribuciones por fase, padres/antecesores y verificaciones en orden hasta
  la raíz esperada; se rechaza cadena incompleta, salto de contribución o mezcla
  de dominios/fases. Admite el primer recibo histórico de fase 1 con schema 1 y
  su sucesor schema 2, sólo cuando esos bytes estén enlazados al cierre final.
  No acepta por ello estados históricos interrumpidos o no alcanzables.
- En fase 1, hashes y dominio del anchor se contrastan con el recibo del artifact.
  Se valida la longitud/formato hex de sus campos, sin decodificar puntos.
  `nativeTransitionVerified=true` es una declaración exigida en los recibos
  históricos: no se transforma en una nueva verificación nativa de esta CLI.

Resultado: `unsafe-local-receipt-lineage-consistent`, número de documentos,
bytes JSON y dos contribuciones enlazadas por fase. `nativeMpcReverified`,
`referencedBinaryBytesVerified`, `participantIdentitiesAuthenticated`,
`closurePublicationAuthenticated`, `beaconAfterClosureProven`,
`independentApprovalVerified` y `productionApproved` permanecen false.
Ante fallo, salida no cero sin JSON de éxito.

Un grafo de recibos coherente puede ser fabricado por su propio operador si no
hay pins/autenticación independientes. Para importación segura siguen haciendo
falta los bytes binarios y su verificación criptográfica, identidades y cierre/
beacon auténticos, política de confianza y revisión externa. Esta herramienta
no habilita el servicio, manifests seguros o despliegues reales.

## Evidencia local

[Paquetes y resultados](../benchmarks/timelock-opening/receipt-lineage/README.md).
Ambos exports finales enlazan 12 documentos por circuito. Se leyó sólo JSON:
ningún transcript/CS/PK/VK binario ni nueva operación MPC/proving. Los resultados
raw y recibos de construcción/cierre permanecen fuera de Git con sus pins.
