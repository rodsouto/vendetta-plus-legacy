#!/usr/bin/env python3
"""Capture only public native input fields before retries overwrite them in a live session."""
import hashlib
import json
import os
from pathlib import Path
import sys
import time

os.umask(0o077)
run = Path(sys.argv[1]).resolve(strict=True)
assert run.is_absolute() and (run / "session/stack.json").is_file()
public = {"abi", "statement", "packet", "signature"}
while True:
    for source in (run / "session/cache").glob("*.request.json"):
        try:
            if source.stat().st_size > 65536:
                raise ValueError("Oversized input")
            parsed = json.loads(source.read_text())
            record = {key: parsed[key] for key in public if key in parsed}
            if set(record) != public:
                continue
            encoded = json.dumps(record, sort_keys=True, indent=2) + "\n"
            digest = hashlib.sha256(encoded.encode()).hexdigest()
            output = run / f"native-public-input-{digest}.json"
            if not output.exists():
                with output.open("x") as stream:
                    stream.write(encoded)
        except (FileNotFoundError, json.JSONDecodeError):
            pass  # atomic writer/retry in progress; capture the next complete version
    if (run / "session/closed.json").exists():
        break
    time.sleep(0.5)
