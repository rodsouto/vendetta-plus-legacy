import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("hidden-v2-archived-preflight.py")
SPEC = importlib.util.spec_from_file_location("preflight", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
ROOT = Path(__file__).resolve().parents[1]
PLAN = "docs/proposals/hidden-v2-archived-preflight-inputs.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2) + "\n").encode()


class PreflightTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.plan = json.loads((ROOT / PLAN).read_bytes())
        def copy_file(name):
            destination = self.root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, destination)
        copy_file(self.plan["summary"]["path"])
        parent = Path(self.plan["summary"]["path"]).parent
        for name in MODULE.EVIDENCE.EVIDENCE_NAMES:
            copy_file(str(parent / name))
        for entry in self.plan["circuits"].values():
            for role in ("inventory", "compiled", "pkStructure", "vkExport"):
                copy_file(entry[role]["path"])
            copy_file(entry["lineage"]["report"]["path"])
            packet = entry["lineage"]["packet"]
            copy_file(packet + "/index.json")
            index = json.loads((ROOT / packet / "index.json").read_bytes())
            for name in index["documents"].values():
                copy_file(packet + "/" + name)
        (self.root / PLAN).parent.mkdir(parents=True, exist_ok=True)

    def run_check(self):
        data = encoded(self.plan)
        (self.root / PLAN).write_bytes(data)
        return MODULE.verify(self.root, PLAN, digest(data))

    def change_report(self, role, mutate, kind="opening"):
        reference = self.plan["circuits"][kind][role]
        if role == "lineage":
            reference = reference["report"]
        path = self.root / reference["path"]
        report = json.loads(path.read_bytes())
        mutate(report)
        data = encoded(report)
        path.write_bytes(data)
        reference["sha256"] = digest(data)

    def test_original_archives_and_scope(self):
        result = self.run_check()
        self.assertEqual(result["recordedProofs"], 3)
        self.assertEqual(set(result["circuits"]), {"opening", "invalid-point"})
        self.assertTrue(result["privateJsonSnapshotUsed"])
        for field in ("binaryArtifactsRead", "nativeWorkRerun", "currentArtifactsReverified",
                      "currentSourceReproductionVerified", "independentApprovalVerified", "productionApproved"):
            self.assertIs(result[field], False)

    def test_replay_semantics_with_recalculated_pins(self):
        summary_path = self.root / self.plan["summary"]["path"]
        worker_path = summary_path.parent / "replay-worker-results.json"
        original_summary = json.loads(summary_path.read_bytes())
        original_worker = json.loads(worker_path.read_bytes())
        cases = [
            ("overflow", lambda s, w: (s["newKeyReplay"].update(batchElapsedMs=float("inf")), w.update(batchElapsedMs=float("inf")))),
            ("negative-rss", lambda s, w: (s["newKeyReplay"].update(sampledPeakNodeRssBytes=-1), w["resources"].update(peakNodeRssBytes=-1))),
            ("bool-process-count", lambda s, w: (s["newKeyReplay"].update(peakNativeProcesses=True), w["resources"].update(peakNativeProcesses=True))),
            ("float-process-count", lambda s, w: (s["newKeyReplay"].update(peakNativeProcesses=1.0), w["resources"].update(peakNativeProcesses=1.0))),
            ("duplicate-circuit", lambda s, w: w["measurements"].__setitem__(2, copy.deepcopy(w["measurements"][0]))),
            ("duplicate-job-name", lambda s, w: w["measurements"][1].update(name=w["measurements"][0]["name"])),
            ("bool-reuse", lambda s, w: w["measurements"][1].update(artifactsReused=1)),
            ("negative-job-time", lambda s, w: w["measurements"][0].update(nativeElapsedMs=-1)),
            ("unfinished-queue", lambda s, w: w["finalStats"]["queue"].update(pending=1)),
            ("missing-cache-replay", lambda s, w: w["finalStats"].update(cacheHits=0)),
            ("wrong-proof-counter", lambda s, w: w["statsAfter"].update(proofs=2)),
            ("nonfinite-profile", lambda s, w: w["measurements"][0]["profileMs"].update(proveMs=float("inf"))),
        ]
        for label, mutate in cases:
            summary, worker = copy.deepcopy(original_summary), copy.deepcopy(original_worker)
            mutate(summary, worker)
            data = encoded(worker).replace(b"Infinity", b"1e999")
            worker_path.write_bytes(data)
            for field in ("copiedSha256", "originalSha256"):
                summary["evidence"]["replay-worker-results.json"][field] = digest(data)
            data = encoded(summary).replace(b"Infinity", b"1e999")
            summary_path.write_bytes(data)
            self.plan["summary"]["sha256"] = digest(data)
            with self.subTest(case=label), self.assertRaises(ValueError):
                self.run_check()

    def test_rejected_directory_does_not_leak_descriptors(self):
        directory = self.root / "directory.json"
        directory.mkdir()
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, fd)
        readers = (
            lambda: MODULE.Inputs(fd).read({"path": "directory.json", "sha256": "0" * 64}),
            lambda: MODULE.LINEAGE.Packet(fd).read("directory.json", "0" * 64),
        )
        for reader in readers:
            before = len(list(Path("/proc/self/fd").iterdir()))
            for _ in range(4):
                with self.assertRaises((ValueError, OSError)):
                    reader()
            self.assertEqual(len(list(Path("/proc/self/fd").iterdir())), before)
        directory.rmdir()
        directory.write_bytes(b"{}")
        for reader in readers:
            before = len(list(Path("/proc/self/fd").iterdir()))
            with patch.object(MODULE.os, "fdopen", side_effect=OSError("fixture stream failure")):
                for _ in range(4):
                    with self.assertRaisesRegex(OSError, "fixture stream failure"):
                        reader()
            self.assertEqual(len(list(Path("/proc/self/fd").iterdir())), before)

    def test_cross_circuit_report_swap_with_valid_pins(self):
        self.plan["circuits"]["opening"]["pkStructure"] = copy.deepcopy(self.plan["circuits"]["invalid-point"]["pkStructure"])
        with self.assertRaisesRegex(ValueError, "PK report identity"):
            self.run_check()

    def test_semantic_mutations_with_fresh_report_and_plan_pins(self):
        cases = [
            ("inventory", lambda r: r.update(productionApproved=True)),
            ("inventory", lambda r: r.update(bytesChecked=1)),
            ("inventory", lambda r: r["artifacts"]["verifying.key"].update(sha256="0" * 64)),
            ("inventory", lambda r: r["artifacts"]["verifying.key"].update(bytes=1 << 20)),
            ("compiled", lambda r: r.update(publicInputs=1)),
            ("compiled", lambda r: r.update(sha256="0" * 64)),
            ("compiled", lambda r: r["commitments"][0].update(privateCommitted=1)),
            ("pkStructure", lambda r: r.update(metadataSha256="0" * 64)),
            ("pkStructure", lambda r: r.update(wires=1)),
            ("pkStructure", lambda r: r.update(fullKeyRelationVerified=True)),
            ("vkExport", lambda r: r.update(soliditySha256="0" * 64)),
            ("vkExport", lambda r: r.update(publicInputs=1)),
            ("vkExport", lambda r: r.update(independentApprovalVerified=True)),
            ("vkExport", lambda r: r.update(unrecognizedApproval=True)),
            ("lineage", lambda r: r.update(nativeMpcReverified=True)),
            ("lineage", lambda r: r.update(keysSha256="0" * 64)),
        ]
        original_plan = copy.deepcopy(self.plan)
        original_bytes = {role: (self.root / (entry["report"] if role == "lineage" else entry)["path"]).read_bytes()
                          for role, entry in self.plan["circuits"]["opening"].items()}
        for number, (role, mutate) in enumerate(cases):
            self.plan = copy.deepcopy(original_plan)
            for saved_role, data in original_bytes.items():
                entry = self.plan["circuits"]["opening"][saved_role]
                (self.root / (entry["report"] if saved_role == "lineage" else entry)["path"]).write_bytes(data)
            self.change_report(role, mutate)
            with self.subTest(number=number, role=role), self.assertRaises(ValueError):
                self.run_check()

    def test_changed_packet_and_missing_input(self):
        entry = self.plan["circuits"]["opening"]
        index = json.loads((self.root / entry["lineage"]["packet"] / "index.json").read_bytes())
        path = self.root / entry["lineage"]["packet"] / (index["rootKeysSha256"] + ".json")
        original = path.read_bytes()
        path.write_text("{}")
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            self.run_check()
        path.write_bytes(original)
        (self.root / entry["vkExport"]["path"]).unlink()
        with self.assertRaises(OSError):
            self.run_check()

    def test_path_escape_non_json_and_symlink_parents(self):
        entry = self.plan["circuits"]["opening"]["vkExport"]
        original = entry["path"]
        for path in ("../escape.json", "/tmp/escape.json", "docs//double.json", "docs/../escape.json", "proving.key"):
            entry["path"] = path
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.run_check()
        entry["path"] = original
        directory = self.root / "redirect"
        directory.symlink_to((self.root / original).parent, target_is_directory=True)
        entry["path"] = "redirect/" + Path(original).name
        with self.assertRaises(OSError):
            self.run_check()

    def test_fifo_file_symlink_and_read_budgets(self):
        entry = self.plan["circuits"]["opening"]["vkExport"]
        path = self.root / entry["path"]
        original = path.read_bytes()
        path.unlink()
        os.mkfifo(path)
        with self.assertRaises(ValueError):
            self.run_check()
        path.unlink()
        target = self.root / "target.json"
        target.write_bytes(original)
        path.symlink_to(target)
        with self.assertRaises(OSError):
            self.run_check()
        path.unlink()
        path.write_bytes(original)
        with patch.object(MODULE, "MAX_TOTAL_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "total budget"):
                self.run_check()
        path.write_bytes(b" " * (MODULE.MAX_JSON_BYTES + 1))
        with self.assertRaisesRegex(ValueError, "bounded regular"):
            self.run_check()

    def test_reopened_inputs_are_private_pinned_copies(self):
        original = MODULE.EVIDENCE.verify
        def inspect_snapshot(path, expected, originals=False):
            self.assertFalse(path.is_relative_to(self.root))
            self.assertFalse(originals)
            # Destroy the original after the snapshot; the delegated verifier
            # must consume only the captured pinned inputs.
            (self.root / self.plan["summary"]["path"]).write_text("{}")
            return original(path, expected, originals)
        with patch.object(MODULE.EVIDENCE, "verify", side_effect=inspect_snapshot):
            result = self.run_check()
        self.assertIs(result["productionApproved"], False)

    def test_cli_failure_never_emits_success_json(self):
        result = self.run_check()
        self.assertEqual(result["status"], "archived-hidden-v2-preflight-consistent")
        data = (self.root / PLAN).read_bytes()
        command = [sys.executable, str(SCRIPT), "--repository", str(self.root), "--plan", PLAN, "--plan-sha256", digest(data)]
        process = subprocess.run(command, capture_output=True, timeout=10)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertFalse(json.loads(process.stdout)["productionApproved"])
        process = subprocess.run(command + ["--plan-sha256", "0" * 64], capture_output=True, timeout=10)
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(process.stdout, b"")


if __name__ == "__main__":
    unittest.main()
