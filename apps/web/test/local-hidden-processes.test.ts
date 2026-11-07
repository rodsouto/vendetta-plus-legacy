import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireStateLease } from "../scripts/state-lease.js";
import { LocalProcesses } from "../scripts/local-hidden/processes.js";
import { assertPortAvailable } from "../scripts/local-hidden/stack.js";
import { createServer } from "node:net";
let dir: string, processes: LocalProcesses;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vendetta-local-processes-"));
  processes = new LocalProcesses();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await processes.stopAll();
  await rm(dir, { recursive: true, force: true });
});
it("reports an unexpected daemon exit and retains its log", async () => {
  const child = processes.start(
    process.execPath,
    ["-e", "console.log('fixture exit')"],
    join(dir, "child.log"),
    process.env,
    dir,
  );
  await expect(processes.failure).rejects.toThrow("Local child exited");
  await child.closed;
  expect(await readFile(join(dir, "child.log"), "utf8")).toContain("fixture exit");
});
it("never signals completed one-shot PIDs during later cleanup", async () => {
  const child = processes.start(
    process.execPath,
    ["-e", ""],
    join(dir, "child.log"),
    process.env,
    dir,
    false,
  );
  await child.closed;
  processes.check();
  const kill = vi.spyOn(process, "kill");
  await processes.stop(child);
  await processes.stopAll();
  expect(kill).not.toHaveBeenCalled();
});
it("kills an owned process group after its graceful shutdown deadline", async () => {
  const child = processes.start(
    process.execPath,
    ["-e", "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],
    join(dir, "child.log"),
    process.env,
    dir,
  );
  const deadline = Date.now() + 3000;
  while (!(await readFile(join(dir, "child.log"), "utf8")).includes("ready")) {
    if (Date.now() > deadline) throw new Error("fixture failed to start");
    await new Promise((r) => setTimeout(r, 20));
  }
  const first = processes.stop(child);
  expect(processes.stop(child)).toBe(first);
  await first;
  expect((await child.closed).signal).toBe("SIGKILL");
  processes.check();
}, 10000);
it("rejects an occupied loopback port without taking over the listener", async () => {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    await expect(assertPortAvailable(address.port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(server.listening).toBe(true);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});

it("reaps surviving group members immediately when their direct parent exits", async () => {
  const code =
    "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(child.pid);process.exit(0)";
  const child = processes.start(
    process.execPath,
    ["-e", code],
    join(dir, "parent.log"),
    process.env,
    dir,
  );
  await expect(processes.failure).rejects.toThrow("Local child exited");
  await child.closed;
  const pid = Number((await readFile(join(dir, "parent.log"), "utf8")).trim());
  expect(pid).toBeGreaterThan(0);
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      const status = await readFile(`/proc/${pid}/stat`, "utf8");
      if (status.slice(status.lastIndexOf(")") + 2).startsWith("Z ")) break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
    if (Date.now() > deadline) throw new Error("owned descendant survived group cleanup");
    await new Promise((r) => setTimeout(r, 20));
  }
});

it("retains the session lease in an owned child after the launcher releases its descriptor", async () => {
  const lease = await acquireStateLease(dir);
  processes = new LocalProcesses(lease.fd);
  try {
    const child = processes.start(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      join(dir, "lease-child.log"),
      process.env,
      dir,
    );
    await lease.release();
    await expect(acquireStateLease(dir)).rejects.toThrow("already in use");
    await processes.stop(child);
    const next = await acquireStateLease(dir);
    await next.release();
  } finally {
    await lease.release();
  }
});

it("allows a per-process graceful stop budget for a slow child", async () => {
  const child = processes.start(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),150));console.log('ready');setInterval(()=>{},1000)",
    ],
    join(dir, "slow-child.log"),
    process.env,
    dir,
    true,
    1000,
  );
  const deadline = Date.now() + 3000;
  while (!(await readFile(join(dir, "slow-child.log"), "utf8")).includes("ready")) {
    if (Date.now() > deadline) throw new Error("fixture failed to start");
    await new Promise((r) => setTimeout(r, 20));
  }
  await processes.stop(child);
  expect(await child.closed).toMatchObject({ code: 0, signal: null });
});

it("enforces a shorter custom stop deadline rather than the default", async () => {
  const child = processes.start(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),500));console.log('ready');setInterval(()=>{},1000)",
    ],
    join(dir, "short-stop.log"),
    process.env,
    dir,
    true,
    50,
  );
  const deadline = Date.now() + 3000;
  while (!(await readFile(join(dir, "short-stop.log"), "utf8")).includes("ready")) {
    if (Date.now() > deadline) throw new Error("fixture failed to start");
    await new Promise((r) => setTimeout(r, 20));
  }
  await processes.stop(child);
  expect((await child.closed).signal).toBe("SIGKILL");
});

it("rejects a failed one-shot even when it leaves plausible output before exit", async () => {
  const child = processes.start(
    process.execPath,
    ["-e", "console.log('{\"transactions\":[]}');process.exit(1)"],
    join(dir, "failed-script.log"),
    process.env,
    dir,
    false,
  );
  await expect(Promise.race([child.closed, processes.failure])).rejects.toThrow(
    "Local child exited",
  );
  expect(() => processes.check()).toThrow("Local child exited");
  expect((await child.closed).code).toBe(1);
});
