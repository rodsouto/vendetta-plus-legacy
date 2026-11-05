#!/usr/bin/env python3
"""Freeze Git-visible modern sources, including untracked files, without operator state.

This is a source inventory, not an audit approval or a secret content scanner.
Dependencies are pinned by lockfiles; node_modules and the legacy PHP tree are excluded.
"""

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tarfile
import tempfile


SCOPES = ("apps/", "packages/", "contracts/", "docs/", "scripts/", ".github/")
ROOT_FILES = {
    "CLAUDE.md", "AGENTS.md", "README.md", "LICENSE", ".nvmrc", "package.json", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "tsconfig.base.json", ".npmrc", ".env.example",
    ".gitignore", ".prettierignore", ".prettierrc", ".prettierrc.json",
}
EXCLUDED_PARTS = {
    "node_modules", "dist", "out", "cache", "broadcast", "build", "__pycache__",
    ".keeper-state", "test-results", "playwright-report", ".impeccable", ".git",
}
SECRET_SUFFIXES = {".key", ".pem", ".p12", ".pfx", ".bin", ".log", ".tsbuildinfo"}


def canonical(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True) + "\n").encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def included(name):
    p = PurePosixPath(name)
    return (
        not p.is_absolute() and ".." not in p.parts
        and (name in ROOT_FILES or name.startswith(SCOPES))
        and not any(part in EXCLUDED_PARTS for part in p.parts)
        and not any(part.startswith(".env") and part != ".env.example" for part in p.parts)
        and p.suffix not in SECRET_SUFFIXES
    )


def inventory(root):
    names = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    selected = sorted({os.fsdecode(n) for n in names.split(b"\0") if n and included(os.fsdecode(n))})
    files = {}
    for name in selected:
        path = root / name
        # Deleted tracked files must stay absent from a snapshot of the working tree.
        if not path.exists() and not path.is_symlink():
            continue
        if not stat.S_ISREG(path.lstat().st_mode) or path.resolve() != root / name:
            raise ValueError(f"Source must be a regular file without symlink parents: {name}")
        data = path.read_bytes()
        mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
        files[name] = (data, mode)
    return files


def create(root, output):
    root, output = root.resolve(), output.absolute()
    if output.resolve().is_relative_to(root):
        raise ValueError("Write the audit bundle outside the repository")
    files = inventory(root)
    records = {name: {"sha256": digest(data), "size": len(data), "mode": mode}
               for name, (data, mode) in files.items()}
    manifest = {
        "format": "vendetta-hidden-v2-source-bundle-1",
        "baseCommit": git(root, "rev-parse", "HEAD").decode().strip(),
        "scope": "Git-visible modern sources and documentation; working-tree bytes, including untracked files",
        "exclusions": "Legacy PHP tree, installed dependencies, ignored files, build/cache/operator state, keys and binary setup artifacts",
        "approval": "None: source inventory only; production setup and independent audit remain pending",
        "files": records,
    }
    # Fixed headers and gzip timestamp make equal inventories byte-identical.
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".hidden-v2-audit-", dir=output.parent)
    try:
        with os.fdopen(fd, "wb") as raw:
            with gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as zipped:
                with tarfile.open(fileobj=zipped, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                    for name, data, mode in [("audit-manifest.json", canonical(manifest), 0o644)] + [
                        ("source/" + name, data, mode) for name, (data, mode) in files.items()
                    ]:
                        entry = tarfile.TarInfo(name)
                        entry.size, entry.mode = len(data), mode
                        archive.addfile(entry, io.BytesIO(data))
            raw.flush()
            os.fsync(raw.fileno())
        if inventory(root) != files or git(root, "rev-parse", "HEAD").decode().strip() != manifest["baseCommit"]:
            raise ValueError("Sources changed while building the bundle; retry")
        verify(Path(temporary))
        # Atomic publication without overwriting an existing audit artifact.
        os.link(temporary, output)
    finally:
        os.unlink(temporary)
    return manifest


def verify(path):
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)) or any(not m.isfile() for m in members):
            raise ValueError("Duplicate or non-file archive member")
        if "audit-manifest.json" not in names:
            raise ValueError("Missing audit manifest")
        manifest = json.load(archive.extractfile("audit-manifest.json"))
        if manifest.get("format") != "vendetta-hidden-v2-source-bundle-1":
            raise ValueError("Unsupported bundle format")
        records = manifest["files"]
        if set(names) != {"audit-manifest.json"} | {"source/" + n for n in records}:
            raise ValueError("Archive contents do not match inventory")
        for name, record in records.items():
            if not included(name) or str(PurePosixPath(name)) != name:
                raise ValueError(f"Disallowed source path: {name}")
            entry = archive.getmember("source/" + name)
            data = archive.extractfile(entry).read()
            if (digest(data) != record["sha256"] or len(data) != record["size"]
                    or entry.mode != record["mode"] or entry.mode not in (0o644, 0o755)):
                raise ValueError(f"Source mismatch: {name}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["create", "verify"])
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    if args.action == "create":
        root = Path(__file__).resolve().parent.parent
        manifest = create(root, args.archive)
    else:
        manifest = verify(args.archive)
    print(json.dumps({"archive": str(args.archive.absolute()), "sha256": digest(args.archive.read_bytes()),
                      "files": len(manifest["files"]), "baseCommit": manifest["baseCommit"]}, indent=2))


if __name__ == "__main__":
    main()
