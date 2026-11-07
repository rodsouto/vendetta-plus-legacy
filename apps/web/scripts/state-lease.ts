import { spawn } from "node:child_process";
import { constants, openSync, closeSync, fstatSync, lstatSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const lockName = ".vendetta-state.lock";

/** Cooperating Linux processes, private local filesystem, stable directory/lock inode.
 * Keep the lease alive until all state writers have stopped. Never unlink the lock:
 * the kernel releases ownership when this open file description is finally closed.
 * This does not exclude the same signer using a different state directory.
 */
export async function acquireStateLease(directory: string) {
  if (process.platform !== "linux") throw new Error("State leases require Linux flock");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, lockName);
  const fd = openSync(
    path,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    0o600,
  );
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1)
      throw new Error("State lock must be a regular file with one link");
    await new Promise<void>((resolve, reject) => {
      // The child inherits the parent's open file description. Its exit does not
      // release the flock while our descriptor remains open; no daemon/PID lease.
      const child = spawn(
        "flock",
        ["--exclusive", "--nonblock", "--conflict-exit-code", "75", "3"],
        {
          stdio: ["ignore", "pipe", "pipe", fd],
        },
      );
      let failure: Error | undefined;
      let bytes = 0;
      const timer = setTimeout(() => {
        failure ??= new Error("State lease acquisition timed out");
        child.kill("SIGKILL");
      }, 5000);
      child.once("error", (error) => {
        failure ??= error;
      });
      for (const stream of [child.stdout, child.stderr])
        stream?.on("data", (data: Buffer) => {
          bytes += data.length;
          if (bytes > 4096) {
            failure ??= new Error("State lease command exceeded output budget");
            child.kill("SIGKILL");
          }
        });
      child.once("close", (code) => {
        clearTimeout(timer);
        // Wait for close even on spawn/timeout errors before releasing our fd.
        if (failure) reject(failure);
        else if (code === 0) resolve();
        else if (code === 75)
          reject(
            new Error(
              "State directory is already in use; choose a separate cache or KEEPER_STATE_DIR",
            ),
          );
        else reject(new Error("State lease acquisition failed; Linux flock is required"));
      });
    });
    const current = lstatSync(path);
    if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino)
      throw new Error("State lock entry changed during acquisition");
    let released: Promise<void> | undefined;
    // A numeric descriptor has no FileHandle finalizer. Only explicit release
    // or process death closes our reference; native children may hold theirs.
    return { fd, release: () => (released ??= Promise.resolve().then(() => closeSync(fd))) };
  } catch (error) {
    try {
      closeSync(fd);
    } catch (closeError) {
      throw new AggregateError([error, closeError], "State lease acquisition and cleanup failed", {
        cause: error,
      });
    }
    throw error;
  }
}
