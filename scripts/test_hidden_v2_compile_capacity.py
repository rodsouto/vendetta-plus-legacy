import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("compile_capacity", Path(__file__).with_name("hidden-v2-compile-capacity.py"))
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


class CompileCapacityTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)

    def executable(self, body):
        binary = self.base / "fake-compiler"
        binary.write_text(f"#!{sys.executable}\n" + body)
        binary.chmod(0o700)
        return binary

    def valid_body(self):
        return f'''import json, pathlib, resource, sys
kind, output = sys.argv[2:]
expectations = {capacity.EXPECTED!r}
n, public, digest = expectations[kind]
print(json.dumps({{"as":resource.getrlimit(resource.RLIMIT_AS), "cpu":resource.getrlimit(resource.RLIMIT_CPU), "file":resource.getrlimit(resource.RLIMIT_FSIZE), "core":resource.getrlimit(resource.RLIMIT_CORE)}}))
pathlib.Path(output).write_text(json.dumps({{
"schema":"vendetta-hidden-v2-compiled-cs-1", "kind":kind, "constraints":n,
"publicInputs":public, "sha256":digest, "domain":1 << (n-1).bit_length(),
"bytes":123, "secretVariables":2, "internalVariables":3, "commitments":[],
"productionApproved":False, "gameDomainMpcMeasured":False, "phase2Measured":False}}))
'''

    def test_worker_limits_and_success(self):
        binary = self.executable(self.valid_body())
        sample = capacity.supervise(str(binary), "opening", self.base, 1,
                                    address_bytes=256*1024**2, cpu_seconds=2)
        self.assertEqual(sample["status"], "complete", sample)
        self.assertTrue(sample["exited"])
        self.assertGreater(sample["maxRssBytes"], 0)
        limits = json.loads((self.base / sample["log"]).read_text())
        self.assertEqual(limits, {"as":[256*1024**2]*2, "cpu":[2,2],
                                  "file":[capacity.FILE_LIMIT]*2, "core":[0,0]})

    def test_timeout_kills_and_reaps(self):
        binary = self.executable("import time\ntime.sleep(30)\n")
        sample = capacity.supervise(str(binary), "opening", self.base, 1, wall_seconds=0.15)
        self.assertEqual(sample["failure"], "wall-timeout")
        self.assertTrue(sample["exited"])
        with self.assertRaises(ProcessLookupError):
            os.kill(sample["pid"], 0)

    def test_worker_dies_when_supervisor_is_killed(self):
        binary = self.executable("import os,time\nprint(os.getpid(),flush=True)\ntime.sleep(30)\n")
        directory = self.base / "death"
        directory.mkdir()
        script = ("import importlib.util,pathlib; "
                  f"s=importlib.util.spec_from_file_location('c',{str(Path(capacity.__file__).resolve())!r}); "
                  "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
                  f"m.supervise({str(binary)!r},'opening',pathlib.Path({str(directory)!r}),1)")
        supervisor = subprocess.Popen([sys.executable, "-c", script])
        worker_pid = None
        try:
            log = directory / "opening-1.log"
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if log.exists() and log.read_text().strip():
                    worker_pid = int(log.read_text().strip())
                    break
                time.sleep(0.02)
            self.assertIsNotNone(worker_pid)
            supervisor.kill()
            supervisor.wait(timeout=5)
            while time.monotonic() < deadline:
                status = Path(f"/proc/{worker_pid}/stat")
                try:
                    state = status.read_text().split(") ", 1)[1]
                except (FileNotFoundError, ProcessLookupError):
                    break
                if state.startswith("Z "):
                    break
                time.sleep(0.02)
            else:
                self.fail("worker survived abrupt supervisor death")
        finally:
            if supervisor.poll() is None:
                supervisor.kill()
                supervisor.wait(timeout=5)
            if worker_pid is not None:
                try:
                    os.killpg(worker_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def test_kernel_limits_fail_without_success(self):
        bodies = {
            "memory": "x=bytearray(512*1024**2)\n",
            "file": "import os\nos.write(1,b'x'*(2*1024**2))\nos.write(1,b'y')\n",
            "cpu": "while True: pass\n",
        }
        for name, body in bodies.items():
            with self.subTest(name=name):
                binary = self.executable(body)
                directory = self.base / name
                directory.mkdir()
                sample = capacity.supervise(str(binary), "opening", directory, 1,
                                            address_bytes=128*1024**2, cpu_seconds=1,
                                            wall_seconds=5)
                self.assertEqual(sample["status"], "incomplete", sample)
                self.assertTrue(sample["exited"])
                self.assertLessEqual((directory / sample["log"]).stat().st_size, capacity.FILE_LIMIT)
                if name == "cpu":
                    self.assertEqual(sample["exitCode"], -signal.SIGKILL)

    def test_bad_report_stops_and_persists_failure(self):
        binary = self.executable("import pathlib,sys\npathlib.Path(sys.argv[3]).write_text('{}')\n")
        directory = self.base / "run"
        with patch.object(capacity, "available_memory", return_value=16*capacity.GIB):
            report = capacity.run(str(binary), capacity.sha256(binary), directory, "a"*64)
        self.assertEqual(report["status"], "incomplete")
        self.assertEqual(len(report["samples"]), 1)
        self.assertFalse(report["gameCircuitBytesVerified"])
        self.assertTrue(report["allStartedWorkersExited"])
        self.assertEqual(json.loads((directory / "compile-report.json").read_text()), report)
        with self.assertRaises(FileExistsError):
            capacity.run(str(binary), capacity.sha256(binary), directory, "a"*64)

    def test_four_fresh_processes_and_no_production_claim(self):
        binary = self.executable(self.valid_body())
        with patch.object(capacity, "available_memory", return_value=16*capacity.GIB):
            report = capacity.run(str(binary), capacity.sha256(binary), self.base / "run", "a"*64)
        self.assertEqual(report["status"], "complete", report)
        self.assertEqual(len({s["pid"] for s in report["samples"]}), 4)
        self.assertTrue(report["gameCircuitBytesVerified"])
        for key in ("productionApproved", "gameDomainMpcMeasured", "phase2Measured"):
            self.assertFalse(report[key])

    def test_pin_and_headroom_refusal(self):
        binary = self.executable(self.valid_body())
        with self.assertRaisesRegex(ValueError, "pin"):
            capacity.run(str(binary), "0"*64, self.base / "wrong", "a"*64)
        self.assertFalse((self.base / "wrong").exists())
        with patch.object(capacity, "available_memory", return_value=capacity.GIB):
            report = capacity.run(str(binary), capacity.sha256(binary), self.base / "low", "a"*64)
        self.assertEqual(report["samples"], [])
        self.assertEqual(report["status"], "incomplete")

    def test_repetition_mismatch_stops_before_next_circuit(self):
        body = self.valid_body() + '''
path = pathlib.Path(output)
value = json.loads(path.read_text())
value["bytes"] = 123 if output.endswith("-1.json") else 124
path.write_text(json.dumps(value))
'''
        binary = self.executable(body)
        with patch.object(capacity, "available_memory", return_value=16*capacity.GIB):
            report = capacity.run(str(binary), capacity.sha256(binary), self.base / "run", "a"*64)
        self.assertEqual(len(report["samples"]), 2)
        self.assertEqual(report["status"], "incomplete")
        self.assertIn("fresh compilations differ", report["failure"])
        self.assertFalse(report["gameCircuitBytesVerified"])

    def test_compiled_report_rejects_mismatch_and_duplicate(self):
        binary = self.executable(self.valid_body())
        sample = capacity.supervise(str(binary), "opening", self.base, 1)
        path = self.base / sample["output"]
        original = path.read_text()
        for replacement in (original.replace('"productionApproved": false', '"productionApproved": true'),
                            original.replace('"bytes": 123', '"bytes": true'),
                            original.replace('"bytes": 123', '"bytes": 123, "bytes": 123'),
                            original.replace(capacity.EXPECTED["opening"][2], "0"*64)):
            path.write_text(replacement)
            with self.assertRaises(ValueError):
                capacity.read_compiled(path, "opening")


if __name__ == "__main__":
    unittest.main()
