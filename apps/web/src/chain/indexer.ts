// GraphQL client for the subgraph (B-18, packages/indexer): history and rankings that are too
// expensive to read from the contract.

export async function indexerQuery<T>(url: string, query: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`indexer: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`indexer: ${body.errors[0]!.message}`);
  return body.data!;
}
