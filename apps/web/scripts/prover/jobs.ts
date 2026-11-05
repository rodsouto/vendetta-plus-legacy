import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

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
  options: ExecFileOptions = {},
) {
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
