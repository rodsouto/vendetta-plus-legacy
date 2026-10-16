// The passkey stack (permissionless, ox): creating and using passkeys, the session accounts, and
// sending sponsored ERC-4337 operations (B-15, B-16). PasskeySigner imports it on first use, so dev
// mode and the entry screen never download it.
import {
  decodeErrorResult,
  decodeEventLog,
  http,
  type Abi,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { Network } from "../chain/networks.js";
import { ENTRY_POINT, kernelAccount, type Identity } from "./passkey.js";
import { sessionAccount } from "./session.js";
import { RevertedError, type Call } from "./signer.js";

export { createIdentity, signInIdentity } from "./passkey.js";
export { deviceSession } from "./session.js";

const CALL_GAS_HEADROOM = 100_000n;

/** The custom error behind a reverted operation, from the EntryPoint's UserOperationRevertReason. */
function revertName(logs: readonly { data: Hash; topics: readonly Hash[] }[], abis: Abi[]) {
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi: entryPoint07Abi, ...log, topics: log.topics as never });
      if (ev.eventName !== "UserOperationRevertReason") continue;
      for (const abi of abis) {
        try {
          return decodeErrorResult({ abi, data: ev.args.revertReason }).errorName;
        } catch {
          /* not this contract's error */
        }
      }
    } catch {
      /* another event */
    }
  }
  return undefined;
}

const pimlicos = new Map<string, ReturnType<typeof createPimlicoClient>>();
function pimlico(url: string) {
  let p = pimlicos.get(url);
  if (!p)
    pimlicos.set(url, (p = createPimlicoClient({ transport: http(url), entryPoint: ENTRY_POINT })));
  return p;
}

/**
 * Sends the calls as one sponsored operation from the passkey's Kernel account (`identity`) or a
 * session account (`key`), waits for it and throws a RevertedError on a revert.
 */
export async function sendOperation(
  client: PublicClient,
  network: Network,
  from: { identity: Identity } | { key: Hex },
  calls: Call[],
) {
  const { deployment } = network;
  const paymaster = pimlico(deployment.paymaster ?? deployment.bundler!);
  const account =
    "identity" in from
      ? await kernelAccount(client, from.identity)
      : await sessionAccount(client, from.key);
  const smart = createSmartAccountClient({
    account,
    chain: network.chain as Chain,
    client,
    bundlerTransport: http(deployment.bundler!),
    paymaster,
    paymasterContext: deployment.sponsorshipPolicy
      ? { sponsorshipPolicyId: deployment.sponsorshipPolicy }
      : undefined,
    userOperation: {
      estimateFeesPerGas: async () => (await paymaster.getUserOperationGasPrice()).fast,
    },
  });
  // With the abi, viem decodes a revert during gas estimation into the contract's error.
  const gas = await smart.estimateUserOperationGas({ calls: calls as never });
  // A game action costs more the later it runs (lazy settlement, due missions processed on the
  // way, B-06/B-07), so the execution limit gets headroom. It is fixed before the paymaster
  // signs, since its signature covers the limits; unused gas is barely charged.
  const hash: Hash = await smart.sendUserOperation({
    calls: calls as never,
    ...gas,
    callGasLimit: (gas.callGasLimit * 3n) / 2n + CALL_GAS_HEADROOM,
  });
  const receipt = await smart.waitForUserOperationReceipt({ hash });
  if (!receipt.success)
    throw new RevertedError(
      revertName(
        receipt.logs,
        calls.map((c) => c.abi),
      ),
    );
}
