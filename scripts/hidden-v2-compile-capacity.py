#!/usr/bin/env python3
"""Supervise compile-only workers; never runs setup, proving or MPC."""

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import stat
import subprocess
import sys
import time

GIB = 1024**3
FILE_LIMIT = 1024**2
EXPECTED = {
    "invalid-point": (3760005, 2, "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898"),
    "opening": (5139537, 55, "06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f"),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024**2), b""):
            h.update(block)
    return h.hexdigest()


def write_exclusive(path, value):
    data = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
    if len(data) > FILE_LIMIT:
        raise ValueError("report exceeds file budget")
    with open(path, "xb") as f:
        os.chmod(path, 0o600)
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def available_memory():
    for line in Path("/proc/meminfo").read_text().splitlines():
        if line.startswith("MemAvailable:"):
            return int(line.split()[1]) * 1024
    raise RuntimeError("MemAvailable unavailable")


def worker(binary, kind, output, address_bytes, cpu_seconds, parent_pid):
    # Applied before exec, with no preexec_fn and no shell. The pinned compile
    # path is a single Go process; RLIMIT_AS/CPU are per-process, not group quotas.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
        raise OSError(ctypes.get_errno(), "PR_SET_PDEATHSIG failed")
    if os.getppid() != parent_pid:
        raise RuntimeError("supervisor exited before worker initialization")
    for key, value in ((resource.RLIMIT_AS, address_bytes),
                       (resource.RLIMIT_CPU, cpu_seconds),
                       (resource.RLIMIT_FSIZE, FILE_LIMIT),
                       (resource.RLIMIT_CORE, 0)):
        resource.setrlimit(key, (value, value))
        if resource.getrlimit(key) != (value, value):
            raise RuntimeError("kernel limit readback differs")
    env = dict(os.environ, GOMEMLIMIT="6GiB", GOMAXPROCS="4", GOPROXY="off")
    os.execve(binary, [binary, "--compile-cs-v2", kind, output], env)


def supervise(binary, kind, directory, index, wall_seconds=600, address_bytes=10*GIB,
              cpu_seconds=2400):
    stem = f"{kind}-{index}"
    output = directory / f"{stem}.json"
    log = directory / f"{stem}.log"
    sample = {"kind": kind, "index": index, "status": "incomplete", "exited": False,
              "output": output.name, "log": log.name}
    started = time.monotonic()
    proc = None
    with open(log, "xb") as log_file:
        os.chmod(log, 0o600)
        try:
            proc = subprocess.Popen(
                [sys.executable, str(Path(__file__).resolve()), "worker", binary, kind,
                 str(output), str(address_bytes), str(cpu_seconds), str(os.getpid())],
                stdin=subprocess.DEVNULL, stdout=log_file, stderr=log_file,
                start_new_session=True)
            sample["pid"] = proc.pid
            deadline = started + wall_seconds
            while True:
                pid, status, usage = os.wait4(proc.pid, os.WNOHANG)
                if pid:
                    proc.returncode = os.waitstatus_to_exitcode(status)
                    sample.update(exited=True, exitCode=proc.returncode,
                                  maxRssBytes=usage.ru_maxrss * 1024,
                                  cpuUserSeconds=usage.ru_utime,
                                  cpuSystemSeconds=usage.ru_stime)
                    break
                if time.monotonic() >= deadline:
                    sample["failure"] = "wall-timeout"
                    os.killpg(proc.pid, signal.SIGKILL)
                    _, status, usage = os.wait4(proc.pid, 0)
                    proc.returncode = os.waitstatus_to_exitcode(status)
                    sample.update(exited=True, exitCode=proc.returncode,
                                  maxRssBytes=usage.ru_maxrss * 1024,
                                  cpuUserSeconds=usage.ru_utime,
                                  cpuSystemSeconds=usage.ru_stime)
                    break
                time.sleep(min(0.05, max(0, deadline-time.monotonic())))
            if proc.returncode != 0:
                sample.setdefault("failure", "worker-nonzero-exit")
            elif not output.is_file() or output.stat().st_size > FILE_LIMIT:
                sample["failure"] = "missing-or-oversized-output"
            else:
                sample["compiled"] = read_compiled(output, kind)
                sample["outputSha256"] = sha256(output)
                sample["status"] = "complete"
        except (Exception, KeyboardInterrupt) as exc:
            sample["failure"] = f"{type(exc).__name__}: {exc}"
        finally:
            # No next worker until this child has been reaped. Also terminate any
            # unexpected descendants left in the process group after normal exit.
            if proc is not None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                if proc.returncode is None:
                    proc.wait()
                    sample["exited"] = True
            log_file.flush()
            os.fsync(log_file.fileno())
    sample["wallSeconds"] = time.monotonic() - started
    sample["logSha256"] = sha256(log)
    return sample


def unique_pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate JSON key")
        value[key] = item
    return value


def read_compiled(path, kind):
    value = json.loads(path.read_text(), object_pairs_hook=unique_pairs)
    fields = {"schema", "sha256", "bytes", "constraints", "domain", "publicInputs",
              "secretVariables", "internalVariables", "commitments", "kind",
              "productionApproved", "gameDomainMpcMeasured", "phase2Measured"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("unexpected CS report schema")
    if value["schema"] != "vendetta-hidden-v2-compiled-cs-1" or value["kind"] != kind:
        raise ValueError("wrong CS report context")
    for key in ("bytes", "constraints", "domain", "publicInputs", "secretVariables", "internalVariables"):
        if type(value[key]) is not int or value[key] < 0:
            raise ValueError("invalid CS dimension")
    constraints, public, digest = EXPECTED[kind]
    if (value["constraints"], value["publicInputs"], value["sha256"]) != (constraints, public, digest):
        raise ValueError("compiled CS differs from historical declaration")
    if value["domain"] != 1 << (constraints-1).bit_length() or value["bytes"] == 0:
        raise ValueError("wrong CS domain or size")
    if not isinstance(value["commitments"], list):
        raise ValueError("invalid commitments")
    for commitment in value["commitments"]:
        keys = {"privateCommitted", "publicAndCommitmentCommitted", "publicCommitted", "commitmentIndex"}
        if not isinstance(commitment, dict) or set(commitment) != keys:
            raise ValueError("invalid commitment dimensions")
        if any(type(n) is not int or n < 0 for n in commitment.values()):
            raise ValueError("invalid commitment dimension value")
        if commitment["publicCommitted"] > commitment["publicAndCommitmentCommitted"]:
            raise ValueError("inconsistent public committed count")
    for key in ("productionApproved", "gameDomainMpcMeasured", "phase2Measured"):
        if value[key] is not False:
            raise ValueError("compile-only report claims additional approval/evidence")
    return value


def run(binary, binary_digest, directory, source_digest):
    binary = Path(binary).resolve(strict=True)
    if not stat.S_ISREG(binary.stat().st_mode) or sha256(binary) != binary_digest:
        raise ValueError("binary pin differs")
    if not directory.is_absolute():
        raise ValueError("output directory must be absolute")
    parent = directory.parent.resolve(strict=True)
    if any((p / ".git").exists() for p in (parent, *parent.parents)):
        raise ValueError("output must be outside Git")
    directory = parent / directory.name
    directory.mkdir(mode=0o700)
    report = {"schema": "vendetta-hidden-v2-compile-capacity-1", "status": "incomplete",
              "sourceBundleSha256": source_digest, "binarySha256": binary_digest,
              "sourceBundleBinding": "caller-pinned-build-not-attestation",
              "limits": {"addressSpaceBytes": 10*GIB, "cpuSecondsPerProcess": 2400,
                         "wallSeconds": 600, "fileBytes": FILE_LIMIT,
                         "gomaxprocs": 4, "goMemoryTargetBytes": 6*GIB,
                         "memoryPolicy": "kernel-RLIMIT_AS-not-cgroup-RSS",
                         "cpuPolicy": "kernel-RLIMIT_CPU-not-core-quota"},
              "samples": [], "productionApproved": False,
              "gameCircuitBytesVerified": False, "gameDomainMpcMeasured": False,
              "phase2Measured": False, "allStartedWorkersExited": True}
    try:
        for kind in EXPECTED:
            first = None
            for index in (1, 2):
                available = available_memory()
                if available < 14*GIB:
                    raise RuntimeError("host MemAvailable below 14 GiB; no worker started")
                if sha256(binary) != binary_digest:
                    raise RuntimeError("binary changed")
                sample = supervise(str(binary), kind, directory, index)
                sample["hostAvailableBytesBeforeStart"] = available
                report["samples"].append(sample)
                report["allStartedWorkersExited"] &= sample["exited"]
                if sample["status"] != "complete":
                    raise RuntimeError(sample.get("failure", "worker incomplete"))
                if first is not None and first != sample["compiled"]:
                    raise RuntimeError("fresh compilations differ")
                first = sample["compiled"]
        if sha256(binary) != binary_digest:
            raise RuntimeError("binary changed during run")
        report["status"] = "complete"
        report["gameCircuitBytesVerified"] = True
    except Exception as exc:
        report["failure"] = f"{type(exc).__name__}: {exc}"
    finally:
        write_exclusive(directory / "compile-report.json", report)
    return report


def main():
    def terminate(signum, frame):
        raise KeyboardInterrupt(f"signal {signum}")
    signal.signal(signal.SIGTERM, terminate)
    if len(sys.argv) == 8 and sys.argv[1] == "worker":
        worker(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]),
               int(sys.argv[6]), int(sys.argv[7]))
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--binary-sha256", required=True)
    parser.add_argument("--source-bundle-sha256", required=True)
    parser.add_argument("--directory", required=True, type=Path)
    args = parser.parse_args()
    for digest in (args.binary_sha256, args.source_bundle_sha256):
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            parser.error("pins must be lowercase SHA-256 hex")
    result = run(args.binary, args.binary_sha256, args.directory, args.source_bundle_sha256)
    print(json.dumps(result))
    if result["status"] != "complete":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
