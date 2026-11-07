# PK en streaming: dimensiones y parámetros compartidos con VK

`pnpm check:pk-structure-hidden-v2` recorre una PK existente sin deserializarla.
Contrasta su estructura con metadatos de compilación fijados por SHA-256 y cinco
parámetros compartidos con una VK validada. No prueba la relación algebraica
completa entre CS, PK y VK ni la procedencia del setup. No escribe artefactos.

```bash
VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go \
  pnpm check:pk-structure-hidden-v2 \
  --metadata /ruta/opening-1.json --metadata-sha256 <pin-metadatos> \
  --circuit-sha256 <pin-CS-declarado-esperado> \
  --pk /ruta/proving.key --pk-sha256 <pin-PK> \
  --vk /ruta/verifying.key --vk-sha256 <pin-VK> \
  --max-bytes 2147483648
```

Los metadatos usan `vendetta-hidden-v2-compiled-cs-1`, como las salidas existentes
de [reproducción del CS](../benchmarks/timelock-opening/cs-reproduction/README.md).
Se acotan restricciones/dominio/variables/compromisos y sus sumas antes del scan.
El pin externo autentica correspondencia con esos bytes, no quién los compiló.
El CS declarado debe coincidir con `--circuit-sha256`, pero sus bytes no se leen:
no presentar este chequeo como una nueva reproducción del CS ni un binding
algebraico. Los flags históricos de medición/aprobación del JSON no autorizan nada.

## Comprobaciones y límites

- VK <=64 KiB, copiada/fijada por hash; longitudes controladas antes del decoder,
  puntos/subgrupos nativos y reserialización canónica. Reutiliza el mismo lector
  que la [comprobación VK → Solidity](hidden-v2-vk-export-check.md).
- PK con presupuesto explícito, default 64 KiB y techo 2 GiB. La CLI rechaza por
  tamaño antes de recorrerla. Lectura sobre el mismo descriptor de archivo regular,
  no bloqueante y sin symlinks finales; hash incremental y EOF. La API acepta un
  reader, lee como máximo presupuesto+1 y no aplica límites kernel por sí sola.
- Dominio FFT: cardinalidad y cinco campos escalares canónicos comparados contra
  `fft.NewDomain(..., WithoutPrecompute())`; flag de precomputación 0/1. Nunca
  llama al deserializador de dominio ni construye tablas FFT grandes.
- Tres parámetros G1 y dos G2 se comparan byte a byte con la VK comprobada:
  alpha/beta/delta G1, beta/delta G2.
- Tamaños compactos de A/B/G2.B, Z, K privado, wires y bases de compromisos
  contrastados contra dimensiones declaradas. Máscaras de infinito con bytes
  estrictos 0/1 y sumas consistentes con contadores/tamaños compactos. K privado
  descuenta los wires privados comprometidos y los wires de compromiso.
- Tags comprimidos en vectores; los compactos A/B/G2.B no aceptan tags de infinito.
  Ningún prefijo de la PK se pasa a un decoder ni determina una asignación de
  arrays de puntos. Usa buffers fijos de 64 KiB; no afirma un techo de heap/RSS.

En el modo por defecto, los puntos de vectores PK sólo se recorren por formato/tag: no se validan todas
las coordenadas, subgrupos o su canonicalidad. Un test confirma expresamente que
un punto con coordenada inválida pero tag correcto puede pasar con hash/pin
coherentes, conservando `allPkPointsValidated=false` y los demás límites de alcance.
Esto impide confundir framing con validación criptográfica.

El wrapper construye offline y ejecuta un worker con 4 GiB AS, 60 s CPU,
90 s wall, 1 MiB por archivo escrito y cores cero. GOMEMLIMIT=256MiB y dos
GOMAXPROCS son objetivos; no cuotas RSS/CPU. Los límites cubren el worker, no el
build previo. No es supervisor de producción ni sandbox para código no confiable.

## Alcance del resultado

`pk-structure-and-shared-parameters-verified`, con
`dimensionsMatchPinnedMetadata`, `sharedParametersMatchVk` y `vkPointsValidated`
en true. `allPkPointsValidated`, `circuitBindingVerified`, `fullKeyRelationVerified`,
`mpcTranscriptsVerified` y `productionApproved` permanecen false. No se devuelve
PK/VK utilizable. La correspondencia parcial puede detectar mezclas de claves,
pero no garantiza detectar dos claves distintas con los mismos parámetros
compartidos. No se verifica Solidity/runtime/red ni aprobación independiente.

Ambas PK finales locales pasaron:
[informes y contexto](../benchmarks/timelock-opening/pk-structure-check/README.md).
No se repitieron setup, inicialización, FFT, MPC, proving ni replay Game/H3.
La aprobación de procedencia, los participantes/cierre/beacon independientes y
la revisión de un importador final siguen pendientes. Producción sigue bloqueada.

## Validación nativa acotada de puntos

Para exports pequeños, añadir `--validate-points --max-points 65536`. La API Go
correspondiente es `CheckPKPoints`. No cambia el comportamiento por defecto.
Un presupuesto explícito positivo es obligatorio; el techo fijo es 65.536 puntos
PK, sin flags para ampliarlo. La cota conservadora cuenta tres vectores compactos
con hasta un punto por wire, Z, K privado, dos bases por compromiso y cinco
parámetros compartidos. Se comprueba antes de construir el lector PK o decodificar
la VK; el presupuesto no procede de longitudes aportadas por la propia PK.
Los puntos adicionales de la VK ya están limitados por su forma/64 KiB.

Dentro del mismo buffer que alimenta el hash, cada punto de vector pasa por el
decoder nativo con comprobación de curva/subgrupo y reencoding canónico idéntico.
No se acumulan vectores de puntos ni se devuelve una clave nativa. Los cinco
puntos de cabecera ya coinciden exactamente con los de la VK comprobada. Esto
valida los puntos/canonicalidad de la PK aceptada, además de su estructura.
Los metadatos del caller deben mantenerse inmutables durante la llamada.

Éxito: `pk-points-structure-and-shared-parameters-verified`, con
`allPkPointsValidated=true`. `circuitBindingVerified`, `fullKeyRelationVerified`,
`mpcTranscriptsVerified` y `productionApproved` siguen false. La validez de cada
punto no acredita las ecuaciones que los relacionan con el CS ni procedencia
segura. El presupuesto de puntos tampoco es una cuota de heap/RSS ni un SLA;
siguen vigentes los límites de worker y las limitaciones de la API aislada.

Se probó el modo nativo con exports pequeños cero/un compromiso, rechazo de
puntos G1/G2 inválidos y de infinito no canónico, y comprobaciones antes de leer.
Wrapper y pnpm pasaron con un fixture sintético de puntos válidos, sin relación
CS/clave certificada. Ambos exports existentes del juego se rechazaron por esta
cota antes del lector PK; no se validaron otra vez sus millones de puntos.
No ampliar el ensayo pequeño para el juego sin un presupuesto/supervisor revisado
por operación. [Evidencia y alcance](../benchmarks/timelock-opening/pk-point-validation/README.md).
