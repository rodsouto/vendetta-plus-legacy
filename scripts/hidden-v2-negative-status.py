#!/usr/bin/env python3
"""Read-only progress for a private hidden-v2 negative acceptance directory."""
import datetime
import json
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve(strict=True)
results = json.loads((root / "results.json").read_text()) if (root / "results.json").exists() else []
contexts = sorted(root.glob("*-context.json"), key=lambda path: path.stat().st_mtime)
proofs = list((root / "session/cache").glob("*.proof.json"))
report = {
    "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "current": contexts[-1].name.removesuffix("-context.json") if contexts else "bootstrap",
    "pass": [result["name"] for result in results if result["status"] == "PASS"],
    "fail": [result for result in results if result["status"] == "FAIL"],
    "newProofArtifacts": len(proofs),
    "closed": (root / "session/closed.json").exists(),
}
if (root / "error.json").exists():
    report["error"] = json.loads((root / "error.json").read_text())
print(json.dumps(report))
