from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

base = Path('/home/rodrigo/.cache/vendetta-audit')
repo = Path('/home/rodrigo/orca-projects/vendetta-plus-legacy')
sessions = {label: base / name for label, name in {
    'u-cases': 'hidden-v2-negative-real-clock100-20261111-run3',
    'opening-cases': 'hidden-v2-negative-real-clock100-20261111-run5',
}.items()}
assert all(json.loads((p / 'session/closed.json').read_text())['cleanupErrors'] == 0 for p in sessions.values())
out = base / 'hidden-v2-negative-accepted-20261111'
out.mkdir(mode=0o700)
public_files = []
case_results = {}
secrets = []
proof_count = 0
for label, source in sessions.items():
    target = out / label
    target.mkdir()
    clients = json.loads((source / 'session/producer-clients.json').read_text())
    secrets.extend(c['token'].encode() for c in clients)
    stack = json.loads((source / 'session/stack.json').read_text())
    for result in json.loads((source / 'results.json').read_text()):
        if result['status'] == 'PASS':
            assert result['name'] not in case_results
            context = source / (result['name'] + '-context.json')
            metadata = json.loads(context.read_text()) if context.exists() else {}
            case_results[result['name']] = dict(result, session=label, game=stack['deployment']['game'], statement=metadata.get('statement'), arrival=metadata.get('arrival'), seq=metadata.get('seq'))
    for path in source.iterdir():
        if path.is_file() and path.suffix in {'.json', '.png'} and path.name != 'hashes.json':
            shutil.copyfile(path, target / path.name)
    for name in ['stack.json', 'closed.json', 'consumers.json', 'deployment.json']:
        shutil.copyfile(source / 'session' / name, target / ('session-' + name))
    shutil.copyfile(Path(str(source) + '.console.log'), target / 'console.log')
    proof_dir = target / 'proofs'
    proof_dir.mkdir()
    for artifact in (source / 'session/cache').glob('*.proof.json'):
        value = json.loads(artifact.read_text())
        public = {key: value[key] for key in ['kind', 'statement', 'proof', 'publicInputs', 'setupManifestSha256', 'elapsedMs', 'artifactsReused', 'profileMs'] if key in value}
        (proof_dir / artifact.name).write_text(json.dumps(public, indent=2) + '\n')
        proof_count += 1
assert len(case_results) == 20 and proof_count == 16
(out / 'results.json').write_text(json.dumps(list(case_results.values()), indent=2) + '\n')
attempt_dir = out / 'previous-attempts'
attempt_dir.mkdir()
for name in ['hidden-v2-negative-real-20261111-run1', 'hidden-v2-negative-real-clock100-20261111-run2', 'hidden-v2-negative-real-clock100-20261111-run4']:
    source = base / name
    target = attempt_dir / name
    target.mkdir()
    for file in ['error.json', 'results.json', 'source.json', 'harness-log.json']:
        if (source / file).exists(): shutil.copyfile(source / file, target / file)
    shutil.copyfile(source / 'session/closed.json', target / 'closed.json')
prep = base / 'hidden-v2-negative-preparation-20261111'
checks = out / 'checks'
checks.mkdir()
for file in ['checks.json', 'keeper-reorg.log', 'storage-layout.log', 'crypto-console-tail.log', 'offline-tests.log']:
    shutil.copyfile(prep / file, checks / file)
for file in ['hidden-v2-negative-transport-tests-20261111.log', 'hidden-v2-negative-all-scripts-typecheck-final.log']:
    shutil.copyfile(base / file, checks / file)
shutil.copyfile(repo / 'docs/hidden-v2-negative-acceptance.md', out / 'harness-guide.md')
source_names = ['apps/web/scripts/experiments/run-negative-v2.ts', 'apps/web/scripts/experiments/negative-v2-cases.ts', 'apps/web/scripts/experiments/producer-benchmark-http.ts', 'apps/web/scripts/experiments/observe-negative-v2.ts', 'apps/web/scripts/experiments/capture-negative-v2-chain.ts', 'apps/web/scripts/local-hidden/acceptance-clock.ts', 'apps/web/scripts/local-hidden/stack.ts', 'scripts/verify-hidden-v2-negative-evidence.py', 'scripts/watch-hidden-v2-negative-evidence.py']
(out / 'source-hashes.json').write_text(json.dumps({name: hashlib.sha256((repo / name).read_bytes()).hexdigest() for name in source_names}, indent=2) + '\n')
lines = ['# Aceptación negativa hidden v2', '', '**20/20 PASS; 16 pruebas nuevas completas.**', '', 'Candidato: `104f0310cae165fc0eddc7e16e4780d6818426aa`. Dos mundos efímeros independientes, cada uno con carpeta, Game, caché y journals nuevos. Las cinco pruebas completas de U no se regeneraron después del fallo HTTP. No se comparan Worlds ni se reutilizan pruebas entre cadenas.', '', 'Alcance autorizado: copia temporal de contratos con construcciones, investigación, entrenamiento y viajes 100 veces más rápidos, mínimo un segundo. Anvil avanzó en tiempo real, sin warp; las aperturas usaron drand auténtico de rondas futuras. La espera por pruebas no se aceleró. Los archivos Solidity de producción del checkout, el binario original, CS/PK/VK, MPC y verificadores finales permanecen intactos.', '', '| Caso | Resultado | Sesión |', '| --- | --- | --- |']
lines += [f"| {name} | {result['status']} | {result['session']} |" for name, result in case_results.items()]
lines += ['', 'Los 14 negativos certificables registraron exactamente un HiddenEvidenceRecorded(valid=false), conservaron arrival/seq originales, consumieron una sola vez y completaron retorno sin doble crédito. Los dos controles positivos registraron valid=true. La prueba manipulada de cada misión revirtió con PENDING intacto. Los cuatro casos recuperables conservaron el World completo y PENDING, devolvieron HTTP 503 y completaron el recorrido tras la petición sana. La indisponibilidad del productor se inyectó en el transporte HTTP: no es evidencia de un crash/reinicio de worker o keeper.', '', 'Cada World final coincide por completo con el oráculo puntual TS. Para los 11 certificados de apertura se verificaron también estados H3 aceptados, primer candidato aceptado y escalar contra SHA-256 de todos los candidatos anteriores. No se afirma exhaustión SHA real ni scalar cero en una nueva prueba del juego; esas fronteras conservan el alcance de las regresiones/fixtures previas.', '', 'Todos los envíos fueron del harness. Chromium sólo observó; las capturas identificadas por caso bloquearon cualquier RPC de escritura y cualquier solicitud al productor. Esto no es aceptación de envío desde navegador ni del keeper.', '', 'Intentos anteriores conservados: (1) sesión sin aceleración cerrada durante construcción, sin pruebas; (2) error al compilar un script de despliegue de tests no requerido, antes de iniciar cadena; (3) tras cinco PASS de U, petición de apertura falló exactamente a los 300 segundos por el transporte fetch; (4) consulta de beacon falló antes de llegar a la inyección y se detuvo sin generar prueba. Ninguno de esos errores fue INVALID. Se corrigió el transporte del harness y se reintentaron sólo casos pendientes en otra cadena. La sesión de apertura aceptada terminó sin errores.', '', 'Checks: criptografía PASS (375,067 s), diferencial estático de 672 casos, 25 tests Forge PASS, 28 tests offline actuales PASS y typecheck PASS. Se conserva FAIL preexistente de keeper-reorg por la aserción Keeper transaction reverted, sin arreglarlo. Storage-layout pasó con los artefactos de este checkout; el fallo CoreStateLayout reportado por Amp queda documentado y no fue reparado.', '', 'Limitaciones explícitas: aceptación de la copia local con duración ×1/100; la matriz con fórmulas temporales originales quedó NO EJECUTADO. Es setup local inseguro, sin autorización de producción. No hubo push ni despliegue en red real. Los directorios privados de sesiones, credenciales, journals, claves y artefactos de setup están excluidos del ZIP. Los archivos de consola criptográfica de preparación son parciales, junto con su resumen; no se fabricó un log completo.', '', 'Las dos sesiones de evidencia aceptada cerraron con cleanupErrors=0. `results.json` fija el Game/statement/arrival/seq por caso y `hashes.json` fija todos los archivos de este paquete.']
(out / 'INFORME.md').write_text('\n'.join(lines) + '\n')
# No secret from private session configuration or the known development signer may enter the archive.
text = (repo / 'apps/web/scripts/experiments/run-negative-v2.ts').read_text()
secrets += [match.encode() for match in re.findall(r'privateKeyToAccount\(\s*"(0x[a-f0-9]{64})"', text)]
secrets += [value[2:] for value in secrets if value.startswith(b'0x')]
files = [p for p in out.rglob('*') if p.is_file()]
for file in files:
    data = file.read_bytes()
    assert not any(secret and secret in data for secret in secrets), 'Secret scan failed: ' + str(file.relative_to(out))
hashes = {str(file.relative_to(out)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(files)}
(out / 'hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')
with zipfile.ZipFile(out / 'evidence.zip', 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(out.rglob('*')):
        if file.is_file() and file.name != 'evidence.zip': archive.write(file, file.relative_to(out))
with zipfile.ZipFile(out / 'evidence.zip') as archive:
    assert archive.testzip() is None
    for name, expected in hashes.items(): assert hashlib.sha256(archive.read(name)).hexdigest() == expected
print(json.dumps({'directory': str(out), 'cases': len(case_results), 'newProofs': proof_count, 'zipBytes': (out/'evidence.zip').stat().st_size, 'zipSha256': hashlib.sha256((out/'evidence.zip').read_bytes()).hexdigest()}))
