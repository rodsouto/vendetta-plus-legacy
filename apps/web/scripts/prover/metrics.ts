import { performance } from "node:perf_hooks";

export function producerMetrics() {
  const counters: Record<string, number> = {};
  const stages: Record<
    string,
    { calls: number; failures: number; totalMs: number; maxMs: number }
  > = {};
  return {
    increment(name: string) {
      counters[name] = (counters[name] ?? 0) + 1;
    },
    async measure<T>(name: string, run: () => Promise<T>): Promise<T> {
      const stage = (stages[name] ??= { calls: 0, failures: 0, totalMs: 0, maxMs: 0 });
      const start = performance.now();
      stage.calls++;
      try {
        return await run();
      } catch (error) {
        stage.failures++;
        throw error;
      } finally {
        const ms = performance.now() - start;
        stage.totalMs += ms;
        stage.maxMs = Math.max(stage.maxMs, ms);
      }
    },
    snapshot() {
      return {
        counters: { ...counters },
        stages: structuredClone(stages),
        memory: process.memoryUsage(),
      };
    },
  };
}
