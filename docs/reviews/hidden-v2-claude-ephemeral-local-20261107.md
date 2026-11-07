# Revisión real: retirada de recuperación Anvil local

El propietario decidió que local debe ser efímero y pidió retirar la recuperación,
conservando el trabajo anterior y las evidencias. Después pidió priorizar lo
necesario para producción. Esto no autoriza despliegue ni operaciones criptográficas
excluidas, ni vuelve seguros los setups experimentales.

Claude CLI2.1.319 real, herramientas desactivadas, MCP vacío estricto y sin
persistencia. Consultas design, implementation y final; respuestas literales y metadata
adjuntas, prompts/JSON/stderr/inputs originales externos. Claude no ejecutó tests,
no inspeccionó archivos mediante herramientas y no representa auditoría independiente.

Se retiraron los módulos locales session/rpc y tres suites exclusivamente de
snapshots/gateway/restauración. Originales conservados en before-source.tar.gz y
cierres previos. No se modifican recovery/journals de productor o keeper, leases,
config de verificadores/binario, reglas, contratos o claves. Nueva receipts.ts
sólo escribe diagnóstico exclusivo y lee bindings; no autoriza restauración.

Stack y CLI sólo arrancan mundos nuevos en directorios externos nuevos. No hay
--resume, chain dump, checkpoint/.used, generaciones attempt, identidad de servicio
persistida, pins de restauración ni drain del pool para guardar. El cierre
administrado continúa incluso si fallan productor, keeper o escritura de recibos.
Los archivos de diagnóstico/build/cache permanecen, sin borrado automático.

Hallazgo confirmado de design: al retirar el gateway que reservaba el puerto,
un listener ajeno podía ocuparlo durante forge build. La ruta espera ahora la
línea exacta del listener en el log del propio Anvil antes de consultar RPC o
fondear. Línea contrastada en Anvil instalado. Prueba real de colisión posterior al
preflight: servidor ajeno devuelve chain31337, pero recibe cero peticiones y no
se crea deployment. No se cambia mnemonic ni cuentas de browser. Se conserva el
listener directo en localhost y se comprueba CORS con el smoke real.

También se corrigió la salida de cancelación durante startup: sin stack listo
sale1. La prueba real interrumpe forge build y registra cierre efímero; --resume
se rechaza antes de leer config. Cada mundo crea nuevas claves de servicio en
memoria, nueva Game y nuevo token. Nunca reutilizar journals con una cadena nueva.

Verificación propia final:75 tests/9 archivos (local-hidden, state-lease,
keeper-lease, producer-service, producer-worker), typecheck scripts, formato e
inventario. Los fallos iniciales eran fixtures heredados que aún escribían dump,
mock de config que ignoraba output, contador de deploy no reiniciado para otra
cadena y evaluación del abort.reason antes de ocurrir el aborto. Se corrigieron
y los logs fallidos se conservan; no se suman ejecuciones para nuevos conteos.

Aceptación real final-acceptance/result.json: keeper SIGKILL provoca cierre de la
sesión, reuse rechazado sin cambiar archivos, mundo nuevo con Game nueva, browser
registro/construcción/rutas/auth/canary, colisión de puerto y startup SIGINT sale1.
Cero solicitudes de certificados/proofs, sin MPC/FFT/setup/sealing ni replay/proving
del juego. Las fuentes ejecutadas se fijan en el resultado y coinciden con el
árbol final. Los PID del stack ya no existen. El ensayo previo acceptance/ se
conserva con su alcance anterior al endurecimiento del listener/cancelación.

Evidencias: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-ephemeral-local/.
Cierre reproducible: /home/rodrigo/.cache/vendetta-audit/hidden-v2-20261107-ephemeral-local-close/receipt.json.
La prioridad de producción queda en hidden-v2-production-readiness.md: política
real de confianza y procedencia, importación/aprobación y bindings, operación
persistente y candidato final. Los gates de setup.ts, Deploy.s.sol y
scripts/deploy-gnosis.sh permanecen intactos. La consulta sobre participantes
independientes no se interpreta respondida por transcurso de tiempo.

Implementation planteó fallo de forge ignorado sin haber visto processes.ts. Se
contrastó: el handler de close rechaza failure antes de resolver closed y check()
vuelve a lanzar el error almacenado. Un hijo Node real que escribe output y sale1
confirma rechazo de Promise.race y check; no se necesita cambiar producción. Se
añadieron regresiones CI para listener ausente/puerto distinto (cero llamadas RPC,
funding/deploy), y una CLI real con artefactos sintéticos que interrumpe un build
fixture, exige exit1 y verifica desaparición del PID. La cancelación usa abort.reason
tras ocurrir el aborto. Mejoras estilísticas sugeridas no se trataron como defectos:
el read-back de consumers es diagnóstico válido y el bloque léxico no restaura
estado. Se mantiene la importación dinámica tras scrub; tiempos de CLI medidos en
suite sin fallo. Guía ampliada para identificar listeners antes de existir stack.json.

Final no encontró bloqueadores de implementación y retiró la hipótesis de Forge.
Sus dos comprobaciones se contrastaron: la guía documenta bash scripts/dev-hidden-v2.sh
como entrada directa para señales; la aceptación real final invocó ese wrapper y
SIGINT durante build produjo exit1. pnpm queda sólo como alias con caveat explícito.
La sugerencia de ejecutar ci-local.sh y hacer commit no se sigue: el propietario
prohibió commits y ese script clona HEAD, omitiendo este árbol deliberadamente sin
commits/untracked. No sería verificación de estos cambios. Se fija el árbol real
completo, incluidos untracked, con bundle reproducible y hashes actuales, y se
conservan pruebas enfocadas justificadas sin atribuirles equivalencia a CI completo.
Los scripts de entrada y state-lease.ts se contrastan con el baseline y el archivo
final; no cambiaron. Los tres gates de producción siguen idénticos. La cobertura
fuera de esta retirada no se declara reejecutada. Endurecimientos opcionales de
tests no son bloqueadores nuevos ni motivos para reabrir recuperación descartada.
