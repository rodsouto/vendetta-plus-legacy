import { expect, it } from "vitest";
import { runWithCleanup } from "../scripts/prover/finalize.js";
it("returns a valid result and reports maintenance failure separately", async () => {
  const error = new Error("synthetic cleanup failure");
  expect(
    await runWithCleanup(
      async () => "0xabcd",
      async () => {
        throw error;
      },
    ),
  ).toEqual({ value: "0xabcd", cleanupFailure: { error } });
});
it("retains both the primary job failure and cleanup failure", async () => {
  const primary = new Error("synthetic job failure"),
    cleanup = new Error("synthetic cleanup failure");
  const error = await runWithCleanup(
    async () => {
      throw primary;
    },
    async () => {
      throw cleanup;
    },
  ).catch((error: unknown) => error);
  expect((error as AggregateError).errors).toEqual([primary, cleanup]);
  expect((error as AggregateError).cause).toBe(primary);
});
it("retains the sole job failure without replacing its identity", async () => {
  const error = new Error("synthetic job failure");
  await expect(
    runWithCleanup(
      async () => {
        throw error;
      },
      async () => {},
    ),
  ).rejects.toBe(error);
});
