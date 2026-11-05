#!/usr/bin/env python3
"""Run unsafe local MPC stages serially with pinned tools and new output directories.

No production ceremony, external communications, existing setup replacement or deployment.
Each Go supervisor owns resource limits and persisted success/failure reports.
"""
import argparse
import hashlib
import json
import os
import signal
from pathlib import Path
import stat
import subprocess
import time


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(1 << 20):
            h.update(block)
    return h.hexdigest()


def read_json(path):
    if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > 65536:
        raise ValueError(f'Invalid receipt: {path}')
    return json.loads(path.read_text())


def external_new(path):
    if not path.is_absolute() or path.exists() or path.is_symlink():
        raise ValueError('New absolute output directory required')
    parent = path.parent.resolve(strict=True)
    if any((p / '.git').exists() for p in (parent, *parent.parents)):
        raise ValueError('Output directory must be outside Git')


def success(path, status, log2):
    report = read_json(path / 'report.json')
    if report['status'] != status or report['log2'] != log2 or not report['exited'] or report['productionApproved']:
        raise ValueError(f'Worker did not complete successfully: {path}')
    return path / 'public'


def available_memory():
    for line in Path('/proc/meminfo').read_text().splitlines():
        fields = line.split()
        if fields[0] == 'MemAvailable:' and fields[2] == 'kB':
            return int(fields[1]) * 1024
    raise ValueError('Host memory observation unavailable')


def wait_for_headroom(required, emit, timeout=48*3600, interval=10):
    deadline = time.monotonic() + timeout
    consecutive = 0
    while True:
        available = available_memory()
        consecutive = consecutive + 1 if available >= required else 0
        if consecutive >= 3:
            return
        if time.monotonic() >= deadline:
            raise ValueError('Host memory headroom wait deadline exceeded')
        emit('waiting-for-host-memory', availableBytes=available, requiredBytes=required,
             consecutivePassingSamples=consecutive, productionApproved=False)
        time.sleep(interval)


def execute(binary, pin, directory, operation, log2, emit, wait_memory=False, **flags):
    if wait_memory:
        required = {'phase2-init': (10 << 30) if flags.get('staged_initialization') else (29 << 29),
                    'phase2-contribute': 10 << 30, 'phase2-verify': 10 << 30,
                    'phase2-seal': 10 << 30, 'verify': 29 << 29}.get(operation, 12 << 30)
        wait_for_headroom(required, emit)

    if digest(binary) != pin:
        raise ValueError('Pipeline executable changed')
    command = [str(binary), operation, '--directory', str(directory), '--log2', str(log2), '--unsafe-test-only']
    for name, value in flags.items():
        if isinstance(value, bool):
            if value:
                command.append('--' + name.replace('_', '-'))
        elif value != '':
            command.extend(['--' + name.replace('_', '-'), str(value)])
    emit('start', operation=operation, log2=log2, directory=str(directory), command=command)
    with (directory.parent / (directory.name + '.stdout.jsonl')).open('xb') as output:
        child = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait()
            if code:
                raise subprocess.CalledProcessError(code, command)
        except BaseException:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            raise
        output.flush()
        os.fsync(output.fileno())
    expected = {'contribute': 'contribution-complete', 'continue': 'contribution-complete',
                'verify': 'verification-complete', 'seal': 'phase1-sealed',
                'phase2-init': 'phase2-initialized', 'phase2-contribute': 'phase2-contribute-complete',
                'phase2-verify': 'phase2-verify-complete', 'phase2-seal': 'phase2-sealed'}[operation]
    public = success(directory, expected, log2)
    emit('complete', operation=operation, log2=log2, directory=str(directory), reportSha256=digest(directory / 'report.json'))
    return public


def domain(binary, pin, directory, log2, cs, cs_pin, emit, resume=None, resume_commons=None, staged=False, resume_cache=None, wait_memory=False, resume_initialization=None):
    def run(label, operation, **flags):
        return execute(binary, pin, directory / f'{log2}-{label}', operation, log2, emit, wait_memory=wait_memory, **flags)
    if resume_commons:
        commons_stage, commons_pin = resume_commons
        commons = success(commons_stage, 'phase1-sealed', log2)
        if digest(commons / 'commons.json') != commons_pin:
            raise ValueError('Reused commons metadata digest differs')
        metadata = read_json(commons / 'commons.json')
        if (metadata['schema'] != 'vendetta-unsafe-local-commons-1' or metadata['log2'] != log2
                or metadata['productionApproved'] or metadata['beaconAfterClosureProven']):
            raise ValueError('Reused commons context differs')
        if digest(commons / 'commons.bin') != metadata['sha256']:
            raise ValueError('Reused commons body differs')
        emit('phase1-reused', log2=log2, commons=str(commons), commonsMetadataSha256=commons_pin, productionApproved=False)
    else:
        if resume:
            first, verified, second = resume
            first = success(first, 'contribution-complete', log2)
            verified = success(verified, 'verification-complete', log2)
            second = success(second, 'contribution-complete', log2)
        else:
            first = run('first', 'contribute')
            verified = run('verify1', 'verify', input=first, input_sha256=digest(first / 'artifact.json'))
            verification = verified / 'verification.json'
            second = run('second', 'continue', input=first, input_sha256=digest(first / 'artifact.json'),
                         previous_verification=verification, previous_verification_sha256=digest(verification))
        verification = verified / 'verification.json'
        verified2 = run('verify2', 'verify', input=second, input_sha256=digest(second / 'artifact.json'),
                        previous_verification=verification, previous_verification_sha256=digest(verification))
        verification2 = verified2 / 'verification.json'
        commons = run('seal', 'seal', input=second, input_sha256=digest(second / 'artifact.json'),
                      previous_verification=verification2, previous_verification_sha256=digest(verification2))
    if resume_initialization:
        init_stage, init_pin = resume_initialization
        initialized = success(init_stage, 'phase2-initialized', log2)
        if digest(initialized / 'phase2-init.json') != init_pin:
            raise ValueError('Reused initialization metadata digest differs')
        metadata = read_json(initialized / 'phase2-init.json')
        if (metadata['schema'] != 'vendetta-unsafe-local-phase2-init-1' or metadata['log2'] != log2
                or metadata['productionApproved'] or metadata['csHash'] != cs_pin
                or metadata['commonsArtifactHash'] != digest(commons / 'commons.json')
                or metadata['commonsHash'] != read_json(commons / 'commons.json')['sha256']):
            raise ValueError('Reused initialization context differs')
        for name, field in (('initial.bin', 'initialHash'), ('evaluations.bin', 'evaluationHash')):
            if digest(initialized / name) != metadata[field]:
                raise ValueError('Reused initialization body differs')
        (directory / f'{log2}-phase2-init').symlink_to(init_stage.resolve(strict=True), target_is_directory=True)
        emit('initialization-reused', log2=log2, initialization=str(initialized),
             initializationMetadataSha256=init_pin, productionApproved=False)
    else:
        initialization_flags = dict(staged_initialization=staged)
        if resume_cache:
            initialization_flags.update(resume_cache=resume_cache[0], resume_cache_sha256=resume_cache[1])
        initialized = run('phase2-init', 'phase2-init', input=commons, input_sha256=digest(commons / 'commons.json'), cs=cs, cs_sha256=cs_pin, **initialization_flags)
    initialization_pin = digest(initialized / 'phase2-init.json')
    parent, parent_pin, previous, previous_pin = initialized, initialization_pin, '', ''
    for number in (1, 2):
        contributed = run(f'phase2-contribution{number}', 'phase2-contribute', input=parent, input_sha256=parent_pin,
                          initialization=initialized, initialization_sha256=initialization_pin,
                          previous_verification=previous, previous_verification_sha256=previous_pin)
        contributed_pin = digest(contributed / 'artifact.json')
        verified = run(f'phase2-verify{number}', 'phase2-verify', input=contributed, input_sha256=contributed_pin,
                       initialization=initialized, initialization_sha256=initialization_pin,
                       parent_artifact=parent, parent_artifact_sha256=parent_pin,
                       previous_verification=previous, previous_verification_sha256=previous_pin)
        previous = verified / 'verification.json'
        previous_pin = digest(previous)
        parent, parent_pin = contributed, contributed_pin
    keys = run('phase2-keys', 'phase2-seal', input=parent, input_sha256=parent_pin,
               initialization=initialized, initialization_sha256=initialization_pin,
               previous_verification=previous, previous_verification_sha256=previous_pin,
               commons=commons, commons_sha256=digest(commons / 'commons.json'), cs=cs)
    emit('domain-complete', log2=log2, keys=str(keys), productionApproved=False)


def checked_keys22(keys22_stage, keys22_pin):
    keys22 = success(keys22_stage, 'phase2-sealed', 22)
    if digest(keys22 / 'keys.json') != keys22_pin:
        raise ValueError('Reused domain 22 key metadata digest differs')
    keys = read_json(keys22 / 'keys.json')
    names = {'circuit.bin', 'proving.key', 'verifying.key', 'Verifier.sol', 'manifest.json'}
    if (keys['schema'] != 'vendetta-unsafe-local-phase2-keys-1' or keys['log2'] != 22
            or keys['productionApproved'] or keys['beaconAfterClosureProven'] or keys['unsafeLocalSetup'] is not True
            or set(keys['sha256']) != names):
        raise ValueError('Reused domain 22 key context differs')
    for name in names:
        if digest(keys22 / name) != keys['sha256'][name]:
            raise ValueError('Reused domain 22 key body differs')
    return keys22


def resume_domain23(binary, pin, directory, keys22_stage, keys22_pin, first23_stage, first23_pin, cs23, cs23_pin, emit):
    keys22 = checked_keys22(keys22_stage, keys22_pin)
    first = success(first23_stage, 'contribution-complete', 23)
    if digest(first / 'artifact.json') != first23_pin:
        raise ValueError('Reused domain 23 first contribution digest differs')
    (directory / '22-phase2-keys').symlink_to(keys22_stage.resolve(strict=True), target_is_directory=True)
    emit('domain-reused', log2=22, keys=str(keys22), keysMetadataSha256=keys22_pin, productionApproved=False)
    verified = execute(binary, pin, directory / '23-verify1', 'verify', 23, emit,
                       input=first, input_sha256=first23_pin)
    verification = verified / 'verification.json'
    second = execute(binary, pin, directory / '23-second', 'continue', 23, emit,
                     input=first, input_sha256=first23_pin,
                     previous_verification=verification, previous_verification_sha256=digest(verification))
    domain(binary, pin, directory, 23, cs23, cs23_pin, emit,
           resume=(first23_stage, verified.parent, second.parent))


def wait_for_existing(pid, binary_pin, report_path, emit, timeout=10860, interval=10):
    # A report is created before encoding/fsync finishes. Wait for the supervisor
    # to exit before reading it, even when its output path already exists.
    proc = Path('/proc') / str(pid)
    try:
        start = (proc / 'stat').read_text().rsplit(') ', 1)[1].split()[19]
    except FileNotFoundError:
        if report_path.exists():
            return
        raise ValueError('Existing contribution disappeared without report')
    try:
        observed_pin = digest(proc / 'exe')
    except FileNotFoundError:
        if report_path.exists():
            return
        raise ValueError('Existing contribution disappeared without report')
    if observed_pin != binary_pin:
        raise ValueError('Live executable digest differs')
    deadline = time.monotonic() + timeout
    while True:
        try:
            state = (proc / 'stat').read_text().rsplit(') ', 1)[1].split()
            if state[0] == 'Z' or state[19] != start:
                break
        except FileNotFoundError:
            break
        if time.monotonic() > deadline:
            raise ValueError('Existing contribution wait deadline exceeded')
        emit('waiting-for-existing-contribution', pid=pid)
        time.sleep(interval)
    if not report_path.exists():
        raise ValueError('Existing contribution ended without report')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--binary-sha256', required=True)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--unsafe-test-only', required=True, action='store_true')
    parser.add_argument('--cs22', required=True, type=Path)
    parser.add_argument('--cs23', required=True, type=Path)
    parser.add_argument('--resume-first', type=Path)
    parser.add_argument('--resume-verified', type=Path)
    parser.add_argument('--resume-second', type=Path)
    parser.add_argument('--resume-keys22', type=Path)
    parser.add_argument('--resume-keys22-sha256')
    parser.add_argument('--resume-first23', type=Path)
    parser.add_argument('--resume-first23-sha256')
    parser.add_argument('--resume-commons23', type=Path)
    parser.add_argument('--resume-commons23-sha256')
    parser.add_argument('--resume-initialization23', type=Path)
    parser.add_argument('--resume-initialization23-sha256')
    parser.add_argument('--staged-initialization', action='store_true')
    parser.add_argument('--resume-cache', type=Path)
    parser.add_argument('--resume-cache-sha256')
    parser.add_argument('--wait-for-memory', action='store_true')
    parser.add_argument('--wait-pid', type=int)
    parser.add_argument('--wait-binary-sha256')
    args = parser.parse_args()
    if bool(args.resume_initialization23) != bool(args.resume_initialization23_sha256) or (args.resume_initialization23 and (not args.resume_commons23 or args.resume_cache)):
        raise ValueError('Initialization resume requires pinned commons23 and paired initialization pins, without cache resume')
    if bool(args.resume_cache) != bool(args.resume_cache_sha256) or (args.resume_cache and not args.staged_initialization):
        raise ValueError('Cache resume requires staged initialization and paired metadata/pin')
    if (args.staged_initialization or args.resume_cache or args.wait_for_memory) and not args.resume_commons23:
        raise ValueError('Staged/wait options currently require resume from pinned commons23')
    external_new(args.directory)
    if digest(args.binary) != args.binary_sha256:
        raise ValueError('Pipeline executable digest differs')
    resumes = (args.resume_first, args.resume_verified, args.resume_second)
    if any(resumes) and not all(resumes):
        raise ValueError('All three resume directories are required together')
    if bool(args.wait_pid) != bool(args.wait_binary_sha256) or (args.wait_pid and not all(resumes)):
        raise ValueError('Waiting requires complete resume state and pinned live executable')
    larger_resume = (args.resume_keys22, args.resume_keys22_sha256, args.resume_first23, args.resume_first23_sha256)
    commons_resume = (args.resume_keys22, args.resume_keys22_sha256, args.resume_commons23, args.resume_commons23_sha256)
    from_commons = bool(args.resume_commons23 or args.resume_commons23_sha256)
    if from_commons:
        if not all(commons_resume) or args.resume_first23 or args.resume_first23_sha256 or any(resumes) or args.wait_pid:
            raise ValueError('Commons resume requires pinned keys22 and commons23 only')
    elif any(larger_resume) and (not all(larger_resume) or any(resumes) or args.wait_pid):
        raise ValueError('Domain 23 resume requires all four pinned inputs and no earlier resume/wait flags')
    cs_pins = ('89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898',
               '06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f')
    for cs, pin in zip((args.cs22, args.cs23), cs_pins):
        if digest(cs) != pin:
            raise ValueError('Game CS digest differs')
    args.directory.mkdir(mode=0o700)
    with (args.directory / 'sequence.jsonl').open('x') as events:
        def emit(event, **fields):
            events.write(json.dumps(dict(event=event, at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), **fields)) + '\n')
            events.flush()
            os.fsync(events.fileno())
        try:
            emit('sequence-start', binarySha256=args.binary_sha256, productionApproved=False)
            if args.wait_pid:
                wait_for_existing(args.wait_pid, args.wait_binary_sha256, args.resume_second / 'report.json', emit)
            if from_commons:
                keys22 = checked_keys22(args.resume_keys22, args.resume_keys22_sha256)
                (args.directory / '22-phase2-keys').symlink_to(args.resume_keys22.resolve(strict=True), target_is_directory=True)
                emit('domain-reused', log2=22, keys=str(keys22), keysMetadataSha256=args.resume_keys22_sha256, productionApproved=False)
                domain(args.binary, args.binary_sha256, args.directory, 23, args.cs23, cs_pins[1], emit,
                       resume_commons=(args.resume_commons23, args.resume_commons23_sha256),
                       staged=args.staged_initialization,
                       resume_cache=(args.resume_cache, args.resume_cache_sha256) if args.resume_cache else None,
                       wait_memory=args.wait_for_memory,
                       resume_initialization=(args.resume_initialization23, args.resume_initialization23_sha256) if args.resume_initialization23 else None)
            elif all(larger_resume):
                resume_domain23(args.binary, args.binary_sha256, args.directory, args.resume_keys22, args.resume_keys22_sha256,
                                args.resume_first23, args.resume_first23_sha256, args.cs23, cs_pins[1], emit)
            else:
                domain(args.binary, args.binary_sha256, args.directory, 22, args.cs22, cs_pins[0], emit, resumes if all(resumes) else None)
                domain(args.binary, args.binary_sha256, args.directory, 23, args.cs23, cs_pins[1], emit)
            emit('sequence-complete', productionApproved=False)
        except BaseException as error:
            emit('sequence-stopped', error=str(error), productionApproved=False)
            raise


if __name__ == '__main__':
    main()
