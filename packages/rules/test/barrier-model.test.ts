import { describe, expect, it } from "vitest";
import {
  blockedSeconds,
  merge,
  revealTimes,
  schedule,
  waitAt,
} from "../scripts/experiments/barrier-model.js";

describe("experimental temporal barriers", () => {
  it("lets independent events pass a hidden arrival and propagates a bridge to another resource", () => {
    const result = schedule(
      [
        { id: 1, at: 10, ready: 100, resources: [0] },
        { id: 2, at: 11, ready: 11, resources: [1] },
        { id: 3, at: 12, ready: 12, resources: [0, 1] },
        { id: 4, at: 13, ready: 13, resources: [1] },
      ],
      1,
    );
    expect([...result.completed]).toEqual([
      [2, 12],
      [1, 101],
      [3, 102],
      [4, 103],
    ]);
    expect(merge(result.intervals.get(1)!)).toEqual([[11, 103]]);
  });

  it("keeps independent resources progressing when one message never becomes available", () => {
    const result = schedule(
      [
        { id: 1, at: 10, ready: Infinity, resources: [0] },
        { id: 2, at: 20, ready: 20, resources: [0, 1] },
        { id: 3, at: 30, ready: 30, resources: [2] },
        { id: 4, at: 40, ready: 40, resources: [1] },
      ],
      1,
    );
    expect(result.completed.get(3)).toBe(31);
    for (const id of [1, 2, 4]) expect(result.completed.get(id)).toBe(Infinity);
    expect(blockedSeconds(result.intervals.get(1)!, 0, 100)).toBe(80);
  });

  it("preserves original same-second order, even if a later reveal is ready earlier", () => {
    const result = schedule(
      [
        { id: 9, at: 10, ready: 10, resources: [0] },
        { id: 4, at: 10, ready: 30, resources: [0] },
      ],
      2,
    );
    expect(result.completed.get(4)).toBe(32);
    expect(result.completed.get(9)).toBe(34);
  });

  it("does not credit a return before resolving its outbound event", () => {
    const result = schedule(
      [
        { id: 0, at: 10, ready: 100, resources: [1] },
        { id: 1, at: 20, ready: 20, resources: [0], after: 0 },
      ],
      1,
    );
    expect(result.completed.get(1)).toBe(102);
    expect(waitAt(merge(result.intervals.get(0)!), 25)).toBe(77);
  });

  it("matches the closed-form serial schedule for a global barrier", () => {
    const events = Array.from({ length: 50 }, (_, id) => ({
      id,
      at: id * 3,
      ready: id * 3 + ((id * 71) % 47),
      resources: [0],
    }));
    const result = schedule(events, 0.5);
    let expected = 0;
    for (const event of events) {
      expected = Math.max(expected, event.ready) + 0.5;
      expect(result.completed.get(event.id)).toBe(expected);
    }
  });

  it("bounds throughput without adding a global dependency on missing information", () => {
    const result = schedule(
      [
        { id: 0, at: 1, ready: Infinity, resources: [0] },
        ...Array.from({ length: 4 }, (_, i) => ({
          id: i + 1,
          at: 1,
          ready: 1,
          resources: [i + 1],
        })),
      ],
      2,
    );
    expect([1, 2, 3, 4].map((id) => result.completed.get(id))).toEqual([3, 5, 7, 9]);
  });

  it("retries after keeper recovery and permits the sender to reveal without drand", () => {
    const events = [
      { id: 0, at: 10, own: false },
      { id: 1, at: 12, own: false },
    ];
    const times = revealTimes(events, 3, 5, 2, 1, [10, 100]);
    expect(times.get(0)).toBe(106);
    expect(times.get(1)).toBe(107);
    expect(revealTimes([{ id: 3, at: 10, own: true }], 15, 5, 2, 1, undefined, true).get(3)).toBe(
      15,
    );
  });

  it("merges overlapping and touching pauses and measures a clipped horizon", () => {
    const intervals = merge([
      [10, 20],
      [5, 15],
      [20, 21],
      [40, Infinity],
    ]);
    expect(intervals).toEqual([
      [5, 21],
      [40, Infinity],
    ]);
    expect(blockedSeconds(intervals, 8, 50)).toBe(23);
    expect(waitAt(intervals, 21)).toBe(0);
    expect(waitAt(intervals, 20)).toBe(1);
    expect(waitAt(intervals, 45)).toBe(Infinity);
  });
});
