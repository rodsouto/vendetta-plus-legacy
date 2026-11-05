# Carga local de una hora del worker integrado

Ejecución del 31 de octubre de 2026, con setups locales inseguros existentes,
GOMAXPROCS=8 y GOMEMLIMIT=6GiB. No se regeneraron claves ni hubo despliegue real.

Resultado en [soak-results.json](2026-10-31T01-41-50-936Z/soak-results.json),
[resumen verificable offline](2026-10-31T01-41-50-936Z/soak-summary.json) y
[entorno/fuentes](2026-10-31T01-41-50-936Z/environment.json).

| Observación | Resultado |
| --- | --- |
| Tiempo de la ventana de carga | 3752,48 s, 62,54 minutos |
| Contextos admitidos en Game | 6: dos válidos, dos compromisos inválidos, dos U inválidos |
| Pruebas nuevas generadas/verificadas | 35: seis iniciales y 29 repeticiones sin caché |
| Opening en repeticiones | 20 pruebas, 15 reutilizaciones calientes y cinco cargas frías |
| Invalid-point en repeticiones | 9 pruebas, cuatro reutilizaciones calientes y cinco cargas frías |
| Procesos residentes observados | 14 en total, máximo uno a la vez |
| Pico RSS nativo muestreado | 6620250112 bytes, 6,17 GiB |
| Pico RSS Node separado | 173199360 bytes, 165,18 MiB |
| Cola al terminar | Vacía; 29 peticiones duplicadas deduplicadas |
| Replay de los seis certificados finales | Game/consumidores reales, H3 reconstruido tras revertir Anvil |
| World completo puntual/tardío | Idéntico |

Cada petición obtiene contexto real de Game, autentica una firma drand archivada,
genera/verifica Groth16 y comprueba el consumidor EVM. Los certificados finales
se entregan a Game; las repeticiones se verifican durante el trabajo y sólo se
conserva el último artefacto de cada contexto. Los tiempos iniciales de
`certificates.json` son de la primera respuesta exitosa por misión; la primera
misión ya había generado su prueba durante el episodio H3 fallido. Los tiempos
de cada repetición están en soak-results; no inferir su latencia nativa de
la respuesta cacheada de recuperación.

El corte de una hora no cancela el trabajo que comenzó antes: se termina y
verifica esa prueba. Hubo rechazos de request manipulado, flag de invalidez
forjado y prueba cruzada, además de comprobación de todas las misiones pendientes
entre iteraciones. La [verificación de cierre](2026-10-31T01-41-50-936Z/cleanup.json)
confirma que los 14 PIDs observados habían terminado tras producer.close().

La [observación HTTPS separada](2026-10-31T01-41-50-936Z/remote-observations.json)
terminó una hora con 61 muestras correctas tanto de eth_chainId en el RPC público
de Gnosis como de la firma archivada de drand 1001. No ejecuta un Game remoto,
no mide futuras publicaciones de beacon y no es una garantía de disponibilidad.

Los [fallos sostenidos reales](../worker-faults/README.md) se ejecutaron después,
con tres pruebas nuevas y sin solapar provers. El soak ya incluía episodios
breves RPC/beacon/H3; no se presentan como caídas de un minuto.

## Reproducción y límites

Con las variables de binario, keys y solc del README del productor:

```bash
pnpm --filter @vendetta/web prover:soak 3600
pnpm --filter @vendetta/web prover:soak:summary <nuevo-directorio>/soak-results.json
```

El entorno de esta ejecución se capturó durante la primera prueba. El harness
y el helper de recuperación exactos de ese momento están en source-at-start:
la validación posterior del status desconocido de recibo y el modo de fallos
sostenidos son posteriores al arranque de esta carga. El replay de fallos sí
usa esos cambios y registra sus hashes por separado.

Se repiten seis contextos y se eliminan sus artefactos de prueba entre trabajos;
no son 35 admisiones distintas ni un benchmark de tasa de llegada. CPU/RSS son
muestras en hardware compartido, no límites físicos ni prueba de ausencia de
fugas. GOMEMLIMIT no impide superar 6 GiB de RSS. No se vaciaron cachés del SO.
No se midieron costes de infraestructura ni gas/precios de red real. Los
certificados iniciales, muestras de recursos y repeticiones no tienen el mismo
universo estadístico; el resumen conserva esa separación.
