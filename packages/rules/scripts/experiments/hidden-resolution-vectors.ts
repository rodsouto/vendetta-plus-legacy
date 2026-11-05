// Deterministic shared lifecycle traces for the TS/Solidity hidden-resolution kernel.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hiddenResolution as h } from "../../src/sim/index.js";
const ZERO = "0x" + "00".repeat(32),
  ROOT = "0x" + "12".repeat(32),
  OTHER = "0x" + "34".repeat(32);
const PLAIN = "0x02010101020000000000000000000000000000000000000000000000000000000000000005";
interface Input {
  op: number;
  time: number;
  statement?: string;
  arrival?: number;
  seq?: number;
  valid?: boolean;
  plain?: string;
}
const init = (statement = ROOT, arrival = 100, seq = 7): Input => ({
  op: 0,
  time: 0,
  statement,
  arrival,
  seq,
});
const record = (
  time: number,
  valid = true,
  plain = valid ? PLAIN : "0x",
  statement = ROOT,
): Input => ({ op: 1, time, valid, plain, statement });
const take = (time: number): Input => ({ op: 2, time });
const traces = [
  {
    name: "late-valid-keeps-arrival-and-sequence",
    inputs: [
      init(),
      take(7300),
      record(7300),
      record(7301),
      take(7301),
      record(7302),
      take(7303),
      record(7304, false),
      init(),
    ],
  },
  {
    name: "only-verified-invalidity-can-consume-invalid",
    inputs: [
      take(10000),
      record(10000, false),
      init(),
      take(10000),
      record(10000, false),
      take(10000),
      record(10001, false),
      record(10002, true),
    ],
  },
  { name: "early-evidence-waits-for-arrival", inputs: [init(), record(10), take(99), take(100)] },
  {
    name: "wrong-statement-and-payload-never-change-state",
    inputs: [
      init(),
      record(100, true, PLAIN, OTHER),
      record(100, true, PLAIN.slice(0, -2)),
      record(100, true, "0x01" + PLAIN.slice(4)),
      record(100, false, PLAIN),
      record(100),
      record(101, true, "0x" + PLAIN.slice(2, -2) + "06"),
    ],
  },
  {
    name: "zero-statement-is-an-initialized-receipt",
    inputs: [
      init(ZERO, 50, 0),
      record(100, true, PLAIN, ZERO),
      take(100),
      record(101, true, PLAIN, ZERO),
      init(ZERO),
    ],
  },
];
export function buildResolutionTraces() {
  return traces.map(({ name, inputs }) => {
    let entry: h.HiddenResolution | undefined;
    const steps = inputs.map((input) => {
      const step = {
        arrival: input.arrival ?? 0,
        changed: false,
        error: "",
        op: input.op,
        plain: input.plain ?? "0x",
        resultArrival: 0,
        resultPlain: "0x",
        resultSeq: 0,
        resultStatus: 0,
        seq: input.seq ?? 0,
        state: {} as ReturnType<typeof snapshot>,
        statement: input.statement ?? ZERO,
        time: input.time,
        valid: input.valid ?? false,
      };
      try {
        if (step.op === 0)
          entry = h.initialize(entry, step.statement, BigInt(step.arrival), BigInt(step.seq));
        else if (step.op === 1)
          step.changed = h.recordVerified(
            entry,
            step.statement,
            step.valid,
            Buffer.from(step.plain.slice(2), "hex"),
          );
        else {
          const result = h.consume(entry, BigInt(step.time));
          step.resultArrival = Number(result.arrival);
          step.resultSeq = Number(result.seq);
          step.resultStatus = result.status;
          step.resultPlain = "0x" + Buffer.from(result.plain).toString("hex");
        }
      } catch (error) {
        if (!(error instanceof h.ResolutionError)) throw error;
        step.error = error.code;
      }
      step.state = snapshot(entry);
      return {
        input: {
          arrival: step.arrival,
          op: step.op,
          plain: step.plain,
          seq: step.seq,
          statement: step.statement,
          time: step.time,
          valid: step.valid,
        },
        expected: {
          changed: step.changed,
          error: step.error,
          resultArrival: step.resultArrival,
          resultPlain: step.resultPlain,
          resultSeq: step.resultSeq,
          resultStatus: step.resultStatus,
          state: step.state,
        },
      };
    });
    return { name, stepCount: steps.length, steps };
  });
}
function snapshot(entry: h.HiddenResolution | undefined) {
  return {
    arrival: Number(entry?.arrival ?? 0n),
    consumed: entry?.consumed ?? false,
    initialized: entry !== undefined,
    plain: entry ? "0x" + Buffer.from(entry.plain).toString("hex") : "0x",
    seq: Number(entry?.seq ?? 0n),
    statement: entry?.statement ?? ZERO,
    status: entry?.status ?? 0,
  };
}
const output = {
  scope:
    "Inactive shared receipt lifecycle kernel; no proof verification, queue frontier or Game activation",
  cases: buildResolutionTraces(),
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(
    new URL("../../generated/hidden-resolution.json", import.meta.url),
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(
    `Generated ${output.cases.length} resolution traces (${output.cases.reduce((n, c) => n + c.steps.length, 0)} steps)`,
  );
}
