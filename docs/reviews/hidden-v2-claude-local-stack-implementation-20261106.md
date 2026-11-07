I reviewed only the pasted code and ran nothing. **Fix findings 1–3 before the smoke test**, because they break teardown or the browser path. The Vite and passkey findings rely on my knowledge of those tools, so confirm them against your installed Vite and app code.

## Fix before smoke
1. **SIGTERM can bypass ordered teardown (`stack.ts`, `createViteServer`).** In non-middleware mode, Vite installs its own SIGTERM handler, and newer versions also handle SIGHUP. It closes Vite and then calls `process.exit()`. That can kill the orchestrator during the keeper's 5s stop window, leaving detached Anvil, keeper or native processes running and no `closed.json`.
   - **Fix:** Use `server.middlewareMode: true`, `appType: "spa"` and `hmr.server` with your own HTTP server. Bind it to the web port and close it after `web.close()`.
   - **Check:** Look for `setupSIGTERMListener` or `process.once('SIGTERM'` in the installed Vite.

2. **A second signal kills the orchestrator (`local-hidden.ts`).** `process.once` restores the default action after the first signal, so a second Ctrl+C or a duplicate forwarded by a package runner ends the orchestrator mid-teardown. Detached children then survive. Use `process.on`, since `abort()` is idempotent, and keep the existing removal in `finally`.

3. **Passkeys likely fail at `http://127.0.0.1:15173`.** WebAuthn doesn't accept an IP address as an RP ID, so `navigator.credentials` should fail with `SecurityError`. If the local UI relies on passkeys, keep binding to `127.0.0.1` but publish and open `http://localhost:<port>`. Anvil's default permissive CORS should still allow the `127.0.0.1` RPC URL.

## Lifecycle and failure handling
4. **Startup cleanup can be skipped or hide the cause (`stack.ts`, final `catch`).** If writing `failed.json` throws, `close()` never runs. If `close()` rejects, its error replaces the startup error. Make the receipt write best-effort, always call `close()`, and throw an `AggregateError` if both fail.

5. **Authenticated producer readiness isn't implemented.** The code only waits for `listen()`, so a token or access-format mismatch appears only on the first certificate job. Make an authenticated metrics request before starting the keeper, and fail startup unless it succeeds.

6. **The 120s forge timeout may be too short (`runForge`).** The isolated cache makes every run a full compile, and build and deploy share the same limit. Measure a clean build with your real profile, then give build its own timeout.

7. **Dependent failures are slow or misleading.** If Anvil dies during `receipt()`, you wait 60s and `failed.json` records a timeout instead of the child exit. `runForge` has the same delay, up to 120s, if forge hangs. Race both operations against `processes.failure`.

8. **Runtime failures leave no receipt.** After startup, a crash only reaches stderr, and `closed.json` can still look clean. Pass the failure reason to `close()` and record it there.

9. **Descendants can survive an early child exit (`processes.ts`, `stop`).** The `finished` return skips the group kill, even though the later comment says descendants may outlive the child. Send a best-effort group SIGKILL in that branch too.

## Environment and artifact exposure
10. **Child env isolation doesn't cover in-process code.** Vite, the producer, the beacon code and their dependencies all run in the orchestrator with its full `process.env`. Any `process.env` reader there sees the source environment, including `producerTimeout`, `cacheLimits` or `fetchBeacon` if they read it.
    - **Fix:** Scrub `process.env` to the allowlist at the start of `local-hidden.ts`, then load the stack with `await import("./local-hidden/stack.js")`. The dynamic import matters because static imports run first.

11. **Confirm three behaviors outside the pasted code:**
    - `Deploy.s.sol` doesn't call `vm.writeFile` or write repo-relative paths.
    - `keeper.ts` doesn't load dotenv or a repo `.env`.
    - `apps/web/vite.config.ts` has nothing the app needs beyond React, since `configFile: false` drops aliases, CSS or WASM plugins, and headers.

## Checked with no bug found
- **Config and isolation:** run directory containment, the new-directory guarantee, config and verifier pin checks, and redirected Foundry and Vite output paths.
- **Startup:** build and binary freeze before Anvil, abort handling in `runForge`, and spawn `ENOENT` reaching `close`.
- **Shutdown:** keeper → producer → web → Anvil order is right, and in-flight H3 receipts can finish because Anvil stays up until the producer closes.
- **Secrets:** no private key is persisted by this code, and the bearer token stays in the private run directory and the keeper's environment.

## Minor cleanup
- Replace the duplicate dynamic imports and hashing code with a shared `sha256File`.
- Merge the two `viem/accounts` imports.
- Reword the "existing build artifacts" comment, because the consumers are built during this run.

## Add to the smoke tests
- Send SIGTERM to a ready stack, and separately send SIGINT twice. Assert that `closed.json` exists and every recorded process group is gone.
- Kill Anvil during startup and assert `failed.json` names the child exit.
- Register a passkey through the published URL.