# Lectura nativa protegida y dimensiones ligadas al CS

Continuación del 3 de noviembre de 2026. La [inspección de formato](hidden-v2-native-inspection.md)
se amplió con una API reutilizable y se conectó al ensayo MPC pequeño entre
procesos. La CLI inspect:mpc-hidden-v2 conserva su alcance framing-only.
La entrada protegida no constituye aprobación de claves ni habilita producción.

## Ruta ejecutable

1. `ShapeFromCS` recibe un R1CS BN254 ya compilado y el digest esperado del CS.
   Calcula SHA-256 por streaming sobre WriteTo y deriva dominio/PKK/compromisos
   desde ese objeto. Devuelve error sin shape utilizable ante un digest distinto.
   No deserializa un CS aportado por un solicitante. El origen/autorización del
   pin pertenece a la política del llamador; la función no autentica revisores.
2. `NewGuard` valida shape, pin y presupuesto wire antes de leer. Consume la
   gramática con buffer fijo de 64 KiB y tokens de hasta 64 bytes. No entrega al
   consumidor nativo un dominio, cantidad o longitud antes de comprobarla contra
   la shape. Leer anticipadamente al buffer no entrega esos bytes a ReadFrom.
3. `Decode` conecta el decoder nativo al guard. Valida puntos/subgrupos con las
   opciones por defecto del backend fijado. Exige contador de bytes completo,
   EOF y digest original; reserializa canónicamente directamente a SHA-256 y
   exige el mismo tamaño y hash. No reabre el archivo tras una inspección previa.
4. El protocolo mpcrehearsal usa esta ruta después de autenticar cada contribución.
   Sus shapes se derivan del CS fijo compilado y vinculado al config pin.
   Después verifica cadenas MPC, cierres/beacons archivados, extracción idéntica
   desde objetos frescos, prueba Groth16 nueva y rechazo de input sustituido.

La API devuelve puntos/canonicalidad verificados, pero conserva en false
mpcTranscriptVerified, circuitBytesVerified, artifactBytesVerified y
productionApproved: esa llamada aislada no autentica CS ni comprueba una cadena
MPC. El llamador que utilizó ShapeFromCS mantiene por separado ese vínculo.
El informe del ensayo registra guardedNativeDecoding=true y las verificaciones
de protocolo efectivamente ejecutadas, con sus límites de confianza intactos.

## Recursos y fronteras

Decode exige límites wire y de payload de puntos. El payload se calcula con los
tamaños reales de G1/G2 del backend y es sólo un subtotal estructural: no incluye
refs, objetos de proofs, runtime/GC ni temporales de serialización. No es un techo
de heap o RSS. Un llamador de la API debe aplicar además límites kernel/tiempo.
Los dominios del juego se rechazan antes de leer con el presupuesto pequeño.

La integración ejecutada mantiene circuito fijo de cinco restricciones/dominio
8, wire <=32 KiB y payload <=1 MiB. Cada worker del supervisor existente tiene
4 GiB de espacio virtual, 20 s CPU, 30 s wall, 64 KiB por archivo y cores cero.
Se espera cada salida y se mata el grupo en timeout; Pdeathsig termina al perder
el padre. No se ampliaron esos límites ni se ejecutó MPC de dominios del juego.

El guard resuelve la frontera de longitudes que puede cambiar entre preflight y
lectura nativa. No convierte un hash o shape elegidos por un atacante en una
política autorizada. Un punto válido tampoco demuestra una contribución MPC
correcta; una cadena correcta no prueba independencia de participantes ni
publicación del cierre anterior a un beacon impredecible.

## Evidencia y pendiente real

Actualización del 4 de noviembre: [el probe local](../benchmarks/timelock-opening/local-domain-probe/README.md)
demostró inicialización/hash de dominios 2²²/2²³ en esta PC, bajo límites. Se
continuará por operaciones locales con presupuestos revisados; reservar 64 GiB
dejó de tratarse como un requisito para iniciar esas mediciones.

[Ensayo final y pruebas](../benchmarks/timelock-opening/guarded-native-import/README.md).
Incluyen prefijos hostiles que nunca llegan al decoder, rechazo bajo límites
kernel en otro proceso, puntos inválidos, truncado/sobrantes, pins, CS incorrecto,
lectura byte a byte, consumo incompleto y una prueba MPC/Groth16 completa pequeña.
Se compara además la gramática del guard con la inspección previa mediante fuzz.

Para probar la misma ruta a escala del juego faltan transcripts reales de ambas
fases y presupuestos/supervisión por operación. La PC actual ya permite empezar
esas mediciones por etapas; otra máquina se evaluará si se supera el presupuesto
local. La ceremonia independiente,
autenticación del cierre/beacon futuro, aprobación externa de artefactos finales
y auditoría siguen abiertas. El productor continúa rechazando setups declarados
seguros y los despliegues reales siguen bloqueados.
