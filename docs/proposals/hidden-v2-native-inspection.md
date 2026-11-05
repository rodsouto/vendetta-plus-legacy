# Inspección de formato nativo antes de importar transcripts

Implementación del 3 de noviembre de 2026. `mpcinspect` y la CLI independiente
`inspect:mpc-hidden-v2` comprueban en streaming la gramática comprimida del
backend BN254 fijado, sin invocar ReadFrom, asignar arrays de puntos ni ejecutar
MPC. Es un requisito previo del futuro importador, no una implementación de éste.
No cambia el ensayo pequeño, el productor ni las barreras de despliegue.

Continuación posterior: el paquete incorpora [lectura nativa protegida](hidden-v2-guarded-native-import.md)
y el ensayo pequeño ya la utiliza. La CLI independiente de este documento
conserva su alcance de formato/hash y no invoca esa decodificación.

```bash
export VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go
pnpm inspect:mpc-hidden-v2 \
  --shape /ruta/shape.json --shape-sha256 <pin-externo> \
  --transcript /ruta/contribution.bin --transcript-sha256 <pin-externo> \
  --max-bytes 65536
```

El wrapper compila offline con GOPROXY=off, -mod=readonly, -trimpath y
-buildvcs=false; no descarga dependencias. Respeta rutas relativas del llamador,
también mediante pnpm/INIT_CWD, y flags con uno/dos guiones o `=valor`.
La CLI emite un JSON sólo tras terminar correctamente; errores salen con código
distinto de cero. Nunca escribe claves ni modifica sus entradas.

## Política dimensional fijada externamente

Shape es un JSON de seis campos obligatorios, sin desconocidos, duplicados,
aliases, null ni datos sobrantes. Se reutiliza el parser estricto con límites
de 64 KiB y profundidad 16 de `ceremony`.

```json
{
  "schema": "vendetta-hidden-v2-native-shape-1",
  "circuitSha256": "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898",
  "phase": 2,
  "domain": 4194304,
  "private": 3338949,
  "privateCommitted": [2243213]
}
```

`private` es la longitud PKK, no el número de inputs secretos. En fase 2 se
deriva como internas+secretas−totalPrivadasComprometidas−númeroCompromisos. Los
elementos de privateCommitted son las longitudes SigmaCKK en orden. Z tiene
longitud dominio−1. Fase 1 exige private=0 y privateCommitted=[].

El hash de CS aquí es **declarado**: el inspector no lee ese CS ni acredita su
procedencia. La organización debe fijar la política desde un CS autenticado,
comprobar su revisión y distribuir sus pins por un canal independiente. Obtener
shape o su pin del propio transcript no autentica las dimensiones.

Los límites absolutos son dominio potencia de dos entre 2 y 2²³, hasta 255
compromisos, hasta 2²⁵ elementos privados y hasta 2²⁵ elementos comprometidos
sumados. Se validan antes de calcular tamaños o leer el transcript, evitando
overflow de uint64 y conversiones de longitudes maliciosas a asignaciones.
Son límites del formato inspeccionado, no permiso para ejecutar esos dominios.

## Lectura y alcance de la comprobación

El máximo por defecto es 64 KiB; el llamador debe fijar un presupuesto mayor
para un archivo grande. Nunca supera 2 GiB. Se rechaza una shape que excede ese
presupuesto antes de leer bytes nativos. Se abren archivos regulares con
O_NONBLOCK/O_NOFOLLOW; se rechazan FIFO sin bloquear, directorios y symlinks finales.
El tamaño del archivo debe coincidir exactamente con el calculado para la shape.

El scanner usa un buffer fijo de 64 KiB y lee como máximo tamañoEsperado+1 bytes.
Comprueba dominio, cantidades de vectores/compromisos, tags comprimidos,
challenge corto de exactamente 32 bytes, EOF y SHA-256 de los bytes originales.
Cada punto se consume en 32/64 bytes; no se asignan vectores a partir de prefijos.
Los bytes comprimidos no se conservan en otro buffer completo. El runtime Go,
la política JSON y el hashing consumen recursos adicionales; 64 KiB no es una
afirmación sobre RSS total. No se aplica aquí un timeout o cuota kernel de CPU:
una futura importación grande debe usar además su supervisor de recursos/I/O.

Con N=dominio, P=longitud PKK, C=suma SigmaCKK y K=número compromisos, el tamaño
wire de una contribución es 192N+265 en fase 1 y 203+32(P+N+C)+164K en fase 2.
Las fórmulas y el orden se contrastan con serializaciones nativas pequeñas de
ambas fases, con cero, uno y dos compromisos. La fuente fijada de gramática es
gnark v0.16.4, backend/groth16/bn254/mpcsetup/marshal.go.

El éxito se llama `status: framing-only` y conserva en false:
pointsValidated, circuitBytesVerified, mpcTranscriptVerified,
artifactBytesVerified y productionApproved. Un test explícito presenta un punto
comprimido inválido para el decoder nativo: pasa esta inspección de formato,
conservando esas limitaciones. Tampoco se verifican firmas de participantes,
desafíos, cadena de contribuciones, cierre/beacon, ni claves finales.

El importador futuro deberá autenticar CS, identidades/cierres/beacons; aplicar
presupuestos; validar puntos/subgrupos y serialización canónica; verificar MPC y
extraer artefactos reproduciblemente desde bytes autenticados. No puede leer
después un archivo mutable distinto y asumir que una inspección anterior lo
autoriza. La política/aprobación de producción debe seguir separada.

[Evidencias y límites medidos](../benchmarks/timelock-opening/native-inspection/README.md).
Las shapes del juego allí se derivan del informe de reproducción anterior;
no se leyó ningún transcript real de esos dominios ni se midió MPC completo.
