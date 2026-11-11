import { expect, it } from "vitest";
import { serviceErrorSummary } from "../scripts/service-errors.js";
it("does not serialize arbitrary messages, stacks, names, codes or thrown values", () => {
  const secret = "synthetic-secret-DO-NOT-LOG";
  const error = Object.assign(
    new Error(`https://rpc.test/?key=${secret}\nAuthorization: Bearer ${secret}`),
    { name: secret, code: secret, cause: secret },
  );
  const output = JSON.stringify(serviceErrorSummary(error));
  expect(output).not.toContain(secret);
  expect(output).not.toContain("rpc.test");
  expect(output).toContain("ExternalError");
});
it("retains safe failure categories and all aggregate members without credentials", () => {
  const error = new Error("https://rpc.test/?key=synthetic-secret");
  const io = Object.assign(new Error("private-path-synthetic"), { code: "EIO" });
  expect(
    serviceErrorSummary(
      new AggregateError([error, io], "Producer operation and cleanup failed", { cause: error }),
    ),
  ).toEqual({
    type: "AggregateError",
    message: "Producer operation and cleanup failed",
    errors: [{ type: "Error" }, { type: "Error", code: "EIO" }],
    cause: { type: "Error" },
  });
});
it("bounds cyclic causes and aggregate size", () => {
  const error = new Error("private-message");
  error.cause = error;
  expect(
    JSON.stringify(serviceErrorSummary(new AggregateError(Array(100).fill(error), "private")))
      .length,
  ).toBeLessThan(3000);
});

it("distinguishes static retry/configuration reasons and filesystem errors without dynamic payloads", () => {
  for (const message of [
    "Invalid producer timeout",
    "Invalid producer cache maxBytes",
    "Producer queue full; retry later",
    "Beacon release has not arrived",
    "Mission is not awaiting evidence",
    "Producer is closing",
    "Keeper transaction reverted",
  ])
    expect(serviceErrorSummary(new Error(message))).toEqual({ type: "Error", message });
  expect(serviceErrorSummary(new Error("Keeper transaction reverted: synthetic-secret"))).toEqual({
    type: "Error",
  });
  expect(
    serviceErrorSummary(Object.assign(new Error("private host and path"), { code: "EROFS" })),
  ).toEqual({ type: "Error", code: "EROFS" });
  expect(
    serviceErrorSummary(
      Object.assign(new Error("Mission packet is not indexed; retrying"), { missionId: "42" }),
    ),
  ).toEqual({ type: "Error", message: "Mission packet is not indexed; retrying", missionId: "42" });
  expect(
    JSON.stringify(
      serviceErrorSummary(Object.assign(new Error("untrusted"), { missionId: "synthetic-secret" })),
    ),
  ).not.toContain("synthetic-secret");
});
