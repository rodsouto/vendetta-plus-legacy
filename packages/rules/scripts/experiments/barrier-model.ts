// Synthetic scheduling model, not the game's state machine or a gas benchmark.
export interface Event {
  id: number;
  at: number;
  ready: number;
  resources: number[];
  after?: number;
}

export type Interval = [number, number];

class MinHeap<T> {
  private items: T[] = [];
  constructor(private less: (a: T, b: T) => boolean) {}
  push(value: T): void {
    const a = this.items;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(value, a[parent]!)) break;
      a[i] = a[parent]!;
      i = parent;
    }
    a[i] = value;
  }
  pop(): T | undefined {
    const a = this.items;
    const first = a[0];
    const last = a.pop();
    if (!a.length) return first;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let child = i * 2 + 1;
      if (child + 1 < a.length && this.less(a[child + 1]!, a[child]!)) child++;
      if (!this.less(a[child]!, last!)) break;
      a[i] = a[child]!;
      i = child;
    }
    a[i] = last!;
    return first;
  }
}

/**
 * Order every shared resource by original (at, id). Independent events may pass an
 * unknown event. A single execution worker serves eligible events at a fixed rate.
 * `after` represents a return that cannot execute before its outbound resolution.
 * No actions or events are cancelled. Infinity represents unavailable information.
 */
export function schedule(events: Event[], secondsPerEvent: number) {
  if (!(secondsPerEvent >= 0) || !Number.isFinite(secondsPerEvent)) {
    throw new Error("Invalid execution service time");
  }
  const ordered = [...events].sort((a, b) => a.at - b.at || a.id - b.id);
  const index = new Map(ordered.map((e, i) => [e.id, i]));
  if (index.size !== ordered.length) throw new Error("Duplicate event id");
  const last = new Map<number, number>();
  const dependents = ordered.map(() => [] as number[]);
  const remaining = ordered.map(() => 0);
  const eligible = ordered.map((e) => Math.max(e.at, e.ready));
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]!;
    if (!Number.isFinite(e.at) || e.at < 0 || Number.isNaN(e.ready)) {
      throw new Error("Invalid event time");
    }
    const predecessors = new Set<number>();
    for (const r of new Set(e.resources)) {
      const prev = last.get(r);
      if (prev !== undefined) predecessors.add(prev);
      last.set(r, i);
    }
    if (e.after !== undefined) {
      const parent = index.get(e.after);
      if (parent === undefined || parent >= i) throw new Error("Invalid causal parent");
      predecessors.add(parent);
    }
    remaining[i] = predecessors.size;
    for (const prev of predecessors) dependents[prev]!.push(i);
  }
  const queue = new MinHeap<{ i: number; at: number }>((a, b) => {
    const ea = ordered[a.i]!;
    const eb = ordered[b.i]!;
    return a.at < b.at || (a.at === b.at && (ea.at < eb.at || (ea.at === eb.at && ea.id < eb.id)));
  });
  remaining.forEach((n, i) => {
    if (n === 0) queue.push({ i, at: eligible[i]! });
  });
  let worker = 0;
  const completed = new Map<number, number>();
  const intervals = new Map<number, Interval[]>();
  let item;
  while ((item = queue.pop()) !== undefined) {
    const e = ordered[item.i]!;
    const finish = Number.isFinite(item.at)
      ? Math.max(worker, item.at) + secondsPerEvent
      : Infinity;
    // An unavailable event does not monopolize the execution worker.
    if (Number.isFinite(finish)) worker = finish;
    completed.set(e.id, finish);
    for (const r of new Set(e.resources)) {
      const list = intervals.get(r) ?? [];
      list.push([e.at, finish]);
      intervals.set(r, list);
    }
    for (const next of dependents[item.i]!) {
      eligible[next] = Math.max(eligible[next]!, finish);
      remaining[next]!--;
      if (remaining[next] === 0) queue.push({ i: next, at: eligible[next]! });
    }
  }
  if (completed.size !== events.length) throw new Error("Cyclic dependencies");
  return { completed, intervals };
}

export function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const tail = result[result.length - 1];
    if (tail && start <= tail[1]) tail[1] = Math.max(tail[1], end);
    else result.push([start, end]);
  }
  return result;
}

export function blockedSeconds(intervals: Interval[], start: number, end: number): number {
  return merge(intervals).reduce(
    (sum, [a, b]) => sum + Math.max(0, Math.min(end, b) - Math.max(start, a)),
    0,
  );
}

export function waitAt(intervals: Interval[], at: number): number {
  // Input is a merged list; binary search matters when probing a full day.
  let lo = 0;
  let hi = intervals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (intervals[mid]![0] <= at) lo = mid + 1;
    else hi = mid;
  }
  const interval = intervals[lo - 1];
  return interval && at < interval[1] ? interval[1] - at : 0;
}

/** One publisher with a configurable start-to-start gap; missed ticks retry after an outage. */
export function revealTimes(
  events: { id: number; at: number; own: boolean }[],
  margin: number,
  inclusion: number,
  tick: number,
  secondsPerReveal: number,
  outage?: Interval,
  drandDown = false,
): Map<number, number> {
  const retry = (at: number) => (outage && at >= outage[0] && at < outage[1] ? outage[1] : at);
  const offers = events
    .map((e) => ({
      ...e,
      available: drandDown ? Infinity : retry(Math.ceil((e.at + margin) / tick) * tick),
    }))
    .sort((a, b) => a.available - b.available || a.at - b.at || a.id - b.id);
  let worker = 0;
  const result = new Map<number, number>();
  for (const e of offers) {
    let finish = Infinity;
    // If the owner publishes first, skip redundant keeper work in this idealized model.
    const owner = e.own ? e.at + inclusion : Infinity;
    const start = retry(Math.max(worker, e.available));
    if (Number.isFinite(start) && start + 1 + inclusion < owner) {
      worker = start + secondsPerReveal;
      finish = start + 1 + inclusion;
    }
    result.set(e.id, Math.min(owner, finish));
  }
  return result;
}
