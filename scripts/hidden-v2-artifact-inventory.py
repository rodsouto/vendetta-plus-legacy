#!/usr/bin/env python3
"""Inspect a pinned unsafe local key export offline; never authorize production."""

import argparse
from contextlib import ExitStack
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat

JSON_LIMIT = 65536
MAX_BUDGET = 4 << 30
BODIES = {"circuit.bin", "proving.key", "verifying.key", "Verifier.sol"}
NAMES = BODIES | {"manifest.json", "keys.json"}
CIRCUITS = {
    "opening": (23, 5139537, 55, "06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f"),
    "invalid-point": (22, 3760005, 2, "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pin(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value), "Invalid SHA-256 pin")
    return value


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON field: {key}")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError(f"Non-finite JSON constant: {value}")


def finite_float(value):
    result = float(value)
    require(math.isfinite(result), "Non-finite JSON number")
    return result


def read_json(source, size, expected):
    require(size <= JSON_LIMIT, "JSON budget exceeded")
    data = source.read(size + 1)
    require(len(data) == size, "JSON size changed")
    require(hashlib.sha256(data).hexdigest() == pin(expected), "JSON pin mismatch")
    # Bound nesting before handing content to the recursive decoder.
    depth, quoted, escaped = 0, False, False
    for char in data:
        if quoted:
            if escaped:
                escaped = False
            elif char == 92:
                escaped = True
            elif char == 34:
                quoted = False
        elif char == 34:
            quoted = True
        elif char in (91, 123):
            depth += 1
            require(depth <= 16, "JSON depth exceeded")
        elif char in (93, 125):
            depth -= 1
    result = json.loads(data, object_pairs_hook=unique_object,
                        parse_constant=reject_constant, parse_float=finite_float)
    require(isinstance(result, dict), "JSON object required")
    return result


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def inventory(directory_fd):
    names = set()
    with os.scandir(directory_fd) as entries:
        for entry in entries:
            require(len(names) < len(NAMES), "Export inventory differs")
            names.add(entry.name)
    require(names == NAMES, "Export inventory differs")


def inspect(directory, kind, manifest_pin, receipt_pin, budget):
    pin(manifest_pin)
    pin(receipt_pin)
    require(kind in CIRCUITS, "Unknown circuit")
    require(type(budget) is int and 0 < budget <= MAX_BUDGET, "Invalid byte budget")
    with ExitStack() as stack:
        # Bind all opens to the same directory descriptor. Nonblocking opens and
        # fstat reject special files without waiting on an attacker-owned FIFO.
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.callback(os.close, directory_fd)
        inventory(directory_fd)
        streams, before = {}, {}
        for name in sorted(NAMES):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
            stack.callback(os.close, fd)
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_size > 0, f"Nonempty regular file required: {name}")
            before[name] = info
            streams[name] = stack.enter_context(os.fdopen(os.dup(fd), "rb"))
        total = sum(info.st_size for info in before.values())
        require(total <= budget, "Export exceeds byte budget before body reads")
        manifest = read_json(streams["manifest.json"], before["manifest.json"].st_size, manifest_pin)
        receipt = read_json(streams["keys.json"], before["keys.json"].st_size, receipt_pin)
        require(set(manifest) == {"kind", "profile", "unsafeLocalSetup", "constraints", "publicInputs", "sha256"},
                "Unknown or missing manifest field")
        require(set(receipt) == {"schema", "log2", "initializationSha256", "sourceArtifactSha256",
                "verificationSha256", "commonsArtifactSha256", "beacon", "sha256",
                "beaconAfterClosureProven", "unsafeLocalSetup", "productionApproved"},
                "Unknown or missing receipt field")
        require(receipt["beacon"] == "VENDETTA_UNSAFE_LOCAL_PHASE2_CAPACITY_BEACON_V1",
                "Expected fixed unsafe local beacon label")
        log2, constraints, public_inputs, cs_pin = CIRCUITS[kind]
        require(manifest["kind"] == kind and manifest["profile"] == "VENDETTA_OPENING_V2"
                and manifest["unsafeLocalSetup"] is True, "Unsafe manifest context differs")
        require(type(manifest["publicInputs"]) is int and manifest["publicInputs"] == public_inputs,
                "Public input count differs")
        require(type(manifest["constraints"]) is int and manifest["constraints"] == constraints,
                "Constraint count differs")
        require(receipt["schema"] == "vendetta-unsafe-local-phase2-keys-1"
                and type(receipt["log2"]) is int and receipt["log2"] == log2
                and receipt["unsafeLocalSetup"] is True and receipt["productionApproved"] is False
                and receipt["beaconAfterClosureProven"] is False, "Unsafe receipt context differs")
        require(set(manifest["sha256"]) == BODIES and set(receipt["sha256"]) == BODIES | {"manifest.json"},
                "Digest inventory differs")
        require(receipt["sha256"]["manifest.json"] == manifest_pin, "Receipt/manifest pin differs")
        require(manifest["sha256"]["circuit.bin"] == cs_pin, "Circuit identity differs")
        for name in ("initializationSha256", "sourceArtifactSha256", "verificationSha256", "commonsArtifactSha256"):
            pin(receipt[name])
        records = {}
        for name in sorted(BODIES):
            expected = pin(manifest["sha256"][name])
            require(receipt["sha256"][name] == expected, f"Receipt/body pin differs: {name}")
            digest = hashlib.sha256()
            remaining = before[name].st_size
            while remaining:
                block = streams[name].read(min(1 << 20, remaining))
                require(block, f"Body truncated: {name}")
                digest.update(block)
                remaining -= len(block)
            require(not streams[name].read(1), f"Body grew: {name}")
            require(digest.hexdigest() == expected, f"Body SHA-256 differs: {name}")
            records[name] = {"sha256": expected, "bytes": before[name].st_size}
        for name in NAMES:
            require(fingerprint(os.fstat(streams[name].fileno())) == fingerprint(before[name]),
                    f"File changed during inspection: {name}")
            current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            require(fingerprint(current) == fingerprint(before[name]), f"Directory entry changed: {name}")
        inventory(directory_fd)
    return {"status": "unsafe-local-export-inventory-verified", "kind": kind,
            "manifestSha256": manifest_pin, "receiptSha256": receipt_pin,
            "bytesChecked": total, "artifacts": records, "artifactBytesVerified": True,
            "nativeDecodingPerformed": False, "artifactRelationsVerified": False,
            "mpcTranscriptsVerified": False, "beaconAfterClosureProven": False,
            "independentApprovalVerified": False, "unsafeLocalSetup": True, "productionApproved": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--kind", choices=sorted(CIRCUITS), required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--receipt-sha256", required=True)
    parser.add_argument("--max-bytes", type=int, default=JSON_LIMIT)
    args = parser.parse_args()
    try:
        result = inspect(args.directory, args.kind, args.manifest_sha256, args.receipt_sha256, args.max_bytes)
    except (ValueError, KeyError, TypeError, OSError, RecursionError) as error:
        parser.exit(1, f"Artifact inspection failed: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
