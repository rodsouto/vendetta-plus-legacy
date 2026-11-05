# Fronteras de resolución: simulación de disponibilidad

Fecha: 2026-10-28. Experimento de diseño previo a cambiar contratos. Complementa la [propuesta de misiones ocultas](../../proposals/hidden-mission-resolution.md).

Seguimiento completado: [investigación de dependencias sobre el motor real](../../proposals/hidden-mission-dependencies.md). Reproduce conflictos que este modelo omite y describe por qué los porcentajes de `owners` todavía no corresponden a una frontera segura implementable.

## Qué mide y qué no demuestra

Compara cuánto esperarían acciones sobre edificios si las llegadas ocultas conservaran su hora original y no pudieran adelantarse operaciones dependientes. Es un simulador de planificación temporal y recursos, **no una ejecución del juego, un benchmark de Gnosis ni una prueba de que el diseño preserve todos los resultados de combate**.

No genera revelaciones ni pruebas criptográficas. No cambia contratos, reglas del juego, keeper ni interfaz. No evalúa si ZK/tlock es viable en navegador. Todas las misiones modeladas son ofrecidas como válidas: el abuso consiste en muchas llegadas válidas cuyo remitente no revela, no en introducir basura.

Los resultados permiten descartar supuestos demasiado optimistas sobre disponibilidad. No bastan para aprobar la arquitectura.

## Resultados y decisión que permiten tomar

Con margen de 3 s y el publicador con publicaciones en vuelo, la exposición media al bloqueo es:

| Carga ofrecida | Frontera global | Disco geográfico | Disco ampliado a propietarios |
| --- | ---: | ---: | ---: |
| 50 jugadores, 100 misiones/día, destinos aleatorios | 1,09 % | 0,59 % | 0,59 % |
| 200 jugadores, 1.000 misiones/día, destinos cercanos | 12,00 % | 1,36 % | 3,24 % |
| 200 jugadores, 1.000 misiones/día, destinos aleatorios | 12,14 % | 6,96 % | 9,06 % |
| 500 jugadores, 5.000 misiones/día, destinos cercanos | 48,21 % | 6,48 % | 14,96 % |

Son medias de tres semillas y cargas nominales, no población ni tráfico observados. En global, el porcentaje representa tiempo con todos los edificios bloqueados; en las opciones locales representa exposición media por edificio, no una pausa global equivalente.

Hallazgos:

1. **La frontera global resulta muy sensible a la escala.** Bajo las hipótesis del escenario de 500 jugadores alcanza casi la mitad del día bloqueado, incluso reduciendo el margen de apertura a 3 s. No la recomendaría como arquitectura de producto para esa carga sin otro mecanismo que reduzca pausas.
2. **No debemos confundir disco con clausura correcta.** En el escenario medio cercano, incluir propietarios multiplica la exposición de 1,36 % a 3,24 %. El alcance medio directo crece de aproximadamente 12 % a 29 % de edificios; todavía faltan dependencias como familias y mercado.
3. **La localidad de los ataques importa mucho.** Con destinos aleatorios, el alcance medio de propietarios sube a aproximadamente 82 % y su exposición a 9,06 %, próxima al 12,14 % global. No basta con que el mundo sea grande para que un disco sea pequeño.
4. **Reducir el margen ayuda, pero no elimina la latencia.** En la carga media cercana, pasar de 15 a 3 s reduce global de 20,93 % a 12,00 % y propietarios de 6,16 % a 3,24 %. Incluso el margen 0 conserva tick, publicación, inclusión, ejecución y esperas encadenadas. No se ha demostrado que los márgenes reducidos mantengan la privacidad en Gnosis.
5. **Una caída larga domina las esperas aunque se recupere rápido el backlog.** Tras 30 minutos sin keeper, el backlog previo a la recuperación se liquida en aproximadamente 47 s globales o 45 s en propietarios con la capacidad supuesta. Pero el p99 diario de espera ya es de unos 919 s y 749 s respectivamente. En la ventana de una hora alrededor del incidente, el p95 supera 25 minutos en propietarios. Recuperarse en menos de un minuto no significa que los usuarios solo esperaron ese minuto.
6. **El publicador serial es un cuello de botella independiente de la geografía.** Para la ráfaga de 200 misiones desde diez cuentas, propietarios tiene exposición del 14,15 % y espera p95 de 113 s en la ventana de 30 minutos con separación de publicaciones de 1 s. Con separación de 6 s suben a 70,83 % y 1.166 s. Esta variante aproxima un publicador que espera recibos; no mide el keeper desplegado ni demuestra que la ráfaga tenga coste económico trivial.
7. **La frontera local no resuelve una pérdida permanente de información.** En el flujo ofrecido sin drand ni remitentes disponibles, las dependencias acaban conectando todos los edificios y las esperas son infinitas. Este es un caso de estrés con llegadas exógenas continuadas, no una demostración de que esa propagación sea inevitable con envíos reales sujetos a la propia frontera.

**Siguiente paso recomendado:** especificar la clausura de dependencias con escenarios pequeños del motor real —investigación y honor del jugador, familias, mercado y casillas vacías— y comprobar qué operaciones pueden conmutar sin cambiar resultados. Esto debe preceder a implementar un heap local o escoger una prueba criptográfica. Los números justifican investigar una frontera acotada; no autorizan a usar el disco aislado como solución correcta.

## Reproducción y artefactos

Desde la raíz, con las dependencias instaladas:

```bash
pnpm --filter @vendetta/rules exec tsx scripts/experiments/hidden-barriers.ts
pnpm --filter @vendetta/rules test
```

- [Resultados completos](results.json): parámetros, semillas, hashes de fuentes y configuración, métricas por ejecución. `Infinity` se serializa como cadena; no significa una espera finita muy grande.
- [Resumen](summary.md): margen de apertura de 3 s, medias entre semillas.
- [Sensibilidad e incidentes](sensitivity.md): comparación de márgenes y ventanas alrededor de las caídas y ráfagas.
- [Generador](../../../packages/rules/scripts/experiments/hidden-barriers.ts): escenarios y cálculo de métricas.
- [Planificador](../../../packages/rules/scripts/experiments/barrier-model.ts): dependencias, publicación de revelaciones y servicio de ejecución.
- [Pruebas](../../../packages/rules/test/barrier-model.test.ts): orden temporal, propagación, independencia, retornos, indisponibilidad y recuperación.

El experimento no hace llamadas a redes externas. Su salida numérica es determinista para las fuentes y semillas registradas. La versión de Node forma parte de los metadatos.

## Tres modelos comparados

| Identificador | Qué se bloquea por llegada | Interpretación |
| --- | --- | --- |
| `global` | Todos los edificios | Referencia conservadora dentro de los recursos representados; reproduce una cola temporal única |
| `disk` | Edificios existentes dentro del `cover`, más origen; retornos en el origen | Referencia geográfica optimista: omite investigación, honor y otras dependencias de nivel jugador |
| `owners` | Todos los edificios de los propietarios alcanzados por el disco, más el remitente | Aproximación que protege el estado compartido de esos jugadores y propaga dependencias entre misiones; **no es una clausura completa certificada** |

Se usa `distance` y `coverFor` del motor real: grilla de 50 × 50 barrios de 255 casillas, distancia redondeada y relleno de `cover` según las reglas actuales. Las distancias se calculan con enteros en el motor y se almacenan en una caché numérica exacta para este mapa.

Cada recurso ordena sus eventos por `(hora original, id)`. Una llegada posterior que comparte recursos depende de la anterior, aunque su revelación esté lista primero. Una misión que toca otra zona propaga la espera a esa zona. Los eventos independientes pueden adelantarse en los modelos locales. Un trabajador de ejecución comparte capacidad finita, pero no queda retenido esperando información desconocida si existen eventos independientes ejecutables.

Una vez revelado el destino, el experimento **no reduce** el conjunto de recursos del evento que aún espera otras dependencias. Esto puede sobrestimar el bloqueo local. A la vez, omitir otras dependencias puede subestimarlo: no se debe presentar `owners` como una cota superior ni inferior rigurosa del juego final.

## Hipótesis de carga y latencia

- Una hora de calentamiento y 24 horas de observación. Se incluyen retornos posteriores al fin de la observación para liquidar la carga ya generada; no nuevas idas después del cierre.
- Semillas 13, 71 y 991; 12 escenarios × 3 semillas × 3 márgenes × 3 modelos = 324 ejecuciones.
- Poblaciones de 50, 200 y 500 jugadores, con uno o tres edificios cada uno. Ubicaciones únicas uniformes en todo el mapa, salvo el escenario denso, contenido en un rectángulo de 170 × 150 casillas. Los edificios de un mismo jugador se distribuyen independientemente.
- Llegadas sintéticas Poisson: 2, 5 o 10 misiones por jugador/día. La cantidad efectiva varía con la semilla. No es una estimación de población ni actividad real.
- Destinos `random`: edificio extranjero aleatorio. Destinos `local`: el más cercano de 12 edificios extranjeros muestreados. No se presume que eso describa cómo jugarán los usuarios.
- El 25 % de las misiones normales tiene un remitente que revela al llegar; la revelación propia se incluye 5 s después. También hay una variante con 0 % de remitentes disponibles.
- Márgenes de apertura 0, 3 y 15 s; tick del keeper 2 s; 1 s para preparar una publicación y 5 s de inclusión. Margen 0 es una referencia optimista, **no una recomendación de privacidad**. No se han comprobado diferencias de relojes ni latencias reales.
- Publicador con separación mínima de inicios de 1 s: permite publicaciones en vuelo. Una variante usa separación de 6 s para aproximar publicaciones seriales que esperan inclusión. Se omiten duplicados cuando el remitente terminaría antes. No se reproduce exactamente el bucle del keeper actual.
- Capacidad de ejecución por defecto de un evento/s, compartida entre misiones y retornos. Es una hipótesis, no gas medido. La variante lenta usa un evento cada 10 s y separa publicaciones por 10 s.
- Toda ida genera un retorno sintético a la hora original más 3.600 s. El retorno no puede ejecutarse antes de la resolución de la ida. No se simulan combates, bajas, botín, estaciones ni duración por velocidad de tropas.
- Caída del keeper de 30 minutos en la mitad del día; los remitentes disponibles siguen pudiendo revelar. No incluye una caída simultánea de la cadena.
- Ráfagas únicas de 20 misiones por cada una o diez cuentas reservadas, con llegadas simultáneas y sin revelación propia. Se respeta el límite de 20 idas de esas cuentas en la ráfaga; no se han demostrado economía, entrenamiento, capacidad de financiarla ni horarios de salida que permitan ese historial exacto.
- Indisponibilidad permanente: drand no abre ninguna ronda del experimento y ningún remitente publica. Es un caso límite deliberado.

**Las llegadas son carga ofrecida exógena.** No se generan mediante envíos legales en una partida que ya esté bloqueada; tampoco se aplican todos los límites de misiones a la carga normal. Sirven para comparar el mismo flujo bajo distintos planificadores y estresar la recuperación, no para predecir una población en equilibrio. En particular, la propagación bajo indisponibilidad indefinida supone que continúan llegando las misiones del flujo ofrecido: no demuestra que un solo envío pueda detener inevitablemente un mundo real completo.

## Cómo leer las métricas

- **Edificio bloqueado (%):** tiempo bloqueado sumado entre edificios y dividido por edificios × tiempo observado. Equivale a exposición media de una acción uniforme sobre edificios; no es porcentaje de transacciones reales fallidas.
- **Todos bloqueados (%):** fracción del día en la que coinciden pausas sobre todos los edificios representados. En `global` coincide con la métrica anterior.
- **Alcance medio (%):** edificios cubiertos directamente por cada ida antes de propagación. No equivale al porcentaje de tiempo bloqueado.
- **Espera p50/p95/p99:** tiempo hasta salir de la unión de pausas para 20.000 consultas uniformes de edificio y hora por ejecución. Incluye ceros. Las tablas promedian percentiles de tres ejecuciones, no calculan un percentil combinado.
- **Espera condicional:** el JSON incluye p95 de esperas positivas finitas. Ayuda cuando el p95 general es cero porque pocas consultas encuentran una pausa.
- **Ventana del incidente:** exposición y p95 sobre los 30 minutos desde una ráfaga, o la caída de 30 minutos más los 30 posteriores; 5.000 consultas por ejecución. Evita esconder un incidente corto con una media diaria.
- **Recuperación del keeper:** tiempo tras volver el servicio hasta finalizar todos los eventos ya vencidos y todavía pendientes en ese instante. No exige vaciar misiones cuyo vencimiento sea posterior. El backlog cuenta idas y retornos.
- Los percentiles cercanos al cierre pueden depender de la truncación del flujo de nuevas idas. No se extrapolan como garantías de espera máxima ni se estiman intervalos de confianza con solo tres semillas.

## Límites de corrección pendientes

La revisión de `Battle.sol`, `Missions.sol`, `Settlement.sol` y `Market.sol` muestra que proteger únicamente tropas del destino no basta. `owners` incorpora investigación, número de edificios/honor y estado compartido a través de un recurso por jugador. Aun así quedan fuera:

- Casillas vacías, registro, nuevas ocupaciones y cambios de propiedad: el mapa del experimento es estático.
- Contratos de mercado, depósitos y retiros, y transferencias con efectos externos.
- Puntuación de guerra, estado compartido de familias y cambios en sus integrantes.
- Cambios administrativos, versiones de reglas, vacaciones, sesiones e invitaciones.
- Acciones de usuario aceptadas o rechazadas durante la espera: las consultas solo miden disponibilidad, no ejecutan una transacción de juego.
- Coste de verificación criptográfica, generación de pruebas, gas, patrocinio, reorgs, errores de red, duplicados y RPC privado.

Por eso reducir pausas en esta simulación no demuestra que sea seguro saltarse un evento en el contrato. Falta especificar la clausura de recursos y contrastarla con una ejecución del motor real antes de diseñar esa optimización.

## Validación

El planificador tiene ocho pruebas específicas: independencia y propagación por una misión puente; información permanentemente ausente; empate temporal; dependencia del retorno; comparación con una recurrencia global de solución conocida; capacidad finita sin bloqueo artificial del trabajador; recuperación y revelación del remitente sin drand; y unión de intervalos/esperas con horizonte recortado.

Se ejecuta además la suite de `@vendetta/rules`, que incluye typecheck. No se modificó la máquina de estados, por lo que estos resultados no se presentan como nuevos escenarios diferenciales TS/Solidity ni como pruebas de contratos.

Resultado de validación: typecheck y **714 pruebas en 8 archivos** correctos, incluidas las ocho pruebas del planificador. Se comprobaron también formato de los archivos TypeScript, hashes de entrada y consistencia del conjunto de resultados.
