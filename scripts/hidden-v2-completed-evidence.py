#!/usr/bin/env python3
"""Check archived local replay evidence, without proving or approving a setup."""

import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat

MAX_JSON_BYTES = 2 * 1024 * 1024
EVIDENCE_NAMES = {
    "replay-results.json", "replay-worker-results.json", "replay-verifier-runtime.json",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_pin(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value),
            "Expected an external lowercase SHA-256 pin")
    return value


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON field: {key}")
        result[key] = value
    return result


def finite_float(value):
    result = float(value)
    require(math.isfinite(result), "Non-finite JSON number")
    return result


def reject_constant(value):
    raise ValueError(f"Non-finite JSON constant: {value}")


def integer(value, expected=None, minimum=0):
    require(type(value) is int and value >= minimum
            and (expected is None or value == expected), "Invalid archived integer")
    return value


def duration(value):
    require(type(value) in (int, float) and value >= 0
            and (type(value) is int or math.isfinite(value)), "Invalid archived duration")
    return value


def read_pinned(path, expected):
    validate_pin(expected)
    # Validate the opened descriptor, not a path checked before a separate open.
    # NONBLOCK prevents a substituted FIFO from blocking before fstat rejects it.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode), f"Not a regular file: {path}")
        require(0 < info.st_size <= MAX_JSON_BYTES, f"JSON budget exceeded or empty: {path}")
        with os.fdopen(fd, "rb", closefd=False) as source:
            data = source.read(info.st_size + 1)
        require(len(data) == info.st_size, f"JSON size changed: {path}")
    finally:
        os.close(fd)
    require(hashlib.sha256(data).hexdigest() == expected, f"SHA-256 mismatch: {path}")
    return json.loads(data, object_pairs_hook=unique_object,
                      parse_constant=reject_constant, parse_float=finite_float)


def verify(summary_path, pin, originals=False):
    summary = read_pinned(summary_path, pin)
    require(summary["schema"] == "vendetta-unsafe-local-mpc-completed-1", "Unknown schema")
    require(summary["unsafeLocalSetup"] is True and summary["productionApproved"] is False
            and summary["realNetworkDeployment"] is False, "Unsafe scope must remain explicit")
    require(summary["bothMPCDomainsComplete"] is True, "Incomplete local MPC")
    manifests = summary["manifests"]
    require(set(manifests) == {"opening", "invalid-point"}, "Expected both circuits")
    for value in manifests.values():
        validate_pin(value)
    require(set(summary["evidence"]) == EVIDENCE_NAMES, "Unexpected evidence inventory")
    reports = {}
    for name, record in summary["evidence"].items():
        require(record["copiedSha256"] == record["originalSha256"], "Copy/original pin mismatch")
        reports[name] = read_pinned(summary_path.parent / name, record["copiedSha256"])
        if originals:
            read_pinned(Path(record["original"]), record["originalSha256"])
    replay = reports["replay-results.json"]
    require(replay["unsafeLocalSetup"] is True and replay["realNetworkDeployment"] is False,
            "Replay scope mismatch")
    for field in ("punctualAndDelayedFullWorldEqual", "cacheRecheckedAndH3RestoredAfterAnvilRevert",
                  "tamperedRequestRejectedBeforeProving", "forgedInvalidityFlagRejectedWithoutChangingReceipt",
                  "crossMissionInvalidityProofRejected"):
        require(replay[field] is True, f"Missing replay assertion: {field}")
    proofs = summary["proofs"]
    require(isinstance(proofs, list) and len(proofs) == 3, "Expected three proofs")
    integer(replay["proofsGenerated"], 3)
    integer(replay["newlyAdmittedMissions"], 3)
    integer(replay["proofCacheHits"], 3)
    for proof in proofs:
        require(isinstance(proof, dict) and set(proof) == {
            "original", "sha256", "kind", "statement", "setupManifestSha256", "valid"},
            "Proof metadata inventory differs")
        validate_pin(proof["sha256"])
        validate_pin(proof["setupManifestSha256"])
        require(isinstance(proof["original"], str) and proof["original"]
                and isinstance(proof["statement"], str) and re.fullmatch(r"0x[0-9a-f]{64}", proof["statement"])
                and type(proof["valid"]) is bool, "Proof metadata type differs")
    require(len({p["statement"] for p in proofs}) == 3, "Repeated statement")
    require(sorted((p["kind"], str(p["valid"])) for p in proofs) ==
            [("invalid-point", "False"), ("opening", "False"), ("opening", "True")],
            "Expected valid opening, invalid commitment and invalid point")
    for proof in proofs:
        require(proof["setupManifestSha256"] == manifests[proof["kind"]], "Proof setup mismatch")
        if originals:
            actual = read_pinned(Path(proof["original"]), proof["sha256"])
            for field in ("kind", "statement", "setupManifestSha256", "valid"):
                require(type(actual[field]) is type(proof[field]) and actual[field] == proof[field],
                        f"Proof metadata mismatch: {field}")
    worker = reports["replay-worker-results.json"]
    measured = worker["measurements"]
    require(isinstance(measured, list) and len(measured) == 3, "Expected three worker measurements")
    require(Counter(sample["circuit"] for sample in measured) == Counter(proof["kind"] for proof in proofs),
            "Worker measurement circuit distribution differs")
    names, seen = set(), set()
    for sample in measured:
        name = sample["name"]
        require(isinstance(name, str) and name and name not in names, "Worker measurement names differ")
        names.add(name)
        require(sample["setupManifestSha256"] == manifests[sample["circuit"]], "Worker setup mismatch")
        require(type(sample["artifactsReused"]) is bool
                and sample["artifactsReused"] == (sample["circuit"] in seen), "Worker reuse sequence differs")
        seen.add(sample["circuit"])
        integer(sample["nativeElapsedMs"], minimum=1)
        profile = sample["profileMs"]
        require(isinstance(profile, dict) and set(profile) == {
            "artifactIntegrityMs", "prepareAssignmentMs", "loadArtifactsMs", "witnessMs",
            "proveMs", "verifyMs", "encodeMs"}, "Worker profile inventory differs")
        for value in profile.values():
            duration(value)
    for field, count, hits in (("statsBefore", 0, 0), ("statsAfter", 3, 0), ("finalStats", 3, 3)):
        stats = worker[field]
        integer(stats["proofs"], count)
        integer(stats["cacheHits"], hits)
        integer(stats["queue"]["pending"], 0)
    for kind, record in reports["replay-verifier-runtime.json"].items():
        require(record["setup"] == manifests[kind], "Runtime setup mismatch")
        require(re.fullmatch(r"0x[0-9a-f]{64}", record["runtime"]), "Invalid runtime hash")
    require(set(reports["replay-verifier-runtime.json"]) == set(manifests), "Missing verifier runtime")
    final = summary["newKeyReplay"]
    integer(final["proofsGenerated"], 3)
    require(final["worldEqualPunctualAndDelayed"] is True, "Summary replay mismatch")
    for target, source in (("sampledPeakNativeRssBytes", "peakNativeRssBytes"),
                           ("sampledPeakNodeRssBytes", "peakNodeRssBytes"),
                           ("peakNativeProcesses", "peakNativeProcesses")):
        require(integer(final[target], minimum=1) == integer(worker["resources"][source], minimum=1),
                f"Resource mismatch: {target}")
    require(duration(final["batchElapsedMs"]) == duration(worker["batchElapsedMs"])
            and final["batchElapsedMs"] > 0, "Elapsed time mismatch")
    return {"status": "archived-local-evidence-consistent", "summarySha256": pin,
            "originalReportsAndProofsChecked": originals, "proofsInventoried": 3,
            "cryptographicProofsReverified": False, "mpcTranscriptsReverified": False,
            "setupArtifactsRehashed": False, "independentReview": False,
            "productionApproved": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--summary-sha256", required=True)
    parser.add_argument("--originals", action="store_true",
                        help="Also read the small external reports and three proof JSON files")
    args = parser.parse_args()
    try:
        result = verify(args.summary, args.summary_sha256, args.originals)
    except (ValueError, KeyError, TypeError, OSError, RecursionError) as error:
        parser.exit(1, f"Evidence check failed: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
