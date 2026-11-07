#!/usr/bin/env python3
"""Cross-check pinned archived evidence offline, without rerunning native work."""

from contextlib import ExitStack
import argparse
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path, PurePosixPath
import stat
import tempfile


def local_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LINEAGE = local_module("preflight_lineage", "hidden-v2-receipt-lineage.py")
EVIDENCE = local_module("preflight_evidence", "hidden-v2-completed-evidence.py")
require, pin, exact = LINEAGE.require, LINEAGE.pin, LINEAGE.exact
MAX_JSON_BYTES = 2 << 20
MAX_TOTAL_BYTES = 8 << 20


def relative(name):
    require(isinstance(name, str) and name and "\\" not in name, "Relative POSIX path required")
    path = PurePosixPath(name)
    require(not path.is_absolute() and ".." not in path.parts and str(path) == name and name != ".",
            "Canonical path within repository required")
    return path


class Inputs:
    def __init__(self, root_fd):
        self.fd = root_fd
        self.bytes = 0

    def read(self, reference, limit=MAX_JSON_BYTES):
        exact(reference, "path sha256")
        path = relative(reference["path"])
        require(path.suffix == ".json", "Only archived JSON inputs are supported")
        expected = pin(reference["sha256"])
        with ExitStack() as stack:
            parent = self.fd
            for part in path.parts[:-1]:
                parent = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                stack.callback(os.close, parent)
            fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            stack.callback(os.close, fd)
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit, "Nonempty bounded regular JSON required")
            require(self.bytes + info.st_size <= MAX_TOTAL_BYTES, "Preflight JSON total budget exceeded")
            with os.fdopen(fd, "rb", closefd=False) as source:
                data = source.read(info.st_size + 1)
            require(len(data) == info.st_size, "Archived input changed size")
        self.bytes += len(data)
        require(hashlib.sha256(data).hexdigest() == expected, "Archived input SHA-256 differs")
        return data, LINEAGE.decode(data)


def scope(report, status, true_fields, false_fields, identity_fields):
    exact(report, "status " + true_fields + " " + false_fields + " " + identity_fields)
    require(report["status"] == status, "Archived report type differs")
    for field in true_fields.split():
        require(report.get(field) is True, f"Missing archived assertion: {field}")
    for field in false_fields.split():
        require(report.get(field) is False, f"Archived scope escalation: {field}")


def positive(value):
    return LINEAGE.integer(value, 1, 2 << 30)


def freeze_lineage(inputs, entry, directory):
    exact(entry, "packet indexSha256 report")
    packet_path = relative(entry["packet"])
    index_bytes, index = inputs.read({"path": str(packet_path / "index.json"), "sha256": entry["indexSha256"]}, 65536)
    exact(index, "schema kind rootKeysSha256 documents")
    require(isinstance(index["documents"], dict) and 0 < len(index["documents"]) <= LINEAGE.MAX_DOCUMENTS,
            "Receipt packet document budget differs")
    directory.mkdir()
    (directory / "index.json").write_bytes(index_bytes)
    nodes = {}
    for digest, name in index["documents"].items():
        pin(digest)
        require(name == digest + ".json", "Receipt basename differs")
        data, document = inputs.read({"path": str(packet_path / name), "sha256": digest}, 65536)
        (directory / name).write_bytes(data)
        nodes[digest] = (data, document)
    return nodes


def verify(repository, plan_path, plan_pin):
    with ExitStack() as stack:
        root_fd = os.open(repository, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.callback(os.close, root_fd)
        inputs = Inputs(root_fd)
        _, plan = inputs.read({"path": plan_path, "sha256": plan_pin}, 65536)
        exact(plan, "schema summary circuits")
        require(plan["schema"] == "vendetta-hidden-v2-archived-preflight-1"
                and isinstance(plan["circuits"], dict) and set(plan["circuits"]) == {"opening", "invalid-point"},
                "Preflight requires both archived circuits")
        # Snapshot only already-pinned JSON into a private temporary directory.
        # Existing verifiers may reopen these private copies, never mutable
        # operator paths or external binary locations declared in the reports.
        temporary = stack.enter_context(tempfile.TemporaryDirectory(prefix="vendetta-archived-preflight-"))
        snapshot = Path(temporary)
        summary_bytes, summary = inputs.read(plan["summary"])
        exact(summary, "schema date scope bothMPCDomainsComplete openingInitialization openingPhase2VerifyPeakRssBytes openingKeyExtractionPeakRssBytes newKeyReplay manifests validation proofs evidence unsafeLocalSetup realNetworkDeployment productionApproved hardwareOrSwapConfigurationChanged")
        summary_dir = snapshot / "summary"
        summary_dir.mkdir()
        summary_file = summary_dir / "summary.json"
        summary_file.write_bytes(summary_bytes)
        require(isinstance(summary["evidence"], dict) and set(summary["evidence"]) == EVIDENCE.EVIDENCE_NAMES,
                "Replay evidence inventory differs")
        summary_parent = relative(plan["summary"]["path"]).parent
        for name, record in summary["evidence"].items():
            data, _ = inputs.read({"path": str(summary_parent / name), "sha256": record["copiedSha256"]})
            (summary_dir / name).write_bytes(data)
        replay_result = EVIDENCE.verify(summary_file, plan["summary"]["sha256"], originals=False)
        for proof in summary["proofs"]:
            exact(proof, "original sha256 kind statement setupManifestSha256 valid")
            pin(proof["sha256"])
            pin(proof["setupManifestSha256"])
            require(isinstance(proof["original"], str) and proof["original"]
                    and isinstance(proof["statement"], str) and re.fullmatch(r"0x[0-9a-f]{64}", proof["statement"])
                    and type(proof["valid"]) is bool, "Archived proof metadata differs")
        results = {}
        for kind, entry in plan["circuits"].items():
            exact(entry, "inventory compiled pkStructure vkExport lineage")
            inventory = inputs.read(entry["inventory"])[1]
            compiled = inputs.read(entry["compiled"])[1]
            pk = inputs.read(entry["pkStructure"])[1]
            vk = inputs.read(entry["vkExport"])[1]
            lineage = inputs.read(entry["lineage"]["report"])[1]
            scope(inventory, "unsafe-local-export-inventory-verified", "artifactBytesVerified unsafeLocalSetup",
                  "nativeDecodingPerformed artifactRelationsVerified mpcTranscriptsVerified beaconAfterClosureProven independentApprovalVerified productionApproved",
                  "kind manifestSha256 receiptSha256 bytesChecked artifacts")
            require(inventory["kind"] == kind and inventory["manifestSha256"] == summary["manifests"][kind],
                    "Replay/inventory manifest differs")
            manifest_pin, keys_pin = pin(inventory["manifestSha256"]), pin(inventory["receiptSha256"])
            bodies = inventory["artifacts"]
            require(isinstance(bodies, dict) and set(bodies) == LINEAGE.BODY_NAMES, "Inventory body names differ")
            limits = {"circuit.bin": 400 << 20, "proving.key": 2 << 30,
                      "verifying.key": 64 << 10, "Verifier.sol": 1 << 20}
            for name, record in bodies.items():
                exact(record, "sha256 bytes")
                pin(record["sha256"])
                require(positive(record["bytes"]) <= limits[name], "Archived artifact exceeds its format budget")
            cs_pin = bodies["circuit.bin"]["sha256"]
            packet_dir = snapshot / kind
            nodes = freeze_lineage(inputs, entry["lineage"], packet_dir)
            checked_lineage = LINEAGE.verify(packet_dir, entry["lineage"]["indexSha256"], keys_pin, manifest_pin, cs_pin)
            require(lineage == checked_lineage, "Archived lineage report differs from its pinned packet")
            keys = nodes[keys_pin][1]
            manifest = nodes[manifest_pin][1]
            initial = nodes[keys["initializationSha256"]][1]
            require(all(keys["sha256"][name] == record["sha256"] for name, record in bodies.items()),
                    "Inventory/receipt artifact digest differs")
            expected_bytes = sum(record["bytes"] for record in bodies.values()) + len(nodes[keys_pin][0]) + len(nodes[manifest_pin][0])
            require(type(inventory["bytesChecked"]) is int and inventory["bytesChecked"] == expected_bytes,
                    "Inventory total bytes differ")
            exact(compiled, "schema kind sha256 bytes constraints domain internalVariables secretVariables publicInputs commitments gameDomainMpcMeasured phase2Measured productionApproved")
            require(compiled["productionApproved"] is False and type(compiled["gameDomainMpcMeasured"]) is bool
                    and type(compiled["phase2Measured"]) is bool, "Compiled metadata scope differs")
            require(compiled["schema"] == "vendetta-hidden-v2-compiled-cs-1" and compiled["kind"] == kind
                    and compiled["sha256"] == cs_pin and type(compiled["bytes"]) is int
                    and compiled["bytes"] == bodies["circuit.bin"]["bytes"], "Compiled CS identity/size differs")
            public = LINEAGE.integer(compiled["publicInputs"], 0, 256)
            internal = LINEAGE.integer(compiled["internalVariables"], 0, 1 << 25)
            secret = LINEAGE.integer(compiled["secretVariables"], 0, 1 << 25)
            domain = 1 << (23 if kind == "opening" else 22)
            wires = internal + secret + public + 1
            require(wires <= 1 << 25 and type(compiled["domain"]) is int and compiled["domain"] == domain
                    and type(compiled["constraints"]) is int and compiled["constraints"] == manifest["constraints"]
                    and public == manifest["publicInputs"], "Compiled/inventory dimensions differ")
            require(isinstance(compiled["commitments"], list) and len(compiled["commitments"]) == 1,
                    "Expected one archived game commitment")
            commitment = compiled["commitments"][0]
            exact(commitment, "commitmentIndex privateCommitted publicAndCommitmentCommitted publicCommitted")
            private_committed = LINEAGE.integer(commitment["privateCommitted"], 0, 1 << 25)
            LINEAGE.integer(commitment["commitmentIndex"], public + 1, wires - 1)
            require(initial["shape"]["privateCommitted"] == [private_committed]
                    and initial["shape"]["private"] == internal + secret - private_committed - 1
                    and initial["evaluations"]["wires"] == wires
                    and type(commitment["publicAndCommitmentCommitted"]) is int
                    and commitment["publicAndCommitmentCommitted"] == len(initial["evaluations"]["publicAndCommitmentCommitted"][0])
                    and type(commitment["publicCommitted"]) is int
                    and commitment["publicCommitted"] == commitment["publicAndCommitmentCommitted"],
                    "Compiled/initialization commitment dimensions differ")
            scope(pk, "pk-structure-and-shared-parameters-verified",
                  "dimensionsMatchPinnedMetadata sharedParametersMatchVk vkPointsValidated",
                  "allPkPointsValidated circuitBindingVerified fullKeyRelationVerified mpcTranscriptsVerified productionApproved",
                  "pkSha256 vkSha256 declaredCircuitSha256 bytesRead domain wires metadataSha256")
            require(pk["pkSha256"] == bodies["proving.key"]["sha256"] and pk["vkSha256"] == bodies["verifying.key"]["sha256"]
                    and pk["declaredCircuitSha256"] == cs_pin and pk["metadataSha256"] == entry["compiled"]["sha256"]
                    and type(pk["bytesRead"]) is int and pk["bytesRead"] == bodies["proving.key"]["bytes"]
                    and type(pk["domain"]) is int and pk["domain"] == domain
                    and type(pk["wires"]) is int and pk["wires"] == wires, "PK report identity/dimensions differ")
            scope(vk, "vk-solidity-export-verified", "vkPointsValidated vkCanonical solidityExportMatches",
                  "circuitBindingVerified provingKeyRelationVerified mpcTranscriptsVerified independentApprovalVerified productionApproved",
                  "vkSha256 soliditySha256 publicInputs commitments")
            require(vk["vkSha256"] == bodies["verifying.key"]["sha256"] and vk["soliditySha256"] == bodies["Verifier.sol"]["sha256"]
                    and type(vk["publicInputs"]) is int and vk["publicInputs"] == public
                    and type(vk["commitments"]) is int and vk["commitments"] == 1, "VK report identity/dimensions differ")
            results[kind] = {"manifestSha256": manifest_pin, "keysSha256": keys_pin, "declaredCircuitSha256": cs_pin,
                             "lineageDocumentsChecked": checked_lineage["documentsChecked"],
                             "recordedPublicInputs": public, "recordedWires": wires,
                             "archivedReportBindingsConsistent": True}
        return {"status": "archived-hidden-v2-preflight-consistent", "planSha256": plan_pin,
                "summarySha256": plan["summary"]["sha256"], "sourceJsonBytesRead": inputs.bytes,
                "circuits": results, "recordedProofs": replay_result["proofsInventoried"],
                "archivedReplayMetadataConsistent": True, "privateJsonSnapshotUsed": True,
                "binaryArtifactsRead": False, "nativeWorkRerun": False, "currentArtifactsReverified": False,
                "currentSourceReproductionVerified": False, "independentApprovalVerified": False,
                "productionApproved": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--plan", required=True, help="JSON plan path relative to the repository")
    parser.add_argument("--plan-sha256", required=True)
    args = parser.parse_args()
    try:
        result = verify(args.repository, args.plan, args.plan_sha256)
    except (ValueError, KeyError, TypeError, OSError, RecursionError) as error:
        parser.exit(1, f"Archived preflight failed: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
