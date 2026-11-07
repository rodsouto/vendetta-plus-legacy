import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat, symlink, link } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { acquireStateLease } from "../scripts/state-lease.js";
import { pruneCache } from "../scripts/prover/cache.js";

let dir: string;
const releases: (() => Promise<void>)[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vendetta-state-lease-"));
});
afterEach(async () => {
  await Promise.all(releases.splice(0).map((release) => release()));
  await rm(dir, { recursive: true, force: true });
});

it("excludes a second open description and releases idempotently without deleting state", async () => {
  const journal = join(dir, "journal.json");
  await writeFile(journal, '"signed-test-transaction"');
  const first = await acquireStateLease(dir);
  releases.push(first.release);
  const inode = (await stat(join(dir, ".vendetta-state.lock"))).ino;
  await expect(acquireStateLease(dir)).rejects.toThrow("already in use");
  const closed = first.release();
  expect(first.release()).toBe(closed);
  await closed;
  const next = await acquireStateLease(dir);
  releases.push(next.release);
  expect((await stat(join(dir, ".vendetta-state.lock"))).ino).toBe(inode);
  expect(await readFile(journal, "utf8")).toBe('"signed-test-transaction"');
});

it("preserves the live lock inode while pruning owned cache entries", async () => {
  const lease = await acquireStateLease(dir);
  releases.push(lease.release);
  const path = join(dir, ".vendetta-state.lock");
  const inode = (await stat(path)).ino;
  await writeFile(join(dir, "0x" + "1".repeat(64) + ".request.json"), "synthetic");
  expect(await pruneCache(dir, { maxBytes: 1, maxFiles: 1, maxAgeMs: 1 })).toEqual({
    bytes: 0,
    files: 0,
  });
  expect((await stat(path)).ino).toBe(inode);
  await expect(acquireStateLease(dir)).rejects.toThrow("already in use");
});

it("uses kernel ownership across processes and releases on SIGKILL without stale PID recovery", async () => {
  const module = pathToFileURL(
    fileURLToPath(new URL("../scripts/state-lease.ts", import.meta.url)),
  ).href;
  const code = `
    const {acquireStateLease} = await import(${JSON.stringify(module)});
    const lease = await acquireStateLease(process.argv[1]);
    console.log("locked");
    process.stdin.resume();
    await new Promise(done => process.stdin.once("end", done));
    await lease.release();
  `;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code, dir],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const exited = new Promise<void>((done) => child.once("close", () => done()));
  try {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error("Lease child did not start")), 5000);
      child.once("error", reject);
      child.stderr.once("data", (data) => reject(new Error(String(data))));
      child.stdout.once("data", () => {
        clearTimeout(timer);
        done();
      });
    });
    await expect(acquireStateLease(dir)).rejects.toThrow("already in use");
    child.kill("SIGKILL");
    await exited;
    const next = await acquireStateLease(dir);
    releases.push(next.release);
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
}, 10000);

it("rejects final symlinks and hardlinks without changing the target", async () => {
  const target = join(dir, "target");
  const path = join(dir, ".vendetta-state.lock");
  await writeFile(target, "preserve");
  await symlink(target, path);
  await expect(acquireStateLease(dir)).rejects.toMatchObject({ code: "ELOOP" });
  await rm(path);
  await link(target, path);
  await expect(acquireStateLease(dir)).rejects.toThrow("one link");
  expect(await readFile(target, "utf8")).toBe("preserve");
});

it("keeps an orphaned inspection's ownership after SIGKILL of its actual parent", async () => {
  const leaseModule = pathToFileURL(
    fileURLToPath(new URL("../scripts/state-lease.ts", import.meta.url)),
  ).href;
  const jobsModule = pathToFileURL(
    fileURLToPath(new URL("../scripts/prover/jobs.ts", import.meta.url)),
  ).href;
  const pidFile = join(dir, "native-pid");
  const code = `
    const {acquireStateLease}=await import(${JSON.stringify(leaseModule)});
    const {runProducer}=await import(${JSON.stringify(jobsModule)});
    const lease=await acquireStateLease(process.argv[1]);
    await runProducer(process.execPath,["-e", "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",process.argv[2]],30000,{stateLeaseFd:lease.fd});
  `;
  const owner = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code, dir, pidFile],
    { stdio: "ignore" },
  );
  const exited = new Promise<void>((done) => owner.once("close", () => done()));
  let nativePid = 0;
  try {
    await vi.waitFor(
      async () => {
        nativePid = Number(await readFile(pidFile, "utf8"));
      },
      { timeout: 5000 },
    );
    owner.kill("SIGKILL");
    await exited;
    expect(() => process.kill(nativePid, 0)).not.toThrow();
    await expect(acquireStateLease(dir)).rejects.toThrow("already in use");
    process.kill(nativePid, "SIGKILL");
    await vi.waitFor(async () => {
      const lease = await acquireStateLease(dir);
      releases.push(lease.release);
    });
  } finally {
    owner.kill("SIGKILL");
    await exited;
    if (nativePid) {
      try {
        process.kill(nativePid, "SIGKILL");
      } catch {}
    }
  }
}, 10000);

it("does not mistake an acquisition error for the exclusive contention exit code", async () => {
  await writeFile(join(dir, "flock"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  const old = process.env.PATH;
  try {
    process.env.PATH = dir;
    await expect(acquireStateLease(dir)).rejects.toThrow("acquisition failed");
  } finally {
    process.env.PATH = old;
  }
});

it("fails closed when flock is unavailable and permits a subsequent valid start", async () => {
  const old = process.env.PATH;
  try {
    process.env.PATH = "/nonexistent";
    await expect(acquireStateLease(dir)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    process.env.PATH = old;
  }
  const lease = await acquireStateLease(dir);
  releases.push(lease.release);
});

it("bounds and reaps a stuck acquisition command before releasing its descriptor", async () => {
  const command = join(dir, "flock");
  await writeFile(
    command,
    "#!/bin/sh\n/usr/bin/flock --exclusive --nonblock 3 || exit 1\nexec /bin/sleep 30\n",
    { mode: 0o700 },
  );
  const old = process.env.PATH;
  try {
    process.env.PATH = dir;
    await expect(acquireStateLease(dir)).rejects.toThrow("timed out");
  } finally {
    process.env.PATH = old;
  }
  const lease = await acquireStateLease(dir);
  releases.push(lease.release);
}, 10000);
