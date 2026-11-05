import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProducerWorker } from "../scripts/prover/worker.js";

let dir: string;
let worker: ProducerWorker;
let sequence = 0;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vendetta-worker-test-"));
  const fixture = join(dir, "worker.cjs");
  await writeFile(
    fixture,
    `
const fs = require('node:fs');
const readline = require('node:readline');
const events = process.env.WORKER_EVENTS;
const prior = fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\\n').map(JSON.parse) : [];
for (const e of prior.filter(e => e.type === 'start')) {
  try { process.kill(e.pid, 0); process.exit(9); } catch (e) { if(e.code !== 'ESRCH') throw e; }
}
fs.appendFileSync(events, JSON.stringify({type:'start', pid:process.pid})+'\\n');
let count=0;
readline.createInterface({input:process.stdin}).on('line', line => {
 const job=JSON.parse(line), mode=JSON.parse(fs.readFileSync(job.input,'utf8')).mode;
 const result=JSON.stringify({pid:process.pid,count:++count,circuit:process.argv.at(-1)});
 fs.writeFileSync(job.output,result);
 if(mode==='crash') { fs.writeFileSync(job.output+'.tmp','partial'); process.exit(2); }
 if(mode==='hang') return;
 if(mode==='flood') { process.stdout.write('x'.repeat(2**20+1)); return; }
 if(mode==='duplicate') { process.stdout.write(('VENDETTA_WORKER_V2_DONE '+job.id+'\\n').repeat(2)); return; }
 const done='VENDETTA_WORKER_V2_DONE '+job.id+'\\n';
 if(mode==='late') setTimeout(()=>process.stdout.write(done),100);
 process.stdout.write('native log\\n'+done.slice(0,10));
 setTimeout(()=>process.stdout.write(done.slice(10)),mode==='slow' ? 100 : 5);
});
`,
  );
  worker = new ProducerWorker({
    binary: process.execPath,
    argsPrefix: [fixture],
    setups: { opening: join(dir, "opening"), "invalid-point": join(dir, "invalid-point") },
    env: { ...process.env, WORKER_EVENTS: join(dir, "events") },
    timeoutMs: 1000,
  });
});
afterEach(async () => {
  await worker.close();
  await rm(dir, { recursive: true, force: true });
});
async function job(mode = "ok", circuit: "opening" | "invalid-point" = "opening") {
  const input = join(dir, `${sequence++}.request.json`),
    output = input + ".proof.json";
  await writeFile(input, JSON.stringify({ mode }));
  return { circuit, input, output };
}
async function result(output: string) {
  return JSON.parse(await readFile(output, "utf8")) as {
    pid: number;
    count: number;
    circuit: string;
  };
}
function expectDead(pid: number) {
  expect(() => process.kill(pid, 0)).toThrow();
}

it("reuses a process, parses split acknowledgements and waits for exit on circuit switches", async () => {
  const first = await job();
  await worker.run(first);
  const a = await result(first.output);
  const second = await job();
  await worker.run(second);
  expect(await result(second.output)).toMatchObject({ pid: a.pid, count: 2 });
  const third = await job("ok", "invalid-point");
  await worker.run(third);
  const b = await result(third.output);
  expect(b.pid).not.toBe(a.pid);
  expect(b.circuit).toBe(join(dir, "invalid-point"));
  expectDead(a.pid);
  const fourth = await job();
  await worker.run(fourth);
  expectDead(b.pid);
});

it.each(["crash", "flood", "duplicate"])(
  "kills and cleans a %s job before restarting",
  async (mode) => {
    const broken = await job(mode);
    await expect(worker.run(broken)).rejects.toThrow();
    await expect(readFile(broken.output)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(broken.output + ".tmp")).rejects.toMatchObject({ code: "ENOENT" });
    const next = await job();
    await worker.run(next);
    expect((await result(next.output)).count).toBe(1);
  },
);

it("times out a blocked process, waits for death and permits a retry", async () => {
  await worker.close();
  worker = new ProducerWorker({
    binary: process.execPath,
    argsPrefix: [join(dir, "worker.cjs")],
    setups: { opening: dir, "invalid-point": dir },
    env: { ...process.env, WORKER_EVENTS: join(dir, "events") },
    timeoutMs: 250,
  });
  const blocked = await job("hang");
  const failure = expect(worker.run(blocked)).rejects.toThrow("timed out");
  await vi.waitFor(async () => {
    await result(blocked.output);
  });
  const { pid } = await result(blocked.output);
  await failure;
  expectDead(pid);
  await worker.run(await job());
});

it("rejects overlap, aborts only after process death and recovers", async () => {
  const controller = new AbortController();
  const blocked = await job("hang");
  const failure = expect(worker.run({ ...blocked, signal: controller.signal })).rejects.toThrow(
    "aborted",
  );
  await vi.waitFor(async () => {
    await result(blocked.output);
  });
  const { pid } = await result(blocked.output);
  await expect(worker.run(await job())).rejects.toThrow("busy");
  controller.abort();
  await failure;
  expectDead(pid);
  await worker.run(await job());
});

it("closes during a job, waits for death, cleans output and rejects subsequent work", async () => {
  const blocked = await job("hang");
  const failure = expect(worker.run(blocked)).rejects.toThrow("closed");
  await vi.waitFor(async () => {
    await result(blocked.output);
  });
  const { pid } = await result(blocked.output);
  await worker.close();
  await failure;
  expectDead(pid);
  await expect(readFile(blocked.output)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(worker.run(await job())).rejects.toThrow("closed");
  await worker.close();
});

it("handles an already aborted job without spawning and recovers from spawn errors", async () => {
  await expect(worker.run({ ...(await job()), signal: AbortSignal.abort() })).rejects.toThrow(
    "aborted",
  );
  await expect(readFile(join(dir, "events"))).rejects.toMatchObject({ code: "ENOENT" });
  await worker.close();
  worker = new ProducerWorker({
    binary: join(dir, "absent"),
    setups: { opening: dir, "invalid-point": dir },
  });
  await expect(worker.run(await job())).rejects.toThrow("failed to start");
  await expect(worker.run(await job())).rejects.toThrow("failed to start");
});

it("restarts after an idle worker crashes", async () => {
  const first = await job();
  await worker.run(first);
  const { pid } = await result(first.output);
  process.kill(pid, "SIGKILL");
  await vi.waitFor(() => expectDead(pid));
  const next = await job();
  await worker.run(next);
  expect((await result(next.output)).pid).not.toBe(pid);
});

it("rejects a delayed acknowledgement from a previous job", async () => {
  const first = await job("late");
  await worker.run(first);
  await expect(worker.run(await job("hang"))).rejects.toThrow(
    "Unexpected producer worker acknowledgement",
  );
  await worker.run(await job());
});

it("gives every warm job a fresh timeout budget", async () => {
  await worker.close();
  worker = new ProducerWorker({
    binary: process.execPath,
    argsPrefix: [join(dir, "worker.cjs")],
    setups: { opening: dir, "invalid-point": dir },
    env: { ...process.env, WORKER_EVENTS: join(dir, "events") },
    timeoutMs: 250,
  });
  const started = performance.now();
  for (let i = 0; i < 3; i++) await worker.run(await job("slow"));
  expect(performance.now() - started).toBeGreaterThan(250);
});
