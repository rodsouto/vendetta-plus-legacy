export {};
const browserCanarySupplied =
  process.env.VITE_UNEXPECTED_BROWSER_SECRET === "local-secret-canary-only";
for (const key of Object.keys(process.env))
  if (!["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"].includes(key)) delete process.env[key];
const { startLocalHiddenStack } = await import("./local-hidden/stack.js");
process.umask(0o077);
const [config, output, ...extra] = process.argv.slice(2);
if (!config?.startsWith("/") || !output?.startsWith("/") || extra.length)
  throw new Error("Usage: local-hidden.ts /absolute/config.json /absolute/new-session-directory");
const controller = new AbortController();
const stop = () => controller.abort(new Error("Local stack stopped by signal"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("SIGHUP", stop);
let stack: Awaited<ReturnType<typeof startLocalHiddenStack>> | undefined;
let failure: unknown;
const fatal = (cause: unknown) => {
  process.exitCode = 1;
  failure = cause instanceof Error ? cause : new Error(String(cause));
  controller.abort(failure);
};
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
try {
  stack = await startLocalHiddenStack(config, output, controller.signal, browserCanarySupplied);
  console.log("Experimental hidden v2 web:", stack.summary.web);
  console.log("Local state and logs:", stack.summary.runDirectory);
  await Promise.race([
    stack.failure,
    new Promise<void>((resolve) => {
      if (controller.signal.aborted) resolve();
      else controller.signal.addEventListener("abort", () => resolve(), { once: true });
    }),
  ]);
  if (failure) throw failure;
} catch (error) {
  if (!stack) process.exitCode = 1;
  if (error !== controller.signal.reason || failure) {
    failure = error;
    throw error;
  }
} finally {
  try {
    await stack?.close(failure);
  } catch (cleanupError) {
    if (failure)
      throw new AggregateError([failure, cleanupError], "Local stack failed during cleanup", {
        cause: failure,
      });
    throw cleanupError;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGHUP", stop);
    process.removeListener("uncaughtException", fatal);
    process.removeListener("unhandledRejection", fatal);
  }
  if (failure) throw failure;
}
