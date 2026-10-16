// Stops the e2e graph-node (e2e/serve.sh): Playwright kills the server without letting its trap run.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export default function teardown() {
  const here = dirname(fileURLToPath(import.meta.url));
  execFileSync("bash", [join(here, "../../../packages/indexer/scripts/local.sh"), "down", "8600"]);
}
