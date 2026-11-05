# Protocolo único v2 desde el despliegue

Fecha: 2026-10-29. Sustituye la [activación opcional](../world-admission/README.md).

## Objetivo y decisión

Como no hay mundos desplegados, todos empiezan directamente con v2. Se eliminó el protocolo oculto anterior y su compatibilidad: no hay selector de versión, migración, activación posterior, revelación por compromiso, lista de aparcado ni cancelación al pasar un plazo.

Un ataque válido conserva llegada y orden mientras espera un certificado. Conocer el mensaje o sufrir un fallo del keeper no permite descartarlo. Solo un resultado establecido por los verificadores puede registrar invalidez; las reglas normales de combate, rebote y recall anterior a la llegada siguen vigentes.

## Inicialización y admisión

Game se inicializa con cinco direcciones:

```solidity
initialize(admin, operator, arbiter, openingConsumer, invalidPointConsumer)
```

Ambos consumidores deben tener código y quedan fijados al inicializar. No existe un setter o una función `activateHiddenV2`. El deploy real exige `HIDDEN_OPENING_CONSUMER` y `HIDDEN_INVALID_POINT_CONSUMER`; no crea mocks ni selecciona un protocolo alternativo si faltan.

El modelo exige también consumidores al construir `newWorld`. No puede iniciar un World sin esa configuración y después elegir si sus ataques usan certificados. La carga web obtiene las direcciones del contrato y reconstruye ese mismo estado.

**Una dirección con código no acredita la corrección de su verificador.** Hay que revisar contratos, perfil, setup, mutabilidad y direcciones antes de desplegar. La administración conserva la frontera de confianza de los upgrades UUPS; esta fase no elimina esa autoridad.

Cada `sendHiddenMission` valida las reglas económicas normales y vincula el paquete exacto emitido con un recibo PENDING. El contexto incluye red, proxy, misión, perfil, propietario, origen, cover, cargo, llegada, ronda, identidad quicknet, compromiso y hash del paquete. La llegada y secuencia se fijan además en el recibo.

El paquete es siempre v2, de 273 bytes; su mensaje autenticado tiene 37 bytes y salt de 256 bits. Un error de framing o ronda/llegada revierte el cobro, tropas, contador, id y secuencia de la admisión completa. La basura opaca con framing admisible se resuelve después mediante un certificado de invalidez.

## Resolución y rutas eliminadas

La cola conserva el ataque en su posición original. Un head vencido sin evidencia detiene el drenaje y las acciones que dependen de él. No hay una ventana tras la cual pierda su resultado ni se permita adelantarlo.

`submitHiddenEvidence` registra la apertura o invalidez certificada sin drenar. Las dos rutas de invalidez —apertura completa e invalidez de U— se normalizan al mismo resultado. Al consumirlo, la misión válida ejecuta las reglas normales con su llegada/seq originales; la inválida vuelve desde la llegada original. Un revert restaura el heap y el recibo.

Se quitaron:

- Las entradas públicas `reveal`, `forfeit`, `parkedMissions` y `activateHiddenV2`.
- La lista enlazada de misiones aparcadas y la lógica que reasignaba llegada y secuencia al revelar tarde.
- Los límites de gracia/orden del motor y las constantes correspondientes generadas para Solidity.
- La configuración opcional de v2 y las ramas que admitían una misión oculta sin binding.
- El formato plaintext local, la revelación automática con secretos del navegador y las rutas de bundler/RPC privadas dedicadas a esas revelaciones.

El evento de resolución inválida pasa a llamarse `HiddenMissionInvalidated`: describe un resultado certificado, no una cancelación por falta de revelación.

## Cliente, proyección y keeper

El navegador genera el mismo paquete cifrado en todas las redes. Una prueba nueva lo descifra con tlock nativo y conserva todos los bits del salt; otra rechaza texto/formato anterior. Los drafts locales pueden seguir serializados como JSON para recuperar el formulario: esos datos no son un paquete admitido ni una autorización de resolución.

El loader lee configuración y recibos, incluidos los consumidos de misiones terminadas. La proyección espera cuando encuentra un head pendiente y no liquida edificios más allá de él. El planificador de transacciones solo adelanta resultados ya certificados. Mantiene el retry de Backlog y respeta los prefijos de transacciones que ya se confirmaron; no intenta introducir revelaciones o cancelaciones por conocer el plaintext.

El keeper usa un servicio de certificados configurado mediante `HIDDEN_PROVER_URL`. Envía datos públicos del contexto/paquete, recibe un certificado ABI completo, simula su comprobación en Game, lo publica y avanza la cola. El servicio debe preparar también la caché H3 necesaria en su consumidor. El keeper no interpreta un error de descifrado, red, timeout, respuesta malformada o servicio caído como invalidez. Reintenta; no hay ruta de forfeit.

El [productor HTTP y replay real](../game-producer/README.md) ya generan certificados nuevos para contextos admitidos por Game. El servicio deriva el contexto del contrato, autentica la firma drand y su ronda, selecciona la relación, verifica Groth16, prepara H3 y comprueba el consumidor desplegado. La caché vincula statement y setup. La integración sin mocks produjo el mismo World completo con evidencia puntual y con dos horas de demora; cubrió apertura válida, commitment inválido y U inválido, rechazo de pruebas manipuladas/cruzadas y reconstrucción H3 tras revertir Anvil. Se usaron claves locales inseguras, nunca aptas para redes reales.

Las operaciones patrocinadas y los certificados usan el bundler ordinario. Ya no se requiere la ruta privada anterior porque no existe una revelación directa anterior al beacon que pueda reordenarse frente al ataque histórico.

## Consumidores y despliegues de prueba

Los consumidores canónicos y H3 están en `contracts/src/hidden`. Tres regresiones verifican **pruebas Groth16 reales archivadas** contra ese código: apertura válida, apertura inválida y U inválido. Los verificadores de esos tests se generan como fixtures desde sus artefactos archivados mediante un script incluido en codegen.

Las regresiones archivadas verifican el traslado de los consumidores. Los tests unitarios de Game y Anvil usan consumidores mock explícitos para aislar contexto, atomicidad, almacenamiento y cola. El replay adicional `prover:replay` genera tres certificados nuevos y usa consumidores reales con `Deploy.s.sol`, sin mocks.

`DeployTest.s.sol` crea esos mocks y está limitado a chain ids de prueba. Los scripts locales/AA/e2e usan ese fixture; `Deploy.s.sol` exige consumidores predesplegados. Los mocks mantienen el mismo protocolo de paquete/recibo, pero no aportan seguridad criptográfica. No son un modo v1 ni un fallback del despliegue real. Un salto del reloj local no produce un beacon futuro de drand: los tests usan fixtures/certificados mock explícitos y las misiones sin certificado siguen esperando.

## Layout, escenarios y trazabilidad

Se eliminaron los campos de aparcado y se registró el nuevo layout con `--force`, únicamente porque no existe ningún despliegue. No se escribió una migración ni se conservó almacenamiento incompatible por una necesidad inexistente. Este snapshot pasa a ser la referencia; los futuros upgrades desplegados siguen sujetos a B-17.

Los escenarios se regeneraron desde el generador. Ahora sus acciones de apertura/invalidez entregan certificados mock y sus snapshots no contienen misiones aparcadas. Los tests de estacionamiento usan la llegada original incluso cuando el certificado tarda, conservando el cooldown de tropas. Los casos que antes afirmaban caducidad, adelantamiento o revelación por compromiso se sustituyeron por invariantes v2; no se mantuvieron como excepciones ni se marcaron skip para conservar un contador de tests.

Los experimentos anteriores de frontera local y mezcla se conservan como [fuente histórica](../../resource-frontier/historical-source/README.md), fuera del build y la suite activa. Sus resultados describen esa investigación anterior; no son una implementación de compatibilidad ni evidencia de una frontera local actual.

El perfil criptográfico de investigación sigue fijado al hash ya medido. Dos claves antiguas del YAML permanecen únicamente como datos reservados de ese digest; el motor no las expone como reglas ni las usa y Solidity no genera sus constantes. Cambiar el digest exige versionar la relación, el setup y sus pruebas; no proporciona una ruta para volver al comportamiento anterior.

## Ventajas, costes y pendientes

- Se reduce el estado y desaparece el riesgo de mezclar forfeit v1 con resoluciones históricas v2.
- La ausencia de compatibilidad permite un único sender, wire format, camino de certificados y conjunto de invariantes desde el primer despliegue.
- A cambio, el despliegue exige consumidores correctos y el funcionamiento práctico requiere un prover. No puede arrancar ocultamente con el protocolo anterior si falta infraestructura.
- La espera global sigue teniendo un coste de disponibilidad: también puede bloquear una misión basura hasta que alguien certifique su invalidez. No se implementó una frontera local por recursos.
- La corrección temporal no garantiza progreso ante una interrupción indefinida de cadena, drand, proving o envío.

Pasaron **744 tests de reglas, 188 de contratos y 107 web**, sin skips; los contratos incluyen 25 tests de escenarios diferenciales y tres pruebas criptográficas archivadas. Pasaron además los 11 tests del comprobador de layout. Game mide **23.151 bytes**, por debajo de EIP-170. Los checks y tamaños finales están en [results.json](results.json). Pasan las suites de reglas, Solidity/layout y web, el replay diferencial, la verificación de los tres certificados archivados, la integración Anvil y el build web. No se hizo ningún despliegue real.

El siguiente trabajo es cerrar el setup seguro, la auditoría y el endurecimiento operativo, evaluar capacidad/costes y ampliar historiales adversarios antes de un lanzamiento. Los contadores anteriores corresponden a la validación de v2-only; el replay real posterior se registra por separado en game-producer.


La [medición posterior de capacidad](../game-producer/capacity/README.md) ejecutó
seis pruebas nuevas con doce peticiones concurrentes en 23,09 minutos, seis
deduplicaciones y replay desde caché con consumidores reales y World idéntico.
Registró 15,59 misiones/hora y 5,94 GiB de RSS máximo muestreado en estación
compartida. Es un lote local finito, no capacidad garantizada ni una validación
de disponibilidad remota. Los resultados y contadores posteriores permanecen
separados de la validación original de v2-only.


El [replay posterior con worker integrado](../game-producer/worker-replay/README.md)
validó tres certificados nuevos con ambos circuitos, reutilización de artefactos,
H3 real y reconstrucción desde caché tras revertir Anvil. El servicio ya usa el
supervisor con timeout por job y cierre del proceso antes de cambiar de circuito.
Estos resultados se registran por separado; los contadores originales de
v2-only no cambian. Resistencia prolongada, recuperación de transacciones/reorg,
setup seguro y auditoría siguen pendientes.


La [carga posterior de una hora](../game-producer/worker-soak/README.md) y el
[replay de fallos sostenidos](../game-producer/worker-faults/README.md) completan
la evidencia operativa local con 35 y tres pruebas nuevas respectivamente,
World puntual/tardío idéntico y recuperación de cola/journal/H3. El keeper ahora
usa journal y checkpoints canónicos para sus logs; el pronóstico cliente se
detiene ante evidencia pendiente. Estos resultados y los checks posteriores
están separados de los contadores originales de v2-only. Setup seguro, auditoría
y capacidad/disponibilidad de producción siguen pendientes.
