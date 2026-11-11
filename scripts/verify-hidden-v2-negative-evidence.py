#!/usr/bin/env python3
"""Independent public evidence checks; no RPC, secrets, setup or proving."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--allow-partial", action="store_true")
args = parser.parse_args()
root = args.directory.resolve(strict=True)
read = lambda name: json.loads((root / name).read_text())
lookup = lambda world, field, key: dict(world[field]["map"])[str(key)]
world = lambda name: read(name)["world"]
event_topic = "0x210f54023c853d69b3d4ddae3f11caf19d55a1f6f12d5b3532b661be6de8427c"
results = read("results.json")
assert len(results) == 20 and len({r["name"] for r in results}) == 20
reviewed = []
faults = {"fake-signature", "wrong-round-signature", "beacon-unavailable", "producer-unavailable"}
for result in results:
    name = result["name"]
    if result["status"] != "PASS":
        reviewed.append({"name": name, "status": result["status"]})
        continue
    if name in faults:
        baseline = world("bad-mac-admitted-world.json")
        pending = world(name + "-pending-world.json")
        assert pending == baseline, name
        assert read("bad-mac-http-" + name + ".json")["status"] == 503, name
        assert next(r for r in results if r["name"] == "bad-mac")["status"] == "PASS"
        reviewed.append({"name": name, "status": "PASS", "scope": "HTTP 503, full World unchanged and PENDING; healthy recovery completed"})
        continue
    request = read(name + "-request.json")
    context = read(name + "-context.json")
    item = read(name + "-packet.json")
    mission = request["mission"]
    admitted = world(name + "-admitted-world.json")
    expected_valid = name in {"transport-cargo", "max-salt"}
    event = read(name + "-events.json")
    assert event == [{"eventName": "HiddenEvidenceRecorded", "args": {"mission": mission, "valid": expected_valid}}], name
    keccak = lambda value: subprocess.check_output(["cast", "keccak", value], text=True).strip()
    assert keccak(context["abi"]) == context["statement"] == request["statement"]
    encoded = bytes.fromhex(context["abi"][2:])
    words = [int.from_bytes(encoded[i:i + 32], "big") for i in range(0, len(encoded), 32)]
    assert len(words) == 20 and words[1] == 31337 and words[3] == int(mission)
    assert words[19] == int(keccak(request["packet"]), 16)
    certificate = read(name + "-certificate.json")
    inputs = bytes.fromhex(certificate["encodedInputs"][2:])
    fields = [int.from_bytes(inputs[i:i+32], "big") for i in range(0, len(inputs), 32)]
    if name.startswith("u-"):
        assert certificate["kind"] == 2 and len(fields) == 2
        assert (fields[0] << 128) | fields[1] == int(context["statement"], 16)
    else:
        assert certificate["kind"] == 1 and len(fields) == 55
        assert (fields[48] << 128) | fields[49] == int(context["statement"], 16)
        assert fields[14] == 1 and fields[50] == int(expected_valid)
        assert fields[45] == (0 if name == "bad-mac" else 1)
        assert fields[46] == (0 if name == "bad-tag" else 1)
    packet = bytes.fromhex(request["packet"][2:])
    assert len(packet) == 273 and int.from_bytes(packet[36:44], "big") == words[15]
    assert 1692803367 + (words[15] - 1) * 3 == words[14] + 15
    assert world(name + "-rejected-proof-pending-world.json") == admitted
    assert read(name + "-rejected-proof.json")["receipt"]["status"] == "reverted"
    submitted = read(name + "-submit-receipt.json")
    logs = [log for log in submitted["logs"] if log["topics"][0] == event_topic]
    assert submitted["status"] == "success" and len(logs) == 1
    assert int(logs[0]["topics"][1], 16) == int(mission)
    assert int(logs[0]["data"], 16) == int(expected_valid)
    for suffix in ["duplicate", "duplicate-after-return"]:
        receipt = read(name + "-" + suffix + "-receipt.json")
        assert receipt["status"] == "success"
        assert not any(log["topics"][0] == event_topic for log in receipt["logs"])
    if not name.startswith("u-"):
        h3 = read("h3-public-states.json")[name + "-certificate.json"]
        pre, scalar, next_index, accepted_at, status = h3["state"]
        assert pre == h3["pre"] and int(scalar) == int(h3["publicScalar"])
        assert status == 2 and 1 <= accepted_at < 65535 and next_index == accepted_at + 1
        order = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001
        for index in range(1, accepted_at + 1):
            digest = bytearray(hashlib.sha256(index.to_bytes(2, "little") + bytes.fromhex(pre[2:])).digest())
            digest[0] >>= 1
            candidate = int.from_bytes(digest, "big")
            assert candidate >= order if index < accepted_at else candidate == int(scalar) < order
    original = lookup(admitted, "hiddenEvidence", mission)["receipt"]
    assert original["status"] == 1 and not original["consumed"]
    for suffix in ["resolved", "returned", "final"]:
        actual = world(name + "-" + suffix + "-world.json")
        receipt = lookup(actual, "hiddenEvidence", mission)["receipt"]
        assert receipt["status"] == (2 if expected_valid else 3) and receipt["consumed"]
        assert receipt["arrival"] == original["arrival"] == context["arrival"]
        assert receipt["seq"] == original["seq"] == context["seq"]
    final = world(name + "-final-world.json")
    assert mission not in dict(final["missions"]["map"])
    assert final == read(name + "-punctual-world.json"), name
    if name == "max-salt":
        assert int(item["plain"]["salt"]) == (1 << 256) - 1
    if name == "transport-cargo":
        assert item["cargo"][0] == "1" and item["plain"]["kind"] == 3
    reviewed.append({"name": name, "status": "PASS", "valid": expected_valid, "mission": mission, "fullWorldEqual": True, "originalArrivalSeq": True, "singleRecord": True, "rejectedProofPending": True, "duplicateNoCredit": True})
report = {"review": "offline public artifacts and receipts", "gameTimeScale": read("source.json").get("gameTimeScale", 1), "cases": reviewed}
(root / "evidence-review.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"pass": sum(r["status"] == "PASS" for r in reviewed), "fail": sum(r["status"] == "FAIL" for r in reviewed), "notRun": sum(r["status"] == "NO EJECUTADO" for r in reviewed)}))
if not args.allow_partial:
    assert all(r["status"] == "PASS" for r in reviewed), "Acceptance matrix incomplete"
