import { createHash, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";

export interface ProducerClient {
  token: string;
  scopes: ("prove" | "metrics")[];
  requestsPerMinute: number;
  maxConcurrent: number;
}
export function producerAccess(input: unknown, now = () => performance.now()) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 128)
    throw new Error("Invalid producer clients configuration");
  const seen = new Set<string>();
  const clients = input.map((entry: ProducerClient) => {
    if (
      !entry ||
      typeof entry.token !== "string" ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(entry.token) ||
      seen.has(entry.token) ||
      !Array.isArray(entry.scopes) ||
      entry.scopes.length < 1 ||
      entry.scopes.some((scope) => scope !== "prove" && scope !== "metrics") ||
      !Number.isSafeInteger(entry.requestsPerMinute) ||
      entry.requestsPerMinute < 1 ||
      entry.requestsPerMinute > 100000 ||
      !Number.isSafeInteger(entry.maxConcurrent) ||
      entry.maxConcurrent < 1 ||
      entry.maxConcurrent > 32
    )
      throw new Error("Invalid producer clients configuration");
    seen.add(entry.token);
    return {
      digest: createHash("sha256").update(entry.token).digest(),
      scopes: [...entry.scopes],
      rate: entry.requestsPerMinute,
      maxConcurrent: entry.maxConcurrent,
      tokens: entry.requestsPerMinute,
      updated: now(),
      active: 0,
    };
  });
  let unauthorized = 0,
    forbidden = 0,
    limited = 0;
  return {
    acquire(authorization: string | undefined, scope: "prove" | "metrics") {
      const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1] ?? "";
      const digest = createHash("sha256").update(token).digest();
      // Compare fixed-size hashes and scan every configured client.
      let client: (typeof clients)[number] | undefined;
      for (const candidate of clients)
        if (timingSafeEqual(digest, candidate.digest)) client = candidate;
      if (!client) {
        unauthorized++;
        return { status: 401 as const };
      }
      if (!client.scopes.includes(scope)) {
        forbidden++;
        return { status: 403 as const };
      }
      const time = now();
      client.tokens = Math.min(
        client.rate,
        client.tokens + (Math.max(0, time - client.updated) * client.rate) / 60000,
      );
      client.updated = time;
      if (client.active >= client.maxConcurrent || client.tokens < 1) {
        limited++;
        return {
          status: 429 as const,
          retryAfter:
            client.active >= client.maxConcurrent
              ? 1
              : Math.max(1, Math.ceil(((1 - client.tokens) * 60) / client.rate)),
        };
      }
      client.tokens--;
      client.active++;
      let released = false;
      return {
        status: 200 as const,
        release: () => {
          if (released) return;
          released = true;
          client.active--;
        },
      };
    },
    stats: () => ({ unauthorized, forbidden, limited }),
  };
}
