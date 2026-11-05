// Linux-only benchmark sampler. Never wraps the prover: runProducer retains
// ownership of the native PID and its timeout/SIGKILL semantics.
import { execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { performance } from "node:perf_hooks";

export function parseProcessStat(stat: string, ticks: number, pageBytes: number) {
  // comm may contain spaces and parentheses; fields after its last ')' start at state.
  const fields = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  const cpuSeconds = (Number(fields[11]) + Number(fields[12])) / ticks;
  const rssBytes = Number(fields[21]) * pageBytes;
  const startTicks = fields[19];
  if (!startTicks || !Number.isFinite(cpuSeconds) || !Number.isFinite(rssBytes))
    throw new Error("Invalid /proc process stat");
  return { cpuSeconds, rssBytes, startTicks };
}
export async function producerResources(binary: string, intervalMs = 1000) {
  const executable = await realpath(binary);
  const ticks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));
  const pageBytes = Number(execFileSync("getconf", ["PAGESIZE"], { encoding: "utf8" }));
  const native = new Map<
    string,
    {
      kind: "opening" | "invalid-point";
      cpuSeconds: number;
      peakRssBytes: number;
      samples: number;
    }
  >();
  let peakNodeRssBytes = 0,
    peakNativeRssBytes = 0,
    peakNativeProcesses = 0,
    samples = 0;
  let pending = Promise.resolve();
  let failure: unknown;
  const started = performance.now();
  async function sample() {
    samples++;
    peakNodeRssBytes = Math.max(peakNodeRssBytes, process.memoryUsage().rss);
    // Provers are direct children of this harness's in-process service.
    const children = (await readFile(`/proc/${process.pid}/task/${process.pid}/children`, "utf8"))
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let rss = 0,
      count = 0;
    for (const pid of children) {
      try {
        if ((await realpath(`/proc/${pid}/exe`)) !== executable) continue;
        const args = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
        if (!["--prove-v2", "--prove-worker-v2"].includes(args[1] ?? "")) continue;
        const kind = args[2]?.endsWith("/invalid-point") ? "invalid-point" : "opening";
        const stat = parseProcessStat(
          await readFile(`/proc/${pid}/stat`, "utf8"),
          ticks,
          pageBytes,
        );
        const key = `${pid}-${stat.startTicks}`;
        const entry = native.get(key) ?? { kind, cpuSeconds: 0, peakRssBytes: 0, samples: 0 };
        entry.samples++;
        entry.cpuSeconds = Math.max(entry.cpuSeconds, stat.cpuSeconds);
        entry.peakRssBytes = Math.max(entry.peakRssBytes, stat.rssBytes);
        native.set(key, entry);
        rss += stat.rssBytes;
        count++;
      } catch (error) {
        // Child exit races are normal. Permission/format errors invalidate the measurement.
        if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      }
    }
    peakNativeProcesses = Math.max(peakNativeProcesses, count);
    peakNativeRssBytes = Math.max(peakNativeRssBytes, rss);
  }
  await sample();
  const timer = setInterval(() => {
    pending = pending.then(sample).catch((error: unknown) => {
      failure ??= error;
    });
  }, intervalMs);
  return {
    async stop() {
      clearInterval(timer);
      await pending;
      if (failure) throw failure;
      return {
        intervalMs,
        elapsedMs: performance.now() - started,
        samples,
        peakNodeRssBytes,
        peakNativeRssBytes,
        peakNativeProcesses,
        native: [...native.values()],
        limitation:
          "Sampled Linux RSS and CPU; may miss peaks and final CPU ticks. Node RSS excludes child processes. Not a memory ceiling or leak test.",
      };
    },
  };
}
