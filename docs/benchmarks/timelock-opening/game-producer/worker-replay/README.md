# Replay real del productor con worker integrado

Ejecutado el 31 de octubre de 2026 con setups existentes, inseguros y sólo locales.
El servicio HTTP usa el mismo `ProducerWorker` integrado que la CLI de operación.
No se generaron setups ni se desplegó en redes reales. Reproducir desde la raíz:

```bash
HIDDEN_PROVER_BIN=/ruta/binario-actual \
HIDDEN_PROVER_KEYS=/ruta/keys \
SOLC_BIN=/ruta/solc-0.8.28 \
pnpm --filter @vendetta/web prover:worker:replay
```

Se compilan y despliegan consumidores reales y Game vía Deploy.s.sol sobre Anvil
privado, chain ID 1337. El servicio deriva los statements de storage, autentica
firmas drand archivadas, prueba con Groth16, verifica VK, prepara H3 y consulta
el consumidor desplegado antes de servir cada certificado autenticado por HTTP.

| Misión | Circuito | Reutilización | Nativo | HTTP con H3 |
| --- | --- | --- | ---: | ---: |
| Paquete válido recién cifrado, ronda 1001, salt máximo y origen en fila no cero | opening | No | 315,45 s | 315,79 s |
| Compromiso inválido, cinco candidatos H3 | opening | Sí | 59,73 s | 59,94 s |
| U inválido | invalid-point | No | 209,42 s | 210,71 s |

Lote de 586,44 s (9,77 minutos), tres pruebas nuevas y cola final vacía. Hubo dos
procesos nativos en total y máximo uno a la vez; el segundo arrancó después del
cierre del primero. Al finalizar `producer.close()` se comprobó además que
ambos PIDs observados habían muerto. Los reintentos desde caché no generaron
nuevas pruebas: tres hits, reconstrucción H3 tras revertir Anvil y World completo
idéntico entre resolución puntual y tardía. Se rechazaron request manipulado,
prueba cruzada y flag de invalidez forjado sin alterar indebidamente el receipt.

Carga de CS/PK/VK: 249,06 s en opening frío, <1 ms al reutilizar y 170,21 s en
invalid-point frío. Hashes de integridad se comprobaron en cada trabajo. Pico
RSS muestreado nativo 6,10 GiB; Node separado 157,87 MiB. GOMAXPROCS=8 y
GOMEMLIMIT=6GiB (no es límite físico de RSS). CPU/RSS son muestras por proceso:
el primer worker incluye dos pruebas, no una muestra independiente por misión.

Artefactos:

- `results.json`: invariantes de admisión, certificados, receipts, caché y World.
- `certificates.json`: certificados públicos y gas por envío.
- `worker-results.json`: tiempos, etapas, recursos, reutilización y métricas.
- `environment.json`: binario y manifiestos identificados por SHA-256, capturados
  durante el primer proving, sin claves ni variables privadas.
- `integration-checks.json`: validaciones adicionales de servicio/cierre y suites.

Binario usado: `/home/rodrigo/.cache/vendetta-producer-v2-supervisor`.
Log: `/tmp/vendetta-producer-worker-replay.log`. Claves y caché privada permanecen
fuera del repositorio. El comando escribe en esta carpeta; no sustituye los
resultados anteriores de `game-producer/` ni `capacity/`.

Es un replay corto, local, con una sola prueba invalid-point y sin reutilización
caliente de ese circuito. Las firmas auténticas archivadas no demuestran
disponibilidad remota del beacon. El salto inicial de dos horas se hace antes
del proving; no mide el timestamp de cada envío. No demuestra capacidad sostenida,
ausencia de fugas, recuperación ante transacciones atascadas/reorg profundo ni
supervivencia a SIGKILL del padre. Esas validaciones pertenecen a las etapas
siguientes; setup seguro y auditoría continúan pendientes.

Validación adicional: 178/178 tests web, 25 archivos, sin skips, con Foundry en
PATH. Los 24 tests específicos de servicio/supervisor/cola también pasaron,
incluido aborto de inspección con espera de muerte antes de liberar el turno.
Typecheck de scripts, Prettier y git diff --check aprobados. Sin cambios de
Solidity/reglas; no se repitieron sus suites. Manifest de fuentes/resultados
regenerado y verificado. Log web:
`/tmp/vendetta-producer-worker-integration-web.log`.
