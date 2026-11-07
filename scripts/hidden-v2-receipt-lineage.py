#!/usr/bin/env python3
"""Check pinned unsafe local receipt links offline, never MPC or approval."""

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
TOTAL_LIMIT = 2 << 20
MAX_DOCUMENTS = 32
BODY_NAMES = {"circuit.bin", "proving.key", "verifying.key", "Verifier.sol"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pin(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value), "Invalid SHA-256 pin")
    return value


def exact(document, fields):
    require(isinstance(document, dict) and set(document) == set(fields.split()), "Unknown or missing receipt field")


def integer(value, low, high):
    require(type(value) is int and low <= value <= high, "Receipt integer outside bounds")
    return value


def unique(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON field")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError(f"Non-finite JSON constant: {value}")


def finite_float(value):
    result = float(value)
    require(math.isfinite(result), "Non-finite JSON number")
    return result


def decode(data):
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
            require(depth <= 16, "Receipt JSON depth exceeded")
        elif char in (93, 125):
            depth -= 1
    return json.loads(data, object_pairs_hook=unique, parse_constant=reject_constant,
                      parse_float=finite_float)


class Packet:
    def __init__(self, directory_fd):
        self.fd = directory_fd
        self.bytes = 0
        self.documents = {}
        self.used = set()

    def read(self, name, expected):
        pin(expected)
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=self.fd)
        try:
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= JSON_LIMIT, "Nonempty bounded regular JSON required")
            require(self.bytes + info.st_size <= TOTAL_LIMIT, "Receipt packet exceeds total budget")
            with os.fdopen(fd, "rb", closefd=False) as source:
                data = source.read(info.st_size + 1)
            require(len(data) == info.st_size, "Receipt changed size")
        finally:
            os.close(fd)
        self.bytes += len(data)
        require(hashlib.sha256(data).hexdigest() == expected, "Receipt SHA-256 differs")
        return decode(data)

    def get(self, expected):
        pin(expected)
        require(expected in self.documents, "Missing linked receipt")
        if expected not in self.used:
            self.documents[expected] = self.read(expected + ".json", expected)
            self.used.add(expected)
        return self.documents[expected]


def context(document, schema, log2, fields):
    exact(document, fields + " schema log2 productionApproved")
    require(document["schema"] == schema and type(document["log2"]) is int and document["log2"] == log2
            and document["productionApproved"] is False, "Receipt context or unsafe scope differs")


def verify(packet_path, index_pin, keys_pin, manifest_pin, cs_pin):
    for expected in (index_pin, keys_pin, manifest_pin, cs_pin):
        pin(expected)
    with ExitStack() as stack:
        fd = os.open(packet_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.callback(os.close, fd)
        packet = Packet(fd)
        index = packet.read("index.json", index_pin)
        exact(index, "schema kind rootKeysSha256 documents")
        require(index["schema"] == "vendetta-unsafe-local-receipt-packet-1"
                and index["kind"] in ("opening", "invalid-point") and index["rootKeysSha256"] == keys_pin,
                "Receipt packet root differs")
        require(isinstance(index["documents"], dict) and 0 < len(index["documents"]) <= MAX_DOCUMENTS, "Receipt document budget exceeded")
        for digest, name in index["documents"].items():
            pin(digest)
            require(name == digest + ".json", "Receipt path must be its digest basename")
        packet.documents = dict(index["documents"])
        log2 = 23 if index["kind"] == "opening" else 22
        domain = 1 << log2
        keys = packet.get(keys_pin)
        context(keys, "vendetta-unsafe-local-phase2-keys-1", log2,
                "initializationSha256 sourceArtifactSha256 verificationSha256 commonsArtifactSha256 beacon sha256 beaconAfterClosureProven unsafeLocalSetup")
        require(keys["unsafeLocalSetup"] is True and keys["beaconAfterClosureProven"] is False
                and keys["beacon"] == "VENDETTA_UNSAFE_LOCAL_PHASE2_CAPACITY_BEACON_V1", "Unsafe phase-2 seal scope differs")
        require(isinstance(keys["sha256"], dict) and set(keys["sha256"]) == BODY_NAMES | {"manifest.json"}, "Key digest inventory differs")
        for digest in keys["sha256"].values():
            pin(digest)
        require(keys["sha256"]["manifest.json"] == manifest_pin and keys["sha256"]["circuit.bin"] == cs_pin, "Final manifest or CS pin differs")
        manifest = packet.get(manifest_pin)
        exact(manifest, "kind profile constraints publicInputs unsafeLocalSetup sha256")
        require(manifest["kind"] == index["kind"] and manifest["profile"] == "VENDETTA_OPENING_V2"
                and manifest["unsafeLocalSetup"] is True and isinstance(manifest["sha256"], dict)
                and set(manifest["sha256"]) == BODY_NAMES
                and manifest["sha256"] == {name: keys["sha256"][name] for name in BODY_NAMES}, "Manifest/keys binding differs")
        initial_pin = pin(keys["initializationSha256"])
        initial = packet.get(initial_pin)
        context(initial, "vendetta-unsafe-local-phase2-init-1", log2,
                "constraints publicInputs csHash commonsArtifactHash commonsHash shape evaluations initialBytes initialHash evaluationBytes evaluationHash")
        require(initial["csHash"] == cs_pin and initial["commonsArtifactHash"] == keys["commonsArtifactSha256"], "Initialization identity differs")
        constraints = integer(initial["constraints"], domain // 2 + 1, domain)
        public = integer(initial["publicInputs"], 0, 256) + 1
        require(type(manifest["constraints"]) is int and manifest["constraints"] == constraints
                and type(manifest["publicInputs"]) is int and manifest["publicInputs"] == public - 1, "Manifest/init dimensions differ")
        shape, evaluations = initial["shape"], initial["evaluations"]
        exact(shape, "schema circuitSha256 phase domain private privateCommitted")
        require(shape["schema"] == "vendetta-hidden-v2-native-shape-1" and shape["circuitSha256"] == cs_pin
                and type(shape["phase"]) is int and shape["phase"] == 2
                and type(shape["domain"]) is int and shape["domain"] == domain, "Initialization shape differs")
        private = integer(shape["private"], 0, 1 << 25)
        require(isinstance(shape["privateCommitted"], list) and len(shape["privateCommitted"]) == 1, "Expected one game commitment")
        committed = integer(shape["privateCommitted"][0], 0, 1 << 25)
        phase2_bytes = 203 + 32 * (private + domain + committed) + 164
        require(type(initial["initialBytes"]) is int and initial["initialBytes"] == phase2_bytes - 32, "Initialization wire size differs")
        exact(evaluations, "wires public committed publicAndCommitmentCommitted")
        wires = integer(evaluations["wires"], 1, 1 << 25)
        require(type(evaluations["public"]) is int and evaluations["public"] == public
                and evaluations["committed"] == [committed]
                and type(evaluations["committed"][0]) is int
                and wires == private + public + committed + 1, "Evaluation dimensions differ")
        rows = evaluations["publicAndCommitmentCommitted"]
        require(isinstance(rows, list) and len(rows) == 1 and isinstance(rows[0], list), "Evaluation commitment translation differs")
        previous = -1
        for value in rows[0]:
            integer(value, 1, public - 1)
            require(value > previous, "Evaluation translation is not ordered")
            previous = value
        expected_eval = 30 + 32 * (2 * wires + public + 1 + committed) + 64 * wires
        require(type(initial["evaluationBytes"]) is int and initial["evaluationBytes"] == expected_eval, "Evaluation wire size differs")
        for field in ("initialHash", "evaluationHash", "commonsHash"):
            pin(initial[field])

        # Exactly the two local contributions already completed, in reverse order.
        source_pin, verification_pin = keys["sourceArtifactSha256"], keys["verificationSha256"]
        for number in (2, 1):
            artifact = packet.get(source_pin)
            context(artifact, "vendetta-unsafe-local-phase2-artifact-1", log2,
                    "initializationSha256 parentArtifactSha256 bytes sha256")
            require(artifact["initializationSha256"] == initial_pin and type(artifact["bytes"]) is int
                    and artifact["bytes"] == phase2_bytes, "Phase-2 contribution context differs")
            pin(artifact["sha256"])
            verification = packet.get(verification_pin)
            context(verification, "vendetta-unsafe-local-phase2-verification-1", log2,
                    "initializationSha256 sourceArtifactSha256 parentArtifactSha256 previousVerificationSha256 nativeTransitionVerified")
            require(verification["initializationSha256"] == initial_pin and verification["sourceArtifactSha256"] == source_pin
                    and verification["parentArtifactSha256"] == artifact["parentArtifactSha256"]
                    and verification["nativeTransitionVerified"] is True, "Phase-2 verification link differs")
            if number == 1:
                require(artifact["parentArtifactSha256"] == initial_pin and verification["previousVerificationSha256"] == "", "Phase-2 chain does not terminate at init")
            else:
                source_pin = pin(artifact["parentArtifactSha256"])
                verification_pin = pin(verification["previousVerificationSha256"])

        commons = packet.get(keys["commonsArtifactSha256"])
        context(commons, "vendetta-unsafe-local-commons-1", log2,
                "bytes sha256 sourceArtifactSha256 verificationSha256 beacon beaconAfterClosureProven")
        require(type(commons["bytes"]) is int and commons["bytes"] == 192 * domain - 56
                and commons["sha256"] == initial["commonsHash"]
                and commons["beaconAfterClosureProven"] is False
                and commons["beacon"] == "VENDETTA_UNSAFE_LOCAL_PHASE1_CAPACITY_BEACON_V1", "Phase-1 commons/init seal differs")
        source_pin, verification_pin = commons["sourceArtifactSha256"], commons["verificationSha256"]
        for number in (2, 1):
            artifact = packet.get(source_pin)
            schema = artifact["schema"]
            require(schema == "vendetta-unsafe-local-phase1-artifact-2" or
                    (number == 1 and schema == "vendetta-unsafe-local-phase1-artifact-1"), "Phase-1 artifact schema differs")
            fields = "operation bytes sha256" + (" parentArtifactSha256" if schema.endswith("-2") else "")
            context(artifact, schema, log2, fields)
            require(artifact["operation"] == ("first-contribution" if number == 1 else "second-contribution")
                    and type(artifact["bytes"]) is int and artifact["bytes"] == 192 * domain + 265, "Phase-1 artifact context differs")
            pin(artifact["sha256"])
            verification = packet.get(verification_pin)
            context(verification, "vendetta-unsafe-local-phase1-verification-1", log2,
                    "sourceArtifactSha256 previousVerificationSha256 transcriptSha256 anchor nativeTransitionVerified")
            require(verification["sourceArtifactSha256"] == source_pin and verification["transcriptSha256"] == artifact["sha256"]
                    and verification["nativeTransitionVerified"] is True, "Phase-1 verification link differs")
            anchor = verification["anchor"]
            exact(anchor, "schema domain sha256 tauG1 alphaG1 betaG1 betaG2")
            require(anchor["schema"] == "vendetta-local-phase1-anchor-1" and type(anchor["domain"]) is int
                    and anchor["domain"] == domain and anchor["sha256"] == artifact["sha256"], "Phase-1 anchor link differs")
            for field in ("tauG1", "alphaG1", "betaG1"):
                pin(anchor[field])
            require(isinstance(anchor["betaG2"], str) and re.fullmatch(r"[0-9a-f]{128}", anchor["betaG2"]), "Invalid anchor G2 encoding length")
            if number == 1:
                require(artifact.get("parentArtifactSha256", "") == "" and verification["previousVerificationSha256"] == "", "Phase-1 chain has no first contribution")
            else:
                source_pin = pin(artifact["parentArtifactSha256"])
                verification_pin = pin(verification["previousVerificationSha256"])
        require(packet.used == set(packet.documents), "Unused or unreachable indexed receipt")
        return {"status": "unsafe-local-receipt-lineage-consistent", "kind": index["kind"], "indexSha256": index_pin,
                "keysSha256": keys_pin, "manifestSha256": manifest_pin, "declaredCircuitSha256": cs_pin,
                "documentsChecked": len(packet.used), "jsonBytesRead": packet.bytes,
                "phase1ContributionsLinked": 2, "phase2ContributionsLinked": 2,
                "nativeMpcReverified": False, "referencedBinaryBytesVerified": False,
                "participantIdentitiesAuthenticated": False, "closurePublicationAuthenticated": False,
                "beaconAfterClosureProven": False, "independentApprovalVerified": False, "productionApproved": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", type=Path, required=True)
    for name in ("index-sha256", "keys-sha256", "manifest-sha256", "circuit-sha256"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    try:
        result = verify(args.packet, args.index_sha256, args.keys_sha256, args.manifest_sha256, args.circuit_sha256)
    except (ValueError, KeyError, TypeError, OSError, RecursionError) as error:
        parser.exit(1, f"Receipt lineage failed: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
