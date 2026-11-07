import { expect, it } from "vitest";
import { assertServiceStateDirectory } from "../scripts/service-state.js";
it("rejects an env-file redirect away from systemd state", () => {
  expect(() => assertServiceStateDirectory("/elsewhere", "/var/lib/vendetta-producer")).toThrow(
    "STATE_DIRECTORY",
  );
  expect(() =>
    assertServiceStateDirectory("/var/lib/vendetta-producer", "/var/lib/vendetta-producer"),
  ).not.toThrow();
  expect(() =>
    assertServiceStateDirectory("/var/lib/vendetta-producer/.", "/var/lib/vendetta-producer"),
  ).not.toThrow();
});
it.each(["", "/state/one:/state/two"])("rejects ambiguous supervisor state %s", (expected) => {
  expect(() => assertServiceStateDirectory("/state/one", expected)).toThrow("STATE_DIRECTORY");
});
