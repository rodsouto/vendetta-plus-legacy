import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, link, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const fault = vi.hoisted(() => ({ error: undefined as Error | undefined }));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    closeSync: (fd: number) => {
      fs.closeSync(fd);
      if (fault.error) throw fault.error;
    },
  };
});
import { acquireStateLease } from "../scripts/state-lease.js";
it("preserves acquisition and synthetic cleanup-report errors after closing the real fd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-lease-errors-"));
  try {
    await writeFile(join(dir, ".vendetta-state.lock"), "");
    await link(join(dir, ".vendetta-state.lock"), join(dir, "alias"));
    const error = new Error("synthetic close report after real fd close");
    fault.error = error;
    const failure = await acquireStateLease(dir).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    const errors = (failure as AggregateError).errors;
    expect(errors[0].message).toContain("regular file with one link");
    expect(errors[1]).toBe(error);
    expect((failure as Error).cause).toBe(errors[0]);
    fault.error = undefined;
    await expect(acquireStateLease(dir)).rejects.toThrow("regular file with one link");
  } finally {
    fault.error = undefined;
    await rm(dir, { recursive: true, force: true });
  }
});
