import { sim } from "@vendetta/rules";

// Keep remote failures retryable and bound response memory as well as elapsed
// time. Native proving authenticates the signature cryptographically.
export async function fetchBeacon(
  round: bigint,
  options: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<string> {
  const response = await fetch(
    `${options.baseUrl ?? `https://api.drand.sh/${sim.hiddenContext.NETWORK}`}/public/${round}`,
    { signal: AbortSignal.timeout(options.timeoutMs ?? 15000) },
  );
  try {
    if (!response.ok) throw new Error("Beacon service unavailable");
    if (!response.body) throw new Error("Missing beacon response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) throw new Error("Beacon response too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !data ||
      typeof data !== "object" ||
      !("round" in data) ||
      !Number.isSafeInteger(data.round) ||
      BigInt(data.round as number) !== round ||
      !("signature" in data) ||
      typeof data.signature !== "string" ||
      !/^[0-9a-f]{96}$/i.test(data.signature)
    )
      throw new Error("Malformed beacon response");
    return data.signature;
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
