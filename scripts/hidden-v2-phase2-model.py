#!/usr/bin/env python3
"""Point payload allocation model from reproduced CS dimensions, not peak RAM."""

import argparse
import hashlib
import json
from pathlib import Path


def model(cs):
    n = cs["domain"]
    internal, secret, public = cs["internalVariables"], cs["secretVariables"], cs["publicInputs"] + 1
    k = len(cs["commitments"])
    committed = sum(c["privateCommitted"] for c in cs["commitments"])
    wires = internal + secret + public
    pkk = internal + secret - committed - k
    vkk = public + k
    if min(n, wires, pkk, vkk) < 0:
        raise ValueError("inconsistent CS dimensions")

    def payload(g1, g2):
        return {"g1Points": g1, "g2Points": g2, "bytes": g1*64 + g2*128}

    pieces = {
        "commons": payload(4*n-1, n+1),
        "lagrangeCoefficients": payload(3*n, n),
        "wireEvaluationsAndTemporaryABC": payload(5*wires, wires),
        "phase2ParametersAllocatedCapacity": payload(n+pkk+committed+1, k+1),
        "evaluationCommitmentAndPublicBases": payload(committed+vkk, 0),
    }
    return {"domain": n, "wires": wires, "commitments": k,
            "privateCommitted": committed, "pkkPoints": pkk, "vkkPoints": vkk,
            "pieces": pieces, "sumOfListedPointPayloadBytes": sum(p["bytes"] for p in pieces.values()),
            "classification": "allocation-inventory-not-simultaneous-live-peak",
            "excludes": ["CS decoded heap", "GC/runtime/allocator rounding", "FFT domains and twiddles",
                         "arithmetic temporaries and update proofs", "read transcripts and wire buffers",
                         "verification and key extraction allocations"],
            "phase2Measured": False, "productionApproved": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compile-report", required=True, type=Path)
    parser.add_argument("--compile-report-sha256", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    data = args.compile_report.read_bytes()
    if hashlib.sha256(data).hexdigest() != args.compile_report_sha256:
        parser.error("compile report pin differs")
    report = json.loads(data)
    if (report.get("schema") != "vendetta-hidden-v2-compile-capacity-1" or
            report.get("status") != "complete" or report.get("gameCircuitBytesVerified") is not True or
            len(report.get("samples", [])) != 4):
        parser.error("requires complete four-worker reproduction report")
    if [(s.get("kind"), s.get("index")) for s in report["samples"]] != [
            ("invalid-point", 1), ("invalid-point", 2), ("opening", 1), ("opening", 2)]:
        parser.error("unexpected circuit repetition order")
    circuits = {}
    for sample in report["samples"]:
        if sample.get("status") != "complete" or sample.get("exited") is not True:
            parser.error("worker incomplete")
        kind = sample["kind"]
        value = model(sample["compiled"])
        if kind in circuits and circuits[kind] != value:
            parser.error("repeated circuit dimensions differ")
        circuits[kind] = value
    if set(circuits) != {"opening", "invalid-point"}:
        parser.error("requires both game circuits")
    output = {"schema": "vendetta-hidden-v2-phase2-allocation-model-1",
              "compileReportSha256": args.compile_report_sha256, "circuits": circuits,
              "phase2Measured": False, "productionApproved": False}
    with args.output.open("x") as f:
        json.dump(output, f, indent=2, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()
