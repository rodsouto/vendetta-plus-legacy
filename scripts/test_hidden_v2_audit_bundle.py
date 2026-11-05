import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("audit_bundle", Path(__file__).with_name("hidden-v2-audit-bundle.py"))
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class AuditBundleTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "repo"
        self.root.mkdir()
        self.git("init", "-q")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "--allow-empty", "-qm", "fixture")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args])

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_working_tree_bytes_deleted_files_and_exclusions(self):
        tracked = self.write("contracts/src/Game.sol", b"old")
        deleted = self.write("contracts/src/Deleted.sol", b"deleted")
        self.git("add", ".")
        tracked.write_bytes(b"new")
        deleted.unlink()
        self.write("apps/web/scripts/prover/new.ts", b"untracked")
        self.write(".env.example", b"TOKEN=example")
        for name in [".env", "apps/web/.env.production", "contracts/cache/state.json",
                     "apps/web/.keeper-state/journal.json", "contracts/keys/proving.key",
                     "docs/keys/circuit.bin", "application/legacy.php"]:
            self.write(name, b"must not be included")
        output = self.base / "source.tar.gz"
        manifest = bundle.create(self.root, output)
        self.assertEqual(set(manifest["files"]), {
            "contracts/src/Game.sol", "apps/web/scripts/prover/new.ts", ".env.example",
        })
        with tarfile.open(output) as archive:
            self.assertEqual(archive.extractfile("source/contracts/src/Game.sol").read(), b"new")
        self.assertEqual(bundle.verify(output), manifest)

    def test_reproducible_and_no_overwrite(self):
        self.write("contracts/src/Game.sol", b"code")
        first, second = self.base / "one.tar.gz", self.base / "two.tar.gz"
        bundle.create(self.root, first)
        bundle.create(self.root, second)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        before = first.read_bytes()
        with self.assertRaises(FileExistsError):
            bundle.create(self.root, first)
        self.assertEqual(first.read_bytes(), before)

    def test_symlink_and_in_tree_output_rejected(self):
        external = self.base / "secret"
        external.write_bytes(b"private")
        link = self.write("contracts/src/Link.sol", b"")
        link.unlink()
        link.symlink_to(external)
        with self.assertRaisesRegex(ValueError, "regular file"):
            bundle.create(self.root, self.base / "link.tar.gz")
        link.unlink()
        with self.assertRaisesRegex(ValueError, "outside"):
            bundle.create(self.root, self.root / "bundle.tar.gz")

    def test_source_change_during_packaging_prevents_publication(self):
        source = self.write("contracts/src/Game.sol", b"before")
        original = bundle.inventory
        calls = 0

        def changing_inventory(root):
            nonlocal calls
            calls += 1
            if calls == 2:
                source.write_bytes(b"after")
            return original(root)

        output = self.base / "changed.tar.gz"
        with patch.object(bundle, "inventory", side_effect=changing_inventory):
            with self.assertRaisesRegex(ValueError, "Sources changed"):
                bundle.create(self.root, output)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.base.glob(".hidden-v2-audit-*")), [])

    def test_verify_rejects_tamper_extra_member_and_unsafe_path(self):
        self.write("contracts/src/Game.sol", b"code")
        output = self.base / "original.tar.gz"
        bundle.create(self.root, output)
        with tarfile.open(output) as archive:
            original = [(m.name, archive.extractfile(m).read()) for m in archive.getmembers()]
        for kind in ["tamper", "extra", "traversal", "duplicate", "symlink"]:
            with self.subTest(kind=kind):
                members = list(original)
                if kind == "tamper":
                    members[1] = (members[1][0], b"evil")
                elif kind == "extra":
                    members.append(("source/extra.ts", b"extra"))
                elif kind == "duplicate":
                    members.append(members[1])
                elif kind == "traversal":
                    manifest = json.loads(members[0][1])
                    manifest["files"]["../escape"] = manifest["files"].pop("contracts/src/Game.sol")
                    members = [("audit-manifest.json", bundle.canonical(manifest)), ("source/../escape", b"code")]
                damaged = self.base / (kind + ".tar.gz")
                with tarfile.open(damaged, "w:gz") as archive:
                    for name, data in members:
                        entry = tarfile.TarInfo(name)
                        entry.mode, entry.size = 0o644, len(data)
                        if kind == "symlink" and name.startswith("source/"):
                            entry.type, entry.linkname, entry.size = tarfile.SYMTYPE, "/etc/passwd", 0
                        archive.addfile(entry, io.BytesIO(data))
                with self.assertRaises(ValueError):
                    bundle.verify(damaged)


if __name__ == "__main__":
    unittest.main()
