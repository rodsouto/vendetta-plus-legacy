import { execFile, spawn, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
type ProducerOptions = ExecFileOptions & { stateLeaseFd?: number };

export function producerTimeout(value = 900_000): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
    throw new Error("Invalid producer timeout");
  return value;
}

// Kill the native process before releasing its queue slot; Promise.race would
// leave the large proving job resident while the next one starts.
export async function runProducer(
  binary: string,
  args: string[],
  timeout: number,
  options: ProducerOptions = {},
) {
  if (options.stateLeaseFd !== undefined)
    return runLeasedProducer(binary, args, producerTimeout(timeout), options);
  const job = exec(binary, args, {
    ...options,
    timeout: producerTimeout(timeout),
    killSignal: "SIGKILL",
  });
  const exited = new Promise<void>((done) => job.child.once("close", () => done()));
  try {
    return await job;
  } finally {
    await exited;
  }
}

async function runLeasedProducer(
  binary: string,
  args: string[],
  timeout: number,
  options: ProducerOptions,
) {
  const max = options.maxBuffer ?? 2 ** 20;
  if (!Number.isSafeInteger(max) || max < 1 || max > 2 ** 31 - 1)
    throw new Error("Invalid leased producer output budget");
  const child = spawn(binary, args, {
    ...options,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe", options.stateLeaseFd!],
  });
  const stdout: Buffer[] = [],
    stderr: Buffer[] = [];
  let bytes = 0;
  let failure: Error | undefined;
  const fail = (error: Error) => {
    failure ??= error;
    child.kill("SIGKILL");
  };
  const timer = setTimeout(
    () => fail(Object.assign(new Error("Producer timed out"), { killed: true, signal: "SIGKILL" })),
    timeout,
  );
  for (const [stream, chunks] of [
    [child.stdout, stdout],
    [child.stderr, stderr],
  ] as const)
    stream?.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > max) return fail(new Error("Producer output limit exceeded"));
      chunks.push(data);
    });
  await new Promise<void>((resolve, reject) => {
    child.on("error", (error) => {
      failure ??= error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(Object.assign(new Error("Producer process failed"), { code, signal }));
      else resolve();
    });
  });
  return {
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

export function serialQueue<T>(capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new Error("Invalid producer queue capacity");
  const inflight = new Map<string, Promise<T>>();
  let tail: Promise<unknown> = Promise.resolve();
  let deduplicated = 0,
    rejected = 0;
  const enqueue = (key: string, generate: () => Promise<T>): Promise<T> => {
    const existing = inflight.get(key);
    if (existing) {
      deduplicated++;
      return existing;
    }
    if (inflight.size >= capacity) {
      rejected++;
      return Promise.reject(new Error("Producer queue full; retry later"));
    }
    const job = tail.then(generate);
    tail = job.catch(() => {});
    inflight.set(key, job);
    void job.finally(() => inflight.delete(key)).catch(() => {});
    return job;
  };
  return Object.assign(enqueue, {
    stats: () => ({ pending: inflight.size, deduplicated, rejected, capacity }),
    drain: () => tail.then(() => {}),
  });
}
