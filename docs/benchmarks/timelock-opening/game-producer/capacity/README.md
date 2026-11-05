# Capacidad observada con proving real

Harness local de seis misiones distintas: dos paquetes válidos recién cifrados,
dos compromisos inválidos y dos puntos U inválidos. Cada misión recibe dos
peticiones HTTP simultáneas, para un total de doce. Las duplicadas deben obtener
el mismo certificado sin generar otra prueba. Hay cuatro pruebas de opening y
dos de invalid-point, ejecutadas en serie con setups existentes, sin mocks.

```bash
HIDDEN_PROVER_KEYS=/ruta/keys \
HIDDEN_PROVER_BIN=/ruta/vendetta-producer-v2 \
SOLC_BIN=/ruta/solc-0.8.28 \
PROVER_THREADS=8 PROVER_MEMORY=6GiB \
pnpm --filter @vendetta/web prover:capacity
pnpm --filter @vendetta/web prover:capacity:summary
```

El comando exige ambos setups preexistentes y despliega consumidores reales y
Game mediante Deploy.s.sol exclusivamente en un Anvil privado con chain ID 1337.
No genera setups. Las firmas drand archivadas son auténticas y se autentican,
pero su inyección local no comprueba la disponibilidad del beacon público.
Los resultados se escriben en esta carpeta, separados del replay original.
La caché privada de cada ejecución permanece fuera del repositorio, junto al
padre de las claves, y permite inspeccionar los artefactos nativos si hay fallos.
Ejecutar sin otro prover pesado simultáneo.

El harness amplía el plazo total de HTTP a 91 minutos para dar margen a seis pruebas
nativas de hasta quince minutos cada una. RPC/H3 y la cola tienen tiempos
adicionales; ese margen no garantiza terminar cualquier combinación de fallos. Usa `node:http` con un plazo total
explícito; evita que el plazo interno de headers de fetch corte una petición
encolada. Este transporte sólo admite loopback y no sigue redirecciones. No
cambia los timeouts del servicio ni del keeper de producción.

## Qué se registra

- `capacity-results.json`: tiempos HTTP con espera en cola, tiempo nativo por
  misión, métricas antes/después del lote, deduplicaciones, caché y transacciones
  H3 con su gas. Se exigen seis pruebas nuevas, seis deduplicaciones, cero hits
  durante proving y cola vacía al terminar. El muestreador debe haber observado
  seis procesos nativos de proving y como máximo uno a la vez.
- `certificates.json`: certificados públicos y gas de admisión y envío.
- `results.json`: aceptación en Game y replay después de revertir Anvil. La
  caché debe conservar los seis certificados, reconstruir H3 y obtener el mismo
  World completo al resolver puntualmente o con un salto inicial de dos horas
  de demora antes de producir pruebas. `lateEvidenceSeconds` describe ese salto;
  no mide el timestamp de cada envío, que puede avanzar durante proving/H3. También se
  rechazan una prueba manipulada y otra cruzada sin cambiar la misión pendiente.
- `summary.json`: resumen por circuito y coste de certificación por misión.
  El cálculo independiente deriva los recibos H3 del certificado, atribuye todas
  las transacciones a sus contextos y reconcilia la suma exacta del gas.
- `environment.json`: captura de la estación compartida durante el primer
  proving, hashes del binario/setups y de los tres archivos del harness ejecutado.
  Es evidencia de esta ejecución; el comando no sobrescribe esa captura.

El tiempo nativo procede del artefacto Go: incluye verificación de integridad,
carga de claves, preparación del witness, proving y verificación con VK. No es
el tiempo puro de `groth16.Prove`. El tiempo HTTP incluye los trabajos anteriores
en la cola, inspección, RPC y preparación/comprobación H3. El throughput divide
las seis misiones por el tiempo completo del lote, antes del replay con caché.

RSS y CPU se muestrean cada segundo mediante `/proc` en Linux. La CPU observada
puede omitir los últimos ticks y el muestreo puede perder picos de memoria.
Se separa RSS del proceso Node y de los procesos Go; no se contabilizan aquí
Anvil ni el resto del sistema. No es una prueba de ausencia de fugas, un límite
físico de memoria ni una medición aislada de otras cargas de la estación.
El muestreador no envuelve al proceso nativo: conserva el control de su PID y
SIGKILL por parte de `runProducer`.

## Interpretación del gas y límites

H3 se prepara una vez por contexto compartido. `summary.json` divide ese gas
entre las misiones que lo reutilizan, representando la fracción exactamente.
Para un contexto fresco independiente hay que pagar toda su preparación; esta
amortización no es una cota para otras misiones ni para el peor caso H3.
Los puntos U inválidos no necesitan preparación H3.

El total contabilizado suma admisión, preparación H3 observada y envío del
certificado. Excluye despliegues, los dos envíos revertidos deliberados y el gas
de drenaje/ejecución de misiones. El coste en wei se obtiene multiplicando gas
por el precio elegido en wei/gas; las tarifas de Anvil no estiman precios de
una red real. Tampoco se mide coste de infraestructura por misión.

Es un lote finito en una estación compartida. No establece capacidad garantizada,
tasa de llegada sostenible, percentiles de producción ni resistencia a fugas
tras horas o días. Siguen pendientes una carga prolongada, mezcla representativa
de misiones, RPC y beacon remotos, fallos prolongados, tarifas atascadas, reorgs,
setup seguro y auditoría.


## Resultado del 30 de octubre de 2026

El lote completó seis pruebas nuevas y doce peticiones en **1385,65 s (23,09 min)**,
con **seis deduplicaciones**, cero hits de caché durante proving y cero trabajos
pendientes al finalizar. El throughput de este lote fue **15,59 misiones/hora**.
Después se reutilizaron los seis certificados desde caché, se reconstruyó H3 tras
revertir Anvil y coincidió el World completo entre resolución puntual y tardía.

| Circuito | Pruebas | Tiempo nativo | Pico RSS muestreado |
| --- | ---: | ---: | ---: |
| Opening, válido o compromiso inválido | 4 | 241,59–306,09 s | 5,94 GiB |
| Punto U inválido | 2 | 166,01–168,23 s | 4,88 GiB |

Se observó un único prover activo. Node alcanzó 162,58 MiB de RSS muestreado,
contabilizado por separado. La estación compartida fue un Ryzen 7 5825U, con
16 CPUs lógicas y 18,95 GiB de RAM; Go usó ocho hilos y GOMEMLIMIT=6GiB.
Estos tamaños no son cotas físicas ni incluyen Anvil u otros procesos.

Las seis transacciones H3 de tres contextos consumieron **517120 gas**. El
contexto del compromiso inválido se compartió entre dos misiones. El envío
individual de certificado consumió 781579–846489 gas para opening y 383021 gas
para punto inválido. El total de admisiones + H3 + certificados fue **7527257 gas**:
por misión válida, 1502901–1565137; compromiso inválido con H3 amortizado,
1337200–1364964; punto inválido, 866427–890628. Excluye las operaciones indicadas
arriba y no representa un coste monetario de una red real.

Pasaron los **163 tests web, 23 archivos, sin skips**, incluidos dos nuevos tests
del parser de recursos y transporte del benchmark. Typecheck de scripts,
Prettier y git diff --check aprobados. Logs:
`/tmp/vendetta-producer-capacity.log` y
`/tmp/vendetta-producer-capacity-web.log`. No se repitieron suites rules/contratos,
no se regeneraron setups y no hubo despliegues en redes reales.
