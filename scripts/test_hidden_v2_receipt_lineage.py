import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("hidden-v2-receipt-lineage.py")
SPEC = importlib.util.spec_from_file_location("lineage", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE = Path(__file__).resolve().parents[1] / "docs/benchmarks/timelock-opening/receipt-lineage"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2) + "\n").encode()


class PacketFixture:
    def __init__(self, kind="opening"):
        self.original_index = json.loads((SOURCE / kind / "index.json").read_bytes())
        self.original_result = json.loads((SOURCE / f"{kind}-result.json").read_bytes())
        self.docs = {key: json.loads((SOURCE / kind / name).read_bytes())
                     for key, name in self.original_index["documents"].items()}
        self.root = self.original_index["rootKeysSha256"]
        self.manifest = self.original_result["manifestSha256"]
        self.cs = self.original_result["declaredCircuitSha256"]

    def by_schema(self, suffix):
        return [(key, doc) for key, doc in self.docs.items() if doc.get("schema", "").endswith(suffix)]

    def write(self, directory):
        # Re-pin every ancestor after a semantic mutation. This ensures a test
        # reaches graph validation rather than stopping at the first stale hash.
        rebuilt = {}
        data = {}
        visiting = set()
        def value(item):
            if isinstance(item, str) and item in self.docs:
                return node(item)
            if isinstance(item, dict):
                return {key: value(child) for key, child in item.items()}
            if isinstance(item, list):
                return [value(child) for child in item]
            return item
        def node(old):
            if old in rebuilt:
                return rebuilt[old]
            if old in visiting:
                raise AssertionError("Fixture graph must be acyclic")
            visiting.add(old)
            body = encoded(value(self.docs[old]))
            new = digest(body)
            rebuilt[old] = new
            data[new] = body
            visiting.remove(old)
            return new
        for old in self.docs:
            node(old)
        index = copy.deepcopy(self.original_index)
        index["rootKeysSha256"] = rebuilt[self.root]
        index["documents"] = {key: key + ".json" for key in sorted(data)}
        for key, body in data.items():
            (directory / (key + ".json")).write_bytes(body)
        body = encoded(index)
        (directory / "index.json").write_bytes(body)
        return digest(body), rebuilt[self.root], rebuilt[self.manifest], self.cs


class LineageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def test_both_completed_packets(self):
        for kind in ("opening", "invalid-point"):
            record = json.loads((SOURCE / f"{kind}-result.json").read_bytes())
            result = MODULE.verify(SOURCE / kind, record["indexSha256"], record["keysSha256"],
                                   record["manifestSha256"], record["declaredCircuitSha256"])
            self.assertEqual(result, record)
            self.assertEqual(result["documentsChecked"], 12)
            self.assertFalse(result["nativeMpcReverified"])
            self.assertFalse(result["referencedBinaryBytesVerified"])
            self.assertFalse(result["productionApproved"])

    def test_external_endpoint_pins(self):
        fixture = PacketFixture()
        pins = list(fixture.write(self.root))
        for index in range(4):
            altered = list(pins)
            altered[index] = "0" * 64
            with self.subTest(index=index), self.assertRaises(ValueError):
                MODULE.verify(self.root, *altered)

    def test_semantic_mutations_with_fresh_ancestor_hashes(self):
        def initial(f):
            return f.by_schema("phase2-init-1")[0][1]
        def commons(f):
            return f.by_schema("commons-1")[0][1]
        def final_verification(f):
            return f.docs[f.docs[f.root]["verificationSha256"]]
        def final_artifact(f):
            return f.docs[f.docs[f.root]["sourceArtifactSha256"]]
        def first_phase1(f):
            return next(doc for doc in f.docs.values() if doc.get("operation") == "first-contribution")
        mutations = {
            "CS": lambda f: initial(f).update(csHash="0" * 64),
            "commons-body": lambda f: initial(f).update(commonsHash="0" * 64),
            "shape-domain": lambda f: initial(f)["shape"].update(domain=8),
            "wires": lambda f: initial(f)["evaluations"].update(wires=1),
            "initial-size": lambda f: initial(f).update(initialBytes=1),
            "evaluation-size": lambda f: initial(f).update(evaluationBytes=1),
            "self-approved": lambda f: f.docs[f.root].update(productionApproved=True),
            "future-beacon-claim": lambda f: commons(f).update(beaconAfterClosureProven=True),
            "incomplete-verification": lambda f: final_verification(f).update(nativeTransitionVerified=False),
            "missing-prior-verification": lambda f: final_verification(f).update(previousVerificationSha256=""),
            "parent-skips-contribution": lambda f: final_artifact(f).update(parentArtifactSha256=f.docs[f.root]["initializationSha256"]),
            "cross-domain": lambda f: final_artifact(f).update(log2=22),
            "missing-linked-node": lambda f: commons(f).update(verificationSha256="0" * 64),
            "unknown-field": lambda f: first_phase1(f).update(extra=True),
            "first-not-first": lambda f: first_phase1(f).update(operation="second-contribution"),
        }
        for number, (name, mutate) in enumerate(mutations.items()):
            fixture = PacketFixture()
            mutate(fixture)
            directory = self.root / str(number)
            directory.mkdir()
            pins = fixture.write(directory)
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.verify(directory, *pins)

    def test_unreachable_indexed_document(self):
        fixture = PacketFixture()
        fixture.docs["0" * 64] = {"unused": True}
        pins = fixture.write(self.root)
        with self.assertRaisesRegex(ValueError, "Unused or unreachable"):
            MODULE.verify(self.root, *pins)

    def test_missing_changed_symlink_and_fifo_documents(self):
        for number, mode in enumerate(("missing", "changed", "symlink", "fifo")):
            directory = self.root / str(number)
            directory.mkdir()
            pins = PacketFixture().write(directory)
            path = directory / (pins[1] + ".json")
            body = path.read_bytes()
            path.unlink()
            if mode == "changed":
                path.write_text("{}")
            elif mode == "symlink":
                target = directory / "target"
                target.write_bytes(body)
                path.symlink_to(target)
            elif mode == "fifo":
                os.mkfifo(path)
            with self.subTest(mode=mode), self.assertRaises((ValueError, OSError)):
                MODULE.verify(directory, *pins)

    def test_index_path_escape_and_document_budget(self):
        for number, mode in enumerate(("path", "count")):
            directory = self.root / str(number)
            directory.mkdir()
            pins = list(PacketFixture().write(directory))
            path = directory / "index.json"
            index = json.loads(path.read_bytes())
            if mode == "path":
                index["documents"][pins[1]] = "../escape.json"
            else:
                index["documents"] = {f"{i:064x}": f"{i:064x}.json" for i in range(33)}
            data = encoded(index)
            path.write_bytes(data)
            pins[0] = digest(data)
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                MODULE.verify(directory, *pins)

    def test_json_format_and_read_budgets(self):
        for data in (b'{"x":1,"x":2}', b'{"x":Infinity}', b'{"x":1e999}', b'{"x":-1e999}', b'[' * 17 + b']' * 17):
            with self.assertRaises(ValueError):
                MODULE.decode(data)
        pins = PacketFixture().write(self.root)
        with patch.object(MODULE, "TOTAL_LIMIT", len((self.root / "index.json").read_bytes()) + 1):
            with self.assertRaisesRegex(ValueError, "total budget"):
                MODULE.verify(self.root, *pins)
        data = b" " * (MODULE.JSON_LIMIT + 1)
        (self.root / "index.json").write_bytes(data)
        with self.assertRaisesRegex(ValueError, "bounded regular"):
            MODULE.verify(self.root, digest(data), *pins[1:])

    def test_cli_and_no_success_output_on_failure(self):
        pins = PacketFixture().write(self.root)
        command = [sys.executable, str(SCRIPT), "--packet", str(self.root)]
        for name, expected in zip(("index", "keys", "manifest", "circuit"), pins):
            command += [f"--{name}-sha256", expected]
        result = subprocess.run(command, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)["productionApproved"])
        (self.root / (pins[1] + ".json")).unlink()
        result = subprocess.run(command, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")


if __name__ == "__main__":
    unittest.main()
