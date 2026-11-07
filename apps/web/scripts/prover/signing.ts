import type { Hex } from "viem";

// Cancellation is allowed before returning signed bytes to the journal owner.
// Once published, recovery must settle or retain that journal, never abandon it.
export async function prepareSignedTransaction<Request>(
  assertOpen: () => void,
  prepare: () => Promise<Request>,
  sign: (request: Request) => Promise<Hex>,
): Promise<Hex> {
  assertOpen();
  const request = await prepare();
  assertOpen();
  const signed = await sign(request);
  assertOpen();
  return signed;
}
