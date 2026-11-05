#!/usr/bin/env python3
"""Check archived local replay evidence, without proving or approving a setup."""

import argparse
import hashlib
import json
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


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON field: {key}")
        result[key] = value
    return result


def read_pinned(path, expected):
    require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected),
            "Expected an external lowercase SHA-256 pin")
    require(stat.S_ISREG(path.lstat().st_mode), f"Not a regular file: {path}")
    with path.open("rb") as source:
        data = source.read(MAX_JSON_BYTES + 1)
    require(len(data) <= MAX_JSON_BYTES, f"JSON budget exceeded: {path}")
    require(hashlib.sha256(data).hexdigest() == expected, f"SHA-256 mismatch: {path}")
    return json.loads(data, object_pairs_hook=unique_object)


def verify(summary_path, pin, originals=False):
    summary = read_pinned(summary_path, pin)
    require(summary["schema"] == "vendetta-unsafe-local-mpc-completed-1", "Unknown schema")
    require(summary["unsafeLocalSetup"] is True and summary["productionApproved"] is False
            and summary["realNetworkDeployment"] is False, "Unsafe scope must remain explicit")
    require(summary["bothMPCDomainsComplete"] is True, "Incomplete local MPC")
    manifests = summary["manifests"]
    require(set(manifests) == {"opening", "invalid-point"}, "Expected both circuits")
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
    require(len(proofs) == 3 and replay["proofsGenerated"] == 3, "Expected three proofs")
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
    require(len(measured) == 3, "Expected three worker measurements")
    for sample in measured:
        require(sample["setupManifestSha256"] == manifests[sample["circuit"]], "Worker setup mismatch")
    for kind, record in reports["replay-verifier-runtime.json"].items():
        require(record["setup"] == manifests[kind], "Runtime setup mismatch")
        require(re.fullmatch(r"0x[0-9a-f]{64}", record["runtime"]), "Invalid runtime hash")
    require(set(reports["replay-verifier-runtime.json"]) == set(manifests), "Missing verifier runtime")
    final = summary["newKeyReplay"]
    require(final["proofsGenerated"] == 3 and final["worldEqualPunctualAndDelayed"] is True,
            "Summary replay mismatch")
    for target, source in (("sampledPeakNativeRssBytes", "peakNativeRssBytes"),
                           ("sampledPeakNodeRssBytes", "peakNodeRssBytes"),
                           ("peakNativeProcesses", "peakNativeProcesses")):
        require(final[target] == worker["resources"][source], f"Resource mismatch: {target}")
    require(final["batchElapsedMs"] == worker["batchElapsedMs"], "Elapsed time mismatch")
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
