import { spawn, type ChildProcess } from "node:child_process";
import { openSync, closeSync } from "node:fs";

export interface ManagedProcess {
  child: ChildProcess;
  closed: Promise<{ code: number | null; signal: string | null; error?: Error }>;
  stopping: boolean;
  finished: boolean;
  stopTimeoutMs: number;
  stopped?: Promise<void>;
}
// Linux process groups belong only to children started here. Never scan/kill by name.
export class LocalProcesses {
  private children: ManagedProcess[] = [];
  private error?: Error;
  private rejectFailure!: (error: Error) => void;
  readonly failure = new Promise<never>((_, reject) => {
    this.rejectFailure = reject;
  });
  constructor(private readonly leaseFd?: number) {
    void this.failure.catch(() => {});
  }
  fail(error: Error) {
    this.error ??= error;
    this.rejectFailure(this.error);
  }
  check() {
    if (this.error) throw this.error;
  }
  start(
    command: string,
    args: string[],
    log: string,
    env: NodeJS.ProcessEnv,
    cwd: string,
    daemon = true,
    stopTimeoutMs = 5000,
  ) {
    this.check();
    const fd = openSync(log, "wx", 0o600);
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        detached: true,
        stdio: this.leaseFd === undefined ? ["ignore", fd, fd] : ["ignore", fd, fd, this.leaseFd],
      });
    } finally {
      closeSync(fd);
    }
    let error: Error | undefined;
    const managed = { child, stopping: false, finished: false, stopTimeoutMs } as ManagedProcess;
    managed.closed = new Promise((resolve) => {
      child.once("error", (cause) => {
        error = cause;
      });
      child.once("close", (code, signal) => {
        managed.finished = true;
        // Clean any surviving group members now, before a completed PID can be
        // recycled during a long interactive session. Never signal old PIDs later.
        if (child.pid)
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== "ESRCH") this.fail(cause as Error);
          }
        if (!managed.stopping && (daemon || code !== 0 || error))
          this.fail(
            new Error("Local child exited: " + command + "; inspect " + log, { cause: error }),
          );
        resolve({ code, signal, error });
      });
    });
    this.children.push(managed);
    return managed;
  }
  stop(process: ManagedProcess): Promise<void> {
    if (process.stopped) return process.stopped;
    if (process.finished) return Promise.resolve();
    process.stopping = true;
    return (process.stopped = (async () => {
      const kill = (signal: NodeJS.Signals) => {
        if (!process.child.pid) return;
        try {
          globalThis.process.kill(-process.child.pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      };
      kill("SIGTERM");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          process.closed,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, process.stopTimeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      // A descendant may outlive the direct child after SIGTERM.
      if (!process.finished) kill("SIGKILL");
      await process.closed;
    })());
  }
  async stopAll() {
    await Promise.all(this.children.map((child) => this.stop(child)));
  }
}
