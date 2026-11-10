import type { Hex } from "viem";
/** Only transports certificates. Invalidation is exclusively the contract verifier's decision. */
export async function requestCertificate(
  url: string,
  request: unknown,
  fetcher: typeof fetch = fetch,
  token?: string,
  stopSignal?: AbortSignal,
): Promise<Hex> {
  stopSignal?.throwIfAborted();
  const timeout = AbortSignal.timeout(120000);
  const signal = stopSignal ? AbortSignal.any([timeout, stopSignal]) : timeout;
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      body: JSON.stringify(request, (_, v) => (typeof v === "bigint" ? String(v) : v)),
      signal,
    });
    let result: unknown;
    try {
      if (!response.ok) {
        const message =
          response.status === 401
            ? "Prover authentication failed; retry later"
            : response.status === 403
              ? "Prover access forbidden; retry later"
              : response.status === 429
                ? "Prover rate limited; retry later"
                : "Prover unavailable; retry later";
        throw new Error(message);
      }
      if (!response.body) throw new Error("Malformed certificate response; retry later");
      const reader = response.body.getReader();
      // Bound decoded bytes, even for chunked/compressed bodies or false headers.
      // This bounds retained payload, not fetch buffers, JSON overhead or process RSS.
      const bytes = new Uint8Array(65536);
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength > bytes.length - size)
            throw new Error("Certificate response too large; retry later");
          bytes.set(value, size);
          size += value.byteLength;
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      try {
        result = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)),
        );
      } catch {
        throw new Error("Malformed certificate response; retry later");
      }
    } finally {
      // Error statuses must also release a streaming response without reading it.
      if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
    if (
      !result ||
      typeof result !== "object" ||
      !("certificate" in result) ||
      typeof result.certificate !== "string" ||
      result.certificate.length > 32770 ||
      !/^0x(?:[0-9a-f]{2})+$/i.test(result.certificate)
    )
      throw new Error("Malformed certificate response; retry later");
    stopSignal?.throwIfAborted();
    return result.certificate as Hex;
  } catch (error) {
    // Fetch headers and response-body cancellation can use different Error objects.
    // A caller stop observed before reporting wins, including during response cleanup.
    // If the timeout signal won first, preserve the original failure instead.
    if (stopSignal?.aborted && signal.reason === stopSignal.reason) throw stopSignal.reason;
    throw error;
  }
}
