import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sequence', Path(__file__).with_name('hidden-v2-local-sequence.py'))
sequence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sequence)


class SequenceTest(unittest.TestCase):
    def test_order_and_pinned_predecessors(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            calls = []

            def execute(binary, pin, directory, operation, log2, emit, **flags):
                calls.append((directory, operation, flags))
                for field, name in (('input', 'input_sha256'), ('initialization', 'initialization_sha256'),
                                    ('commons', 'commons_sha256'), ('parent_artifact', 'parent_artifact_sha256')):
                    if field not in flags:
                        continue
                    target = flags[field]
                    metadata = {'initialization': 'phase2-init.json', 'commons': 'commons.json'}.get(field)
                    if metadata is None:
                        metadata = 'phase2-init.json' if 'phase2-init' in target.parent.name else ('commons.json' if target.parent.name.endswith('-seal') else 'artifact.json')
                    self.assertEqual(flags[name], sequence.digest(target / metadata))
                if flags.get('previous_verification'):
                    self.assertEqual(flags['previous_verification_sha256'], sequence.digest(flags['previous_verification']))
                public = directory / 'public'
                public.mkdir(parents=True)
                metadata = {'contribute': 'artifact.json', 'continue': 'artifact.json', 'verify': 'verification.json',
                            'seal': 'commons.json', 'phase2-init': 'phase2-init.json', 'phase2-contribute': 'artifact.json',
                            'phase2-verify': 'verification.json', 'phase2-seal': 'keys.json'}[operation]
                (public / metadata).write_text(json.dumps({'operation': operation, 'directory': str(directory)}))
                return public

            with patch.object(sequence, 'execute', execute):
                sequence.domain(root / 'binary', 'a' * 64, root, 22, root / 'cs', 'b' * 64, lambda *a, **k: None)
            self.assertEqual([c[1] for c in calls], ['contribute', 'verify', 'continue', 'verify', 'seal', 'phase2-init',
                                                   'phase2-contribute', 'phase2-verify', 'phase2-contribute', 'phase2-verify', 'phase2-seal'])
            self.assertNotIn('previous_verification', calls[1][2])
            self.assertEqual(calls[6][2]['previous_verification'], '')
            self.assertTrue(calls[8][2]['previous_verification'])

    def test_failure_stops_later_stages(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(sequence, 'execute', side_effect=RuntimeError('worker failure')) as run:
                with self.assertRaisesRegex(RuntimeError, 'worker failure'):
                    sequence.domain(root / 'binary', 'a' * 64, root, 22, root / 'cs', 'b' * 64, lambda *a, **k: None)
                self.assertEqual(run.call_count, 1)

    def test_waits_for_exit_even_if_report_already_exists(self):
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / 'report.json'
            report.touch()  # Created, but not yet encoded or flushed.
            def state(kind):
                fields = ['0'] * 20
                fields[0], fields[19] = kind, '123'
                return '99 (pipeline) ' + ' '.join(fields)
            emitted = []
            with patch.object(Path, 'read_text', side_effect=[state('R'), state('R'), state('Z')]), \
                 patch.object(sequence, 'digest', return_value='a' * 64), \
                 patch.object(sequence.time, 'sleep') as sleep:
                sequence.wait_for_existing(99, 'a' * 64, report, lambda *a, **k: emitted.append(a))
            self.assertEqual(sleep.call_count, 1)
            self.assertEqual(len(emitted), 1)

    def _resume_fixture(self, root):
        old_keys, old_first, new = root / 'old-keys22', root / 'old-first23', root / 'new'
        for stage, status, log2 in ((old_keys, 'phase2-sealed', 22), (old_first, 'contribution-complete', 23)):
            (stage / 'public').mkdir(parents=True)
            (stage / 'report.json').write_text(json.dumps(dict(status=status, log2=log2, exited=True, productionApproved=False)))
        names = ('circuit.bin', 'proving.key', 'verifying.key', 'Verifier.sol', 'manifest.json')
        hashes = {}
        for name in names:
            path = old_keys / 'public' / name
            path.write_text(name)
            hashes[name] = sequence.digest(path)
        key_metadata = old_keys / 'public' / 'keys.json'
        key_metadata.write_text(json.dumps(dict(schema='vendetta-unsafe-local-phase2-keys-1', log2=22,
                                                productionApproved=False, beaconAfterClosureProven=False, unsafeLocalSetup=True, sha256=hashes)))
        first_metadata = old_first / 'public' / 'artifact.json'
        first_metadata.write_text('{"original":"first contribution"}')
        new.mkdir()
        return old_keys, sequence.digest(key_metadata), old_first, sequence.digest(first_metadata), new

    def test_resume_reuses_keys_and_first_contribution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old_keys, key_pin, old_first, first_pin, new = self._resume_fixture(root)
            calls = []
            def execute(binary, pin, directory, operation, log2, emit, **flags):
                calls.append((operation, log2, flags))
                public = directory / 'public'
                public.mkdir(parents=True)
                (public / ('verification.json' if operation == 'verify' else 'artifact.json')).write_text('{}')
                return public
            with patch.object(sequence, 'execute', execute), patch.object(sequence, 'domain') as domain:
                sequence.resume_domain23(root / 'binary', 'a' * 64, new, old_keys, key_pin, old_first, first_pin,
                                         root / 'cs23', 'b' * 64, lambda *a, **k: None)
                self.assertEqual(domain.call_args.kwargs['resume'], (old_first, new / '23-verify1', new / '23-second'))
                self.assertEqual(domain.call_args.args[3], 23)
            self.assertEqual([call[0] for call in calls], ['verify', 'continue'])
            self.assertTrue(all(call[1] == 23 for call in calls))
            self.assertEqual(calls[0][2]['input_sha256'], first_pin)
            self.assertEqual(calls[1][2]['previous_verification_sha256'], sequence.digest(new / '23-verify1/public/verification.json'))
            self.assertEqual((new / '22-phase2-keys').resolve(), old_keys)
            self.assertEqual(sequence.digest(old_keys / 'public/keys.json'), key_pin)

    def test_resume_rejects_substituted_key_body_before_work(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old_keys, key_pin, old_first, first_pin, new = self._resume_fixture(root)
            (old_keys / 'public/proving.key').write_text('substituted')
            with patch.object(sequence, 'execute') as execute:
                with self.assertRaisesRegex(ValueError, 'key body differs'):
                    sequence.resume_domain23(root / 'binary', 'a' * 64, new, old_keys, key_pin, old_first, first_pin,
                                             root / 'cs23', 'b' * 64, lambda *a, **k: None)
                execute.assert_not_called()
            self.assertFalse((new / '22-phase2-keys').exists())

    def test_resume_commons_skips_all_phase1_work(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            stage = root / 'sealed'
            public = stage / 'public'
            public.mkdir(parents=True)
            (stage / 'report.json').write_text(json.dumps(dict(status='phase1-sealed', log2=23, exited=True, productionApproved=False)))
            (public / 'commons.bin').write_bytes(b'original commons')
            metadata = public / 'commons.json'
            metadata.write_text(json.dumps(dict(schema='vendetta-unsafe-local-commons-1', log2=23,
                                                productionApproved=False, beaconAfterClosureProven=False,
                                                sha256=sequence.digest(public / 'commons.bin'))))
            calls = []
            def execute(binary, pin, directory, operation, log2, emit, **flags):
                calls.append(operation)
                target = directory / 'public'
                target.mkdir(parents=True)
                name = {'phase2-init': 'phase2-init.json', 'phase2-contribute': 'artifact.json',
                        'phase2-verify': 'verification.json', 'phase2-seal': 'keys.json'}[operation]
                (target / name).write_text('{}')
                return target
            with patch.object(sequence, 'execute', execute):
                sequence.domain(root / 'binary', 'a' * 64, root / 'new', 23, root / 'cs', 'b' * 64,
                                lambda *a, **k: None, resume_commons=(stage, sequence.digest(metadata)))
            self.assertEqual(calls, ['phase2-init', 'phase2-contribute', 'phase2-verify',
                                     'phase2-contribute', 'phase2-verify', 'phase2-seal'])
            (public / 'commons.bin').write_bytes(b'substituted')
            with patch.object(sequence, 'execute') as run:
                with self.assertRaisesRegex(ValueError, 'commons body differs'):
                    sequence.domain(root / 'binary', 'a' * 64, root / 'new2', 23, root / 'cs', 'b' * 64,
                                    lambda *a, **k: None, resume_commons=(stage, sequence.digest(metadata)))
                run.assert_not_called()

    def test_memory_wait_requires_stable_headroom(self):
        emitted = []
        with patch.object(sequence, 'available_memory', side_effect=[11 << 30, 13 << 30, 11 << 30, 13 << 30, 13 << 30, 13 << 30]), \
             patch.object(sequence.time, 'sleep') as sleep:
            sequence.wait_for_headroom(12 << 30, lambda event, **fields: emitted.append((event, fields)))
        self.assertEqual(sleep.call_count, 5)
        self.assertEqual(emitted[2][1]['consecutivePassingSamples'], 0)

    def test_memory_wait_timeout_stops_before_work(self):
        with patch.object(sequence, 'available_memory', return_value=11 << 30), \
             patch.object(sequence.time, 'monotonic', side_effect=[0, 11]):
            with self.assertRaisesRegex(ValueError, 'headroom wait deadline'):
                sequence.wait_for_headroom(12 << 30, lambda *a, **k: None, timeout=10)

    def test_execute_passes_boolean_flag_without_true_argument(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            class Child:
                def __init__(self, command, **kwargs):
                    self.command = command
                    self.pid = 123
                    observed.extend(command)
                def wait(self): return 0
            observed = []
            with patch.object(sequence, 'digest', return_value='a' * 64), \
                 patch.object(sequence.subprocess, 'Popen', Child), \
                 patch.object(sequence, 'success', return_value=root / 'public'), \
                 patch.object(sequence, 'wait_for_headroom') as wait:
                sequence.execute(root / 'binary', 'a' * 64, root / 'stage', 'phase2-init', 23,
                                 lambda *a, **k: None, wait_memory=True, staged_initialization=True)
            self.assertIn('--staged-initialization', observed)
            self.assertNotIn('True', observed)
            self.assertNotIn('--wait-memory', observed)
            self.assertEqual(wait.call_args.args[0], 10 << 30)

    def test_resume_initialization_skips_all_completed_work(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            commons, initialized = root / 'commons', root / 'initialized'
            for stage, status in ((commons, 'phase1-sealed'), (initialized, 'phase2-initialized')):
                (stage / 'public').mkdir(parents=True)
                (stage / 'report.json').write_text(json.dumps(dict(status=status, log2=23, exited=True, productionApproved=False)))
            (commons / 'public/commons.bin').write_bytes(b'commons')
            commons_meta = commons / 'public/commons.json'
            commons_meta.write_text(json.dumps(dict(schema='vendetta-unsafe-local-commons-1', log2=23,
                productionApproved=False, beaconAfterClosureProven=False, sha256=sequence.digest(commons / 'public/commons.bin'))))
            (initialized / 'public/initial.bin').write_bytes(b'initial')
            (initialized / 'public/evaluations.bin').write_bytes(b'evaluations')
            init_meta = initialized / 'public/phase2-init.json'
            metadata = dict(schema='vendetta-unsafe-local-phase2-init-1', log2=23, productionApproved=False, csHash='b'*64,
                commonsArtifactHash=sequence.digest(commons_meta), commonsHash=sequence.digest(commons / 'public/commons.bin'),
                initialHash=sequence.digest(initialized / 'public/initial.bin'), evaluationHash=sequence.digest(initialized / 'public/evaluations.bin'))
            init_meta.write_text(json.dumps(metadata))
            target = root / 'new'; target.mkdir()
            calls = []
            def execute(binary, pin, directory, operation, log2, emit, **flags):
                calls.append(operation)
                self.assertEqual(flags['initialization'], initialized / 'public')
                public = directory / 'public'; public.mkdir(parents=True)
                name = {'phase2-contribute':'artifact.json', 'phase2-verify':'verification.json', 'phase2-seal':'keys.json'}[operation]
                (public / name).write_text('{}')
                return public
            with patch.object(sequence, 'execute', execute):
                sequence.domain(root/'binary', 'a'*64, target, 23, root/'cs', 'b'*64, lambda *a, **k: None,
                    resume_commons=(commons, sequence.digest(commons_meta)), resume_initialization=(initialized, sequence.digest(init_meta)))
            self.assertEqual(calls, ['phase2-contribute','phase2-verify','phase2-contribute','phase2-verify','phase2-seal'])
            self.assertEqual((target/'23-phase2-init').resolve(), initialized)
            for mutation in ('body', 'context'):
                if mutation == 'body':
                    (initialized/'public/initial.bin').write_bytes(b'altered')
                else:
                    (initialized/'public/initial.bin').write_bytes(b'initial')
                    metadata['csHash'] = 'f'*64
                    init_meta.write_text(json.dumps(metadata))
                with patch.object(sequence, 'execute') as run:
                    with self.assertRaisesRegex(ValueError, 'initialization (body|context) differs'):
                        sequence.domain(root/'binary', 'a'*64, root/'must-not-run', 23, root/'cs', 'b'*64, lambda *a, **k: None,
                            resume_commons=(commons, sequence.digest(commons_meta)), resume_initialization=(initialized, sequence.digest(init_meta)))
                    run.assert_not_called()

    def test_existing_evidence_is_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                sequence.external_new(Path(temporary))
            with self.assertRaises(ValueError):
                sequence.external_new(Path('relative'))


if __name__ == '__main__':
    unittest.main()
