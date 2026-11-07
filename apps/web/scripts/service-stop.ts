import type { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

// Keep repeated termination signals handled until the caller has drained its work.
// This requests a stop; it never interrupts a signed transaction or releases a lease.
export function serviceStop(events: Pick<EventEmitter, "on" | "removeListener"> = process) {
  const controller = new AbortController();
  let resolveStopped!: () => void;
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const request = () => {
    if (controller.signal.aborted) return;
    controller.abort(new Error("Service stop requested"));
    resolveStopped();
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  for (const signal of signals) events.on(signal, request);
  return {
    signal: controller.signal,
    get requested() {
      return controller.signal.aborted;
    },
    request,
    stopped,
    async wait(ms: number) {
      try {
        await delay(ms, undefined, { signal: controller.signal });
      } catch (error) {
        if (!(controller.signal.aborted && (error as Error).name === "AbortError")) throw error;
      }
    },
    dispose() {
      for (const signal of signals) events.removeListener(signal, request);
    },
  };
}
