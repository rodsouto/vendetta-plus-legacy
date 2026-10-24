// Browser half of benchmark-gas.ts: exercises the production passkey/session signing path.
import { makeClients } from "../src/chain/config.js";
import { loadNetwork } from "../src/chain/networks.js";
import { gameAbi } from "../src/chain/abi.js";
import { PasskeySigner, type Call, type From } from "../src/account/signer.js";
import { publishCall } from "../src/account/passkey.js";

let signer: PasskeySigner;
let game: Call["to"];

export async function initialize() {
  const network = await loadNetwork();
  if (typeof network === "string" || network.id !== "local")
    throw new Error("The benchmark requires an isolated local deployment");
  game = network.deployment.game;
  signer = new PasskeySigner(makeClients(network.deployment), network);
  await signer.create("Gas benchmark");
  return { controller: signer.controller, session: signer.actor };
}

export async function register() {
  const network = await loadNetwork();
  if (typeof network === "string") throw new Error(network);
  const client = makeClients(network.deployment).public;
  const now = Number((await client.getBlock()).timestamp);
  await signer.send(
    [
      publishCall(network.deployment.directory!, signer.identity!),
      call("register", [1, 1, 1]),
      call("authorizeSession", [signer.actor, now + 30 * 86_400]),
    ],
    "controller",
  );
  signer.settled();
}

function call(functionName: string, args: unknown[]): Call {
  return { to: game, abi: gameAbi, functionName, args };
}

export async function send(
  functionName: string,
  args: unknown[],
  from: From = "actor",
  accept = false,
) {
  await signer.send(
    [...(accept ? [call("acceptSession", [1])] : []), call(functionName, args)],
    from,
  );
}
