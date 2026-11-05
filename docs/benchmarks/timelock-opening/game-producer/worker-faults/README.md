# Fallos sostenidos del productor real

Replay del 31 de octubre de 2026, posterior a la carga de una hora. Usa el mismo
binario/setups existentes, Game de Deploy.s.sol y consumidores reales en Anvil
privado, sin mock de criptografía. Firmas auténticas archivadas se sirven por
HTTP local. No se regeneraron setups ni hubo despliegues de red real.

[Resultado completo](2026-10-31T02-46-05-365Z/fault-results.json),
[entorno/fuentes](2026-10-31T02-46-05-365Z/environment.json),
[replay Game](2026-10-31T02-46-05-365Z/results.json) y
[cierre de workers](2026-10-31T02-46-05-365Z/cleanup.json).

| Episodio | Evidencia |
| --- | --- |
| RPC indisponible | 39 peticiones fallidas durante 60,67 s, cero pruebas/INVALID |
| Beacon indisponible | 39 peticiones fallidas durante 63,35 s, cero pruebas/INVALID |
| H3 minado con respuesta perdida | Journal retenido, 13 reintentos fallidos durante 60,64 s adicionales, misma prueba y mismos bytes firmados |
| Transporte restaurado | Journal resuelto, primera respuesta cacheada en 139 ms; producción continúa |
| Cierre | Tres pruebas nuevas, dos procesos residentes en total, máximo uno observado y ambos terminados |
| Replay tras revertir Anvil | Tres hits de caché, H3 reconstruido, World completo puntual/tardío idéntico |

El lote tardó 615,68 s. El proxy perdió 14 respuestas de broadcast (la primera
tras entregar la transacción al nodo y las retransmisiones del mismo raw),
rechazó 28 consultas de recibo, 39 consultas RPC y 39 respuestas beacon.
No se preparó otra transacción para saltarse el journal. Las misiones siguieron
pendientes tras cada fallo; sólo los certificados reales posteriores establecen
validez/invalidez. Los inputs/flags manipulados y pruebas cruzadas se rechazan.

```bash
pnpm --filter @vendetta/web prover:faults:replay
```

El modo mantiene cada ventana al menos un minuto con reintentos cada cinco
segundos, además del tiempo de las peticiones. El episodio H3 empieza con un
proving nuevo y añade su minuto de reintentos después de perder la primera
respuesta. Los plazos/barreras del servicio no cambian. El entorno de este
replay se capturó al terminar; su fase de captura está indicada explícitamente.

Son ventanas locales acotadas, no días de indisponibilidad ni failover de
proveedores públicos. La observación pública de una hora está separada en
worker-soak. Este caso prueba un envío H3 minado, no un reemplazo de fees ni
una reorganización profunda con nonce pendiente. Los historiales de transacción,
keeper y log index viven en sus tests específicos y conservan sus fronteras de
mock explícitas. Setup seguro y auditoría siguen pendientes para producción.
