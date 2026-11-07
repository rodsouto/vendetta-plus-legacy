import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("evidence", Path(__file__).with_name("hidden-v2-completed-evidence.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE = Path(__file__).resolve().parents[1] / "docs/benchmarks/timelock-opening/local-mpc-staged"


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.summary = json.loads((SOURCE / "completed-results.json").read_bytes())
        for name in MODULE.EVIDENCE_NAMES:
            (self.root / name).write_bytes((SOURCE / name).read_bytes())

    def run_check(self):
        data = json.dumps(self.summary).encode()
        path = self.root / "summary.json"
        path.write_bytes(data)
        return MODULE.verify(path, hashlib.sha256(data).hexdigest())

    def test_archived_reports(self):
        result = self.run_check()
        self.assertFalse(result["productionApproved"])
        self.assertFalse(result["cryptographicProofsReverified"])
        self.assertFalse(result["originalReportsAndProofsChecked"])

    def test_mutations(self):
        original = copy.deepcopy(self.summary)
        for mutate in (
            lambda s: s.update(productionApproved=True),
            lambda s: s.update(unsafeLocalSetup=False),
            lambda s: s["proofs"][0].update(setupManifestSha256="0" * 64),
            lambda s: s["proofs"][0].update(statement=s["proofs"][1]["statement"]),
            lambda s: s["proofs"][0].update(valid="True"),
            lambda s: s["proofs"][0].update(sha256="not-a-pin"),
            lambda s: s["proofs"][0].update(statement="not-a-statement"),
            lambda s: s["proofs"][0].update(independentApprovalVerified=True),
            lambda s: s["newKeyReplay"].update(sampledPeakNativeRssBytes=1),
            lambda s: s["evidence"].update({"../escape.json": {}}),
        ):
            self.summary = copy.deepcopy(original)
            mutate(self.summary)
            with self.subTest(summary=self.summary), self.assertRaises(ValueError):
                self.run_check()

    def test_originals_and_substituted_metadata(self):
        for name, record in self.summary["evidence"].items():
            record["original"] = str(self.root / name)
        for index, proof in enumerate(self.summary["proofs"]):
            path = self.root / f"proof-{index}.json"
            data = json.dumps({field: proof[field] for field in
                               ("kind", "statement", "setupManifestSha256", "valid")}).encode()
            path.write_bytes(data)
            proof.update(original=str(path), sha256=hashlib.sha256(data).hexdigest())
        self.run_check()
        path = self.root / "summary.json"
        result = MODULE.verify(path, hashlib.sha256(path.read_bytes()).hexdigest(), True)
        self.assertTrue(result["originalReportsAndProofsChecked"])
        proof = self.summary["proofs"][0]
        altered = json.loads(Path(proof["original"]).read_bytes())
        altered["valid"] = False
        data = json.dumps(altered).encode()
        Path(proof["original"]).write_bytes(data)
        proof["sha256"] = hashlib.sha256(data).hexdigest()
        self.run_check()
        with self.assertRaisesRegex(ValueError, "Proof metadata mismatch"):
            MODULE.verify(path, hashlib.sha256(path.read_bytes()).hexdigest(), True)

    def test_changed_copy(self):
        (self.root / "replay-results.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.run_check()

    def test_pin_budget_duplicates_and_special_file(self):
        path = self.root / "input.json"
        for data in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}',
                     b'{"x":1e999}', b'{"x":-1e999}', b" " * (MODULE.MAX_JSON_BYTES + 1)):
            path.write_bytes(data)
            with self.assertRaises(ValueError):
                MODULE.read_pinned(path, hashlib.sha256(data).hexdigest())
        with self.assertRaises(ValueError):
            MODULE.read_pinned(self.root, "0" * 64)
        path.unlink()
        path.symlink_to(SOURCE / "completed-results.json")
        with self.assertRaises((ValueError, OSError)):
            MODULE.read_pinned(path, "0" * 64)

    def test_descriptor_open_rejects_substitution(self):
        data = b'{"fixture":true}'
        target = self.root / "target.json"
        target.write_bytes(data)
        path = self.root / "input.json"
        original_open = os.open
        for replacement in ("symlink", "fifo"):
            with self.subTest(replacement=replacement):
                path.write_bytes(data)
                def substitute(name, flags, *args, **kwargs):
                    if Path(name) == path:
                        self.assertTrue(flags & os.O_NOFOLLOW)
                        self.assertTrue(flags & os.O_NONBLOCK)
                        path.unlink()
                        if replacement == "symlink":
                            path.symlink_to(target)
                        else:
                            os.mkfifo(path)
                    return original_open(name, flags, *args, **kwargs)
                with patch.object(MODULE.os, "open", substitute):
                    with self.assertRaises((ValueError, OSError)):
                        MODULE.read_pinned(path, hashlib.sha256(data).hexdigest())
                path.unlink()

    def test_descriptor_size_budget_precedes_read(self):
        path = self.root / "oversized.json"
        with path.open("wb") as source:
            source.truncate(MODULE.MAX_JSON_BYTES + 1)
        with patch.object(MODULE.os, "fdopen", wraps=os.fdopen) as opened:
            with self.assertRaisesRegex(ValueError, "budget"):
                MODULE.read_pinned(path, "0" * 64)
            opened.assert_not_called()


if __name__ == "__main__":
    unittest.main()
