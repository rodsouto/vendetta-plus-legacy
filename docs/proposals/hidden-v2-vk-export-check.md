# Comprobación nativa VK → Solidity

`pnpm check:vk-export-hidden-v2` comprueba una relación concreta de los exports
existentes: que la VK comprimida, fijada externamente por SHA-256, reproduce los
bytes exactos de `Verifier.sol` con el exportador de gnark fijado en go.mod.
No escribe una nueva VK ni Verifier.sol; la exportación va directamente a un hash.
No ejecuta setup, MPC, proving ni compilación Solidity/EVM.

```bash
VENDETTA_GO_BIN=/home/rodrigo/.cache/vendetta-tools/go/bin/go \
  pnpm check:vk-export-hidden-v2 \
  --vk /ruta/verifying.key --vk-sha256 <pin-externo-vk> \
  --solidity /ruta/Verifier.sol --solidity-sha256 <pin-externo-solidity> \
  --public-inputs 55
```

Usar 55 inputs para opening y 2 para invalid-point, excluyendo wires de compromiso
y constante. Los pins se obtienen del manifest fijado previamente por un canal
confiable; calcularlos sobre un archivo sustituto no autentica su procedencia.
El [inventario offline](hidden-v2-artifact-inventory.md) comprueba antes los
manifests/recibos y el resto de los cuerpos. Las dos herramientas son independientes:
esta CLI no declara haber verificado el manifest ni el CS del caller.

## Lectura y límites

La CLI sólo lee archivos regulares no vacíos sin symlinks finales, con aperturas
no bloqueantes: VK <=64 KiB, fuente Solidity <=1 MiB. Copia bytes dentro de esos
límites y comprueba sus hashes antes de deserializar. El parser de formato recorre
la copia privada e inspecciona todas las longitudes antes del `ReadFrom` nativo:
vector K, tabla de inputs comprometidos, filas/índices y claves Pedersen. Comprueba
formato comprimido, consumo exacto, entre 0 y 256 inputs y cero/un compromiso.
Los índices sólo pueden referirse a inputs previos y deben estar ordenados, sin
repeticiones. No llama al decoder sobre un archivo reabierto tras preflight.
El caller de la API Go no debe mutar los slices concurrentemente durante su copia.

El decoder nativo valida puntos/subgrupos y precomputa la VK. Se exige después
reserialización canónica idéntica por hash/tamaño. La exportación Solidity por
defecto también está acotada a 1 MiB y debe coincidir en tamaño/hash con la fuente
fijada. Se rechaza más de un compromiso porque el exportador Solidity fijado lo
marca como no soportado, aunque pueda emitir texto tras una advertencia.
La validez de puntos no demuestra seguridad/no degeneración de las claves.

El wrapper construye offline (`GOPROXY=off`, toolchain local, módulos readonly,
trimpath, sin buildvcs) y ejecuta un worker: 4 GiB AS, 20 s CPU, 30 s wall,
1 MiB por archivo escrito y cores deshabilitados. GOMEMLIMIT=256MiB y dos
GOMAXPROCS son objetivos del runtime, no cuotas RSS/CPU. Esos límites cubren el
worker de inspección, no el build previo. No es supervisor del servicio ni sandbox
para código no confiable. La API Go aislada no aplica límites kernel.

## Alcance del éxito

Resultado `vk-solidity-export-verified`, con `vkPointsValidated`, `vkCanonical`
y `solidityExportMatches` en true. No devuelve un objeto VK reutilizable.
`circuitBindingVerified`, `provingKeyRelationVerified`, `mpcTranscriptsVerified`,
`independentApprovalVerified` y `productionApproved` permanecen false. Una VK
válida y su fuente coincidente no acreditan su relación con un CS/PK o un setup
seguro. No se verifica compilador, runtime, wrapper consumidor ni dirección/red.
Ante error, salida no cero sin JSON de éxito.

## Validación local completada

Ambas VK finales existentes pasaron; no se modificaron las claves ni la evidencia
del replay. [Informes y pins](../benchmarks/timelock-opening/vk-export-check/README.md).
Tests con claves efímeras de circuitos pequeños cubren cero/un compromiso y
rechazo de dos, sustitución de VK/fuente/pin/input, headers maliciosos, índices,
puntos inválidos, todos los truncados, EOF y presupuestos. La CLI cubre archivos
especiales/vacíos y fallos sin resultado. Se probó wrapper real y pnpm, así como
rutas relativas con flags separados y `=`. No se regeneraron claves del juego.
