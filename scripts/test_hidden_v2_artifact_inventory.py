import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("hidden-v2-artifact-inventory.py")
SPEC = importlib.util.spec_from_file_location("inventory", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class InventoryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        hashes = {}
        for name in MODULE.BODIES:
            data = ("synthetic " + name).encode()
            (self.root / name).write_bytes(data)
            hashes[name] = digest(data)
        # The regression export is deliberately tiny and never a cryptographic setup.
        self.addCleanup(patch.stopall)
        patch.dict(MODULE.CIRCUITS, {"opening": (23, 12, 55, hashes["circuit.bin"])}).start()
        self.manifest = dict(kind="opening", profile="VENDETTA_OPENING_V2", unsafeLocalSetup=True,
                             constraints=12, publicInputs=55, sha256=hashes)
        self.receipt = dict(schema="vendetta-unsafe-local-phase2-keys-1", log2=23,
                            initializationSha256="1" * 64, sourceArtifactSha256="2" * 64,
                            verificationSha256="3" * 64, commonsArtifactSha256="4" * 64,
                            beacon="VENDETTA_UNSAFE_LOCAL_PHASE2_CAPACITY_BEACON_V1",
                            sha256={}, beaconAfterClosureProven=False,
                            unsafeLocalSetup=True, productionApproved=False)
        self.save()

    def save(self):
        data = json.dumps(self.manifest).encode()
        (self.root / "manifest.json").write_bytes(data)
        self.manifest_pin = digest(data)
        self.receipt["sha256"] = dict(self.manifest["sha256"], **{"manifest.json": self.manifest_pin})
        data = json.dumps(self.receipt).encode()
        (self.root / "keys.json").write_bytes(data)
        self.receipt_pin = digest(data)

    def inspect(self, budget=65536):
        return MODULE.inspect(self.root, "opening", self.manifest_pin, self.receipt_pin, budget)

    def test_success_is_only_inventory(self):
        result = self.inspect()
        self.assertTrue(result["artifactBytesVerified"])
        self.assertFalse(result["productionApproved"])
        self.assertFalse(result["artifactRelationsVerified"])
        self.assertFalse(result["nativeDecodingPerformed"])
        self.assertEqual(set(result["artifacts"]), MODULE.BODIES)

    def test_budget_is_enforced_before_reads(self):
        with patch.object(MODULE, "read_json") as read:
            with self.assertRaisesRegex(ValueError, "before body reads"):
                self.inspect(1)
            read.assert_not_called()

    def test_changed_and_substituted_pins(self):
        for field in ("manifest_pin", "receipt_pin"):
            original = getattr(self, field)
            setattr(self, field, "0" * 64)
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "pin mismatch"):
                self.inspect()
            setattr(self, field, original)
        for name in sorted(MODULE.BODIES):
            body = self.root / name
            original = body.read_bytes()
            body.write_bytes(b"changed")
            with self.subTest(body=name), self.assertRaisesRegex(ValueError, "Body SHA-256 differs"):
                self.inspect()
            body.write_bytes(original)

    def test_scope_circuit_counts_and_inventory(self):
        original_manifest, original_receipt = copy.deepcopy(self.manifest), copy.deepcopy(self.receipt)
        for target, field, value in (
            ("manifest", "unsafeLocalSetup", False), ("manifest", "kind", "invalid-point"),
            ("manifest", "constraints", 13), ("manifest", "publicInputs", True),
            ("manifest", "extra", 1), ("receipt", "productionApproved", True),
            ("receipt", "beaconAfterClosureProven", True), ("receipt", "log2", 22),
            ("receipt", "unsafeLocalSetup", False), ("receipt", "beacon", "future-secure"),
        ):
            self.manifest, self.receipt = copy.deepcopy(original_manifest), copy.deepcopy(original_receipt)
            getattr(self, target)[field] = value
            self.save()
            with self.subTest(target=target, field=field), self.assertRaises(ValueError):
                self.inspect()

    def test_unexpected_file_symlink_fifo_and_empty(self):
        path = self.root / "extra"
        path.write_text("extra")
        with self.assertRaisesRegex(ValueError, "inventory differs"):
            self.inspect()
        path.unlink()
        body = self.root / "proving.key"
        original = body.read_bytes()
        body.unlink()
        body.symlink_to(self.root / "verifying.key")
        with self.assertRaises(OSError):
            self.inspect()
        body.unlink()
        os.mkfifo(body)
        with self.assertRaisesRegex(ValueError, "regular file"):
            self.inspect()
        body.unlink()
        body.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "regular file"):
            self.inspect()
        body.write_bytes(original)

    def test_replaced_directory_entry_is_rejected(self):
        read_json = MODULE.read_json
        def replace(source, size, expected):
            result = read_json(source, size, expected)
            if "schema" in result:
                path = self.root / "proving.key"
                original = path.read_bytes()
                path.unlink()
                path.write_bytes(original)
            return result
        with patch.object(MODULE, "read_json", side_effect=replace):
            with self.assertRaisesRegex(ValueError, "changed"):
                self.inspect()

    def test_json_duplicate_depth_nonfinite_and_budget(self):
        for data in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":1e999}', b'{"x":-1e999}', b'[' * 17 + b']' * 17,
                     b' ' * (MODULE.JSON_LIMIT + 1)):
            with self.subTest(data=data[:32]), self.assertRaises(ValueError):
                MODULE.read_json(io.BytesIO(data), len(data), digest(data))

    def test_cli_failure_has_no_success_output(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--directory", str(self.root),
                                 "--kind", "opening", "--manifest-sha256", self.manifest_pin,
                                 "--receipt-sha256", self.receipt_pin, "--max-bytes", "1"],
                                capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"byte budget", result.stderr)


if __name__ == "__main__":
    unittest.main()
