import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { producerTimeout } from "./jobs.js";

export type WorkerCircuit = "opening" | "invalid-point";
interface WorkerState {
  child: ChildProcessWithoutNullStreams;
  circuit: WorkerCircuit;
  exited: boolean;
  closed: Promise<void>;
  failure?: Error;
  pending?: { id: string; resolve: () => void; reject: (error: Error) => void };
  buffer: string;
  bytes: number;
}

// The caller owns queueing. Reject overlap so a second large setup can never
// start while an earlier job or process is still being released.
export class ProducerWorker {
  private state?: WorkerState;
  private active?: Promise<void>;
  private closing = false;
  private readonly timeout: number;
  constructor(
    private readonly config: {
      binary: string;
      setups: Record<WorkerCircuit, string>;
      timeoutMs?: number;
      env?: NodeJS.ProcessEnv;
      argsPrefix?: string[];
    },
  ) {
    this.timeout = producerTimeout(config.timeoutMs);
  }

  run(job: {
    circuit: WorkerCircuit;
    input: string;
    output: string;
    signal?: AbortSignal;
  }): Promise<void> {
    if (this.closing) return Promise.reject(new Error("Producer worker is closed"));
    if (this.active) return Promise.reject(new Error("Producer worker is busy"));
    const task = this.execute(job);
    this.active = task;
    void task
      .finally(() => {
        if (this.active === task) this.active = undefined;
      })
      .catch(() => {});
    return task;
  }

  private kill(state: WorkerState, error: Error) {
    state.failure ??= error;
    if (!state.exited) state.child.kill("SIGKILL");
  }

  private start(circuit: WorkerCircuit): WorkerState {
    const child = spawn(
      this.config.binary,
      [
        ...(this.config.argsPrefix ?? []),
        "--prove-worker-v2",
        resolve(this.config.setups[circuit]),
      ],
      { env: this.config.env ?? process.env, stdio: "pipe" },
    );
    const state: WorkerState = {
      child,
      circuit,
      exited: false,
      closed: Promise.resolve(),
      buffer: "",
      bytes: 0,
    };
    state.closed = new Promise<void>((done) => {
      child.once("error", () => this.kill(state, new Error("Producer worker failed to start")));
      child.once("close", () => {
        state.exited = true;
        state.pending?.reject(state.failure ?? new Error("Producer worker exited"));
        state.pending = undefined;
        done();
      });
    });
    child.stdin.on("error", () => this.kill(state, new Error("Producer worker input failed")));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      state.bytes += Buffer.byteLength(chunk);
      if (state.bytes > 2 ** 20)
        return this.kill(state, new Error("Producer worker output limit exceeded"));
      state.buffer += chunk;
      let end: number;
      while ((end = state.buffer.indexOf("\n")) !== -1) {
        const line = state.buffer.slice(0, end);
        state.buffer = state.buffer.slice(end + 1);
        if (!line.startsWith("VENDETTA_WORKER_V2_DONE")) continue;
        if (
          !state.pending ||
          state.failure ||
          line !== `VENDETTA_WORKER_V2_DONE ${state.pending.id}`
        ) {
          this.kill(state, new Error("Unexpected producer worker acknowledgement"));
          continue;
        }
        const pending = state.pending;
        state.pending = undefined;
        pending.resolve();
      }
    });
    // Drain logs without retaining request data or allowing an unbounded buffer.
    child.stderr.on("data", (chunk: Buffer) => {
      state.bytes += chunk.length;
      if (state.bytes > 2 ** 20)
        this.kill(state, new Error("Producer worker output limit exceeded"));
    });
    this.state = state;
    return state;
  }

  private async execute(job: {
    circuit: WorkerCircuit;
    input: string;
    output: string;
    signal?: AbortSignal;
  }) {
    let stopped: Error | undefined;
    const stop = (error: Error) => {
      stopped ??= error;
      if (this.state) this.kill(this.state, error);
    };
    const check = () => {
      if (stopped) throw stopped;
      if (this.closing) throw new Error("Producer worker is closed");
    };
    const abort = () => stop(new Error("Producer worker job aborted"));
    job.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop(new Error("Producer worker job timed out")), this.timeout);
    try {
      if (job.signal?.aborted) abort();
      check();
      if (
        this.state &&
        (this.state.circuit !== job.circuit || this.state.exited || this.state.failure)
      ) {
        this.kill(this.state, new Error("Producer worker replaced"));
        await this.state.closed;
        this.state = undefined;
      }
      check();
      // Remove stale results before the job; failed/aborted results are never reusable.
      await rm(job.output, { force: true });
      await rm(job.output + ".tmp", { force: true });
      check();
      const state = this.state ?? this.start(job.circuit);
      state.bytes = 0;
      await new Promise<void>((done, reject) => {
        const id = randomUUID();
        state.pending = { id, resolve: done, reject };
        state.child.stdin.write(
          JSON.stringify({ id, input: resolve(job.input), output: resolve(job.output) }) + "\n",
        );
      });
      check();
      if (state.failure) throw state.failure;
    } catch (error) {
      if (this.state) {
        this.kill(this.state, new Error("Producer worker job failed"));
        await this.state.closed;
        this.state = undefined;
      }
      await rm(job.output, { force: true });
      await rm(job.output + ".tmp", { force: true });
      throw stopped ?? error;
    } finally {
      clearTimeout(timer);
      job.signal?.removeEventListener("abort", abort);
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.state) {
      this.kill(this.state, new Error("Producer worker is closed"));
      await this.state.closed;
    }
    await this.active?.catch(() => {});
    this.state = undefined;
  }
}
