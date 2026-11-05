import type { Hex } from "viem";
/** Only transports certificates. Invalidation is exclusively the contract verifier's decision. */
export async function requestCertificate(
  url: string,
  request: unknown,
  fetcher: typeof fetch = fetch,
  token?: string,
): Promise<Hex> {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: "error",
    body: JSON.stringify(request, (_, v) => (typeof v === "bigint" ? String(v) : v)),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Prover unavailable (${response.status}); retry later`);
  const result = (await response.json()) as { certificate?: Hex };
  if (
    !result.certificate ||
    !/^0x(?:[0-9a-f]{2})+$/i.test(result.certificate) ||
    result.certificate.length > 32770
  )
    throw new Error("Malformed certificate response; retry later");
  return result.certificate;
}
