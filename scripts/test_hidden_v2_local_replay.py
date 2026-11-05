import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('replay', Path(__file__).with_name('hidden-v2-local-replay.py'))
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


class ReplayTest(unittest.TestCase):
    def test_memory_wait_requires_stable_headroom(self):
        with patch.object(replay, 'available_memory', side_effect=[9 << 30, 11 << 30, 11 << 30, 11 << 30]), \
             patch.object(replay.time, 'sleep') as sleep:
            replay.wait_for_headroom(lambda *a, **k: None)
        self.assertEqual(sleep.call_count, 3)

    def test_memory_wait_deadline(self):
        with patch.object(replay, 'available_memory', return_value=9 << 30), \
             patch.object(replay.time, 'monotonic', side_effect=[0, 11]):
            with self.assertRaisesRegex(ValueError, 'headroom wait deadline'):
                replay.wait_for_headroom(lambda *a, **k: None, timeout=10)

    def test_partial_event_is_not_a_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'events.jsonl'
            path.write_bytes(b'{"event":"start"}\n{"event":"sequence-complete"')
            self.assertEqual(replay.last_event(path)['event'], 'start')
            with path.open('ab') as output:
                output.write(b'}\n')
            self.assertEqual(replay.last_event(path)['event'], 'sequence-complete')

    def test_claimed_production_approval_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            (path / 'keys.json').write_text(json.dumps(dict(schema='vendetta-unsafe-local-phase2-keys-1', log2=22,
                                                           productionApproved=True, beaconAfterClosureProven=False, unsafeLocalSetup=True)))
            with self.assertRaisesRegex(ValueError, 'receipt differs'):
                replay.check_keys(path, 'invalid-point', 22)

    def test_incomplete_key_set_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            (path / 'keys.json').write_text(json.dumps(dict(schema='vendetta-unsafe-local-phase2-keys-1', log2=22,
                                                           productionApproved=False, beaconAfterClosureProven=False, unsafeLocalSetup=True, sha256={})))
            with self.assertRaisesRegex(ValueError, 'inventory differs'):
                replay.check_keys(path, 'invalid-point', 22)

    def test_memory_observation_uses_bytes(self):
        self.assertGreater(replay.available_memory(), 0)


if __name__ == '__main__':
    unittest.main()
