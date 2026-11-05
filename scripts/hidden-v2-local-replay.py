#!/usr/bin/env python3
"""Wait for unsafe local MPC keys and replay the real producer on private Anvil.

This never creates production approval or modifies pre-existing setup directories.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import tarfile
import time


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(1 << 20):
            h.update(block)
    return h.hexdigest()


def document(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise ValueError(f'Invalid receipt: {path}')
    return json.loads(path.read_text())


def available_memory():
    for line in Path('/proc/meminfo').read_text().splitlines():
        values = line.split()
        if values[0] == 'MemAvailable:' and values[2] == 'kB':
            return int(values[1]) * 1024
    raise ValueError('Host memory observation unavailable')


def wait_for_headroom(emit, timeout=48*3600, interval=10):
    deadline = time.monotonic() + timeout
    consecutive = 0
    while True:
        available = available_memory()
        consecutive = consecutive + 1 if available >= 10 << 30 else 0
        if consecutive >= 3:
            return
        if time.monotonic() >= deadline:
            raise ValueError('Replay memory headroom wait deadline exceeded')
        emit('waiting-for-host-memory', availableBytes=available, requiredBytes=10 << 30,
             consecutivePassingSamples=consecutive, productionApproved=False)
        time.sleep(interval)


def check_sources(repository, bundle, bundle_pin):
    if digest(bundle) != bundle_pin:
        raise ValueError('Replay source bundle digest differs')
    with tarfile.open(bundle, 'r:gz') as archive:
        manifest = json.load(archive.extractfile('audit-manifest.json'))
    def selected(name):
        return ((name.startswith(('apps/', 'packages/', 'contracts/', 'scripts/'))
                 or name in ('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'))
                and not name.endswith('.md'))
    count = 0
    for name, record in manifest['files'].items():
        # Documentation/evidence may advance while the long computation runs.
        # Freeze all executable modern code/config, not historical status prose.
        if selected(name):
            if digest(repository / name) != record['sha256']:
                raise ValueError(f'Replay source changed: {name}')
            count += 1
    audit = runpy.run_path(str(repository / 'scripts/hidden-v2-audit-bundle.py'))
    observed = {name for name in audit['inventory'](repository) if selected(name)}
    expected = {name for name in manifest['files'] if selected(name)}
    if observed != expected:
        raise ValueError('Replay source inventory changed')
    if count < 100:
        raise ValueError('Replay source inventory is incomplete')
    return count


def check_keys(directory, kind, log2):
    receipt = document(directory / 'keys.json')
    if (receipt['schema'] != 'vendetta-unsafe-local-phase2-keys-1' or receipt['log2'] != log2
            or receipt['productionApproved'] or receipt['beaconAfterClosureProven'] or receipt['unsafeLocalSetup'] is not True):
        raise ValueError('Unsafe experimental key receipt differs')
    names = {'circuit.bin', 'proving.key', 'verifying.key', 'Verifier.sol', 'manifest.json'}
    if set(receipt['sha256']) != names:
        raise ValueError('Experimental key inventory differs')
    for name in names:
        if digest(directory / name) != receipt['sha256'][name]:
            raise ValueError(f'Experimental key digest differs: {name}')
    manifest = document(directory / 'manifest.json')
    if (manifest['kind'] != kind or manifest['profile'] != 'VENDETTA_OPENING_V2' or manifest['unsafeLocalSetup'] is not True
            or manifest['sha256'] != {name: receipt['sha256'][name] for name in names - {'manifest.json'}}):
        raise ValueError('Experimental producer manifest differs')
    expected_cs = {'invalid-point': '89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898',
                   'opening': '06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f'}[kind]
    if manifest['sha256']['circuit.bin'] != expected_cs:
        raise ValueError('Experimental circuit identity differs')
    return digest(directory / 'manifest.json')


def last_event(path):
    # Ignore an incomplete trailing line while a writer is flushing its event.
    with path.open('rb') as stream:
        stream.seek(max(0, path.stat().st_size - 65536))
        lines = stream.read(65536).splitlines(keepends=True)
    for line in reversed(lines):
        if line.endswith(b'\n'):
            try:
                return json.loads(line)
            except (ValueError, UnicodeError):
                continue
    return {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('sequence', 'directory', 'repository', 'source-bundle', 'producer', 'forge', 'solc'):
        parser.add_argument('--' + name, required=True, type=Path)
    for name in ('source-bundle-sha256', 'producer-sha256', 'forge-sha256', 'solc-sha256', 'anvil-sha256'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--unsafe-test-only', required=True, action='store_true')
    args = parser.parse_args()
    if not args.directory.is_absolute() or args.directory.exists() or args.directory.is_symlink():
        raise ValueError('New absolute replay directory required')
    parent = args.directory.parent.resolve(strict=True)
    if any((p / '.git').exists() for p in (parent, *parent.parents)):
        raise ValueError('Replay state must be outside Git')
    args.directory.mkdir(mode=0o700)
    with (args.directory / 'replay.jsonl').open('x') as events:
        def emit(event, **fields):
            events.write(json.dumps(dict(event=event, at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **fields)) + '\n')
            events.flush()
            os.fsync(events.fileno())
        try:
            emit('waiting-for-local-mpc', sequence=str(args.sequence), productionApproved=False)
            deadline = time.monotonic() + 48 * 3600
            while True:
                event = last_event(args.sequence / 'sequence.jsonl')
                if event.get('event') == 'sequence-stopped':
                    raise ValueError('MPC sequence stopped; replay will not use partial keys')
                if event.get('event') == 'sequence-complete':
                    break
                if time.monotonic() > deadline:
                    raise ValueError('MPC sequence wait deadline exceeded')
                time.sleep(10)
            source_count = check_sources(args.repository, args.source_bundle, args.source_bundle_sha256)
            for path, pin in ((args.producer, args.producer_sha256), (args.forge, args.forge_sha256),
                              (args.solc, args.solc_sha256), (args.forge.parent / 'anvil', args.anvil_sha256)):
                if digest(path) != pin:
                    raise ValueError(f'Replay tool changed: {path}')
            keys = args.directory / 'keys'
            keys.mkdir(mode=0o700)
            manifests = {}
            for kind, log2 in (('invalid-point', 22), ('opening', 23)):
                public = args.sequence / f'{log2}-phase2-keys' / 'public'
                manifests[kind] = check_keys(public, kind, log2)
                (keys / kind).symlink_to(public, target_is_directory=True)
            wait_for_headroom(emit)
            # The wait may be long: revalidate executable sources and tool pins.
            source_count = check_sources(args.repository, args.source_bundle, args.source_bundle_sha256)
            for path, pin in ((args.producer, args.producer_sha256), (args.forge, args.forge_sha256),
                              (args.solc, args.solc_sha256), (args.forge.parent / 'anvil', args.anvil_sha256)):
                if digest(path) != pin:
                    raise ValueError(f'Replay tool changed during memory wait: {path}')
            for kind, log2 in (('invalid-point', 22), ('opening', 23)):
                if check_keys(args.sequence / f'{log2}-phase2-keys' / 'public', kind, log2) != manifests[kind]:
                    raise ValueError('Replay keys changed during memory wait')
            env = dict(os.environ, HIDDEN_PROVER_KEYS=str(keys), HIDDEN_PROVER_BIN=str(args.producer),
                       HIDDEN_PROVER_EVIDENCE_DIR=str(args.directory / 'evidence'), FORGE_BIN=str(args.forge),
                       SOLC_BIN=str(args.solc), PROVER_THREADS='4', PROVER_MEMORY='5GiB', GOGC='25')
            command = ['prlimit', '--as=15032385536', '--cpu=10800', '--fsize=2147483648', '--core=0', '--',
                       'pnpm', '--filter', '@vendetta/web', 'prover:replay', '--worker-replay']
            emit('replay-start', command=command, sourceFilesChecked=source_count, manifests=manifests,
                 addressSpaceBytes=14 << 30, cpuSeconds=10800, wallSeconds=7200,
                 goMemoryTargetBytes=5 << 30, goGCPercent=25, threads=4,
                 requiredHostAvailableBytes=10 << 30, hostPressureFloorBytes=4 << 30,
                 productionApproved=False)
            with (args.directory / 'run.txt').open('xb') as output:
                child = subprocess.Popen(command, cwd=args.repository, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
                started = time.monotonic()
                try:
                    while True:
                        try:
                            code = child.wait(timeout=0.25)
                            break
                        except subprocess.TimeoutExpired:
                            if available_memory() < 4 << 30:
                                raise ValueError('Replay stopped under host memory pressure')
                            if time.monotonic() - started > 7200:
                                raise ValueError('Replay wall deadline exceeded')
                    if code:
                        raise subprocess.CalledProcessError(code, command)
                except BaseException:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    child.wait()
                    raise
            result = document(args.directory / 'evidence' / 'results.json')
            worker_result = document(args.directory / 'evidence' / 'worker-results.json')
            if (result['unsafeLocalSetup'] is not True or result['realNetworkDeployment'] is not False
                    or result['proofsGenerated'] != 3 or result['punctualAndDelayedFullWorldEqual'] is not True
                    or worker_result['resources']['peakNativeProcesses'] != 1):
                raise ValueError('Replay did not establish the expected local result')
            emit('replay-complete', resultSha256=digest(args.directory / 'evidence' / 'results.json'),
                 workerResultSha256=digest(args.directory / 'evidence' / 'worker-results.json'), productionApproved=False)
        except BaseException as error:
            emit('replay-stopped', error=str(error), productionApproved=False)
            raise


if __name__ == '__main__':
    main()
