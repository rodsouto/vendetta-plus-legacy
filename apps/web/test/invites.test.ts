// Invitations waiting for an address (B-26): the ControllerInvited scan skips what the TTL already
// expired, resumes across reloads, and restarts when the chain under it changed (reorg, redeploy).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { sim, vendetta as rs } from "@vendetta/rules";

const GAME: Address = "0x000000000000000000000000000000000000dEaD";
const ME: Address = "0x00000000000000000000000000000000000000aa";
const TTL = rs.config.inviteTtl;

interface Block {
  number: bigint;
  timestamp: bigint;
  hash: Hex;
  invites: bigint[]; // players that invited ME in this block
}

/** A chain whose blocks the test replaces at will, behind the client calls pendingFor makes. */
function fakeChain() {
  let blocks: Block[] = [];
  let fork = 0;
  const ranges: string[] = [];
  const hashOf = (n: bigint) =>
    `0x${fork.toString(16).padStart(4, "0")}${n.toString(16).padStart(60, "0")}` as Hex;
  const chain = {
    ranges,
    /** Appends blocks `count` blocks, `step` seconds apart, starting `gap` seconds after the head. */
    mine(count: number, { step = 1n, gap = 1n, invites = new Map<number, bigint[]>() } = {}) {
      for (let i = 0; i < count; i++) {
        const last = blocks.at(-1);
        const number = last ? last.number + 1n : 0n;
        const timestamp = last ? last.timestamp + (i === 0 ? gap : step) : 1_000n;
        blocks.push({ number, timestamp, hash: hashOf(number), invites: invites.get(i) ?? [] });
      }
    },
    /** Drops every block from `n` on, as a reorg or a chain deployed again does. */
    rollback(n: bigint) {
      blocks = blocks.filter((b) => b.number < n);
      fork++;
    },
    client: {
      async getBlock(a: { blockTag?: "latest"; blockNumber?: bigint }) {
        const b = a.blockTag ? blocks.at(-1) : blocks[Number(a.blockNumber)];
        if (!b) throw new Error(`no block ${a.blockNumber}`);
        return b;
      },
      async getContractEvents(a: {
        args: { controller: Address };
        fromBlock: bigint;
        toBlock: bigint;
      }) {
        ranges.push(`${a.fromBlock}-${a.toBlock}`);
        expect(a.args.controller).toBe(ME);
        return blocks
          .filter((b) => b.number >= a.fromBlock && b.number <= a.toBlock)
          .flatMap((b) => b.invites.map((player) => ({ args: { player } })));
      },
      async readContract(a: { functionName: string; args: [Address, bigint] }) {
        expect(a.functionName).toBe("getInvite");
        const b = blocks.findLast((x) => x.invites.includes(a.args[1]));
        return b
          ? {
              kind: sim.INVITE_CONTROLLER,
              recovery: false,
              until: Number(b.timestamp + TTL),
              epoch: 0,
            }
          : { kind: 0, recovery: false, until: 0, epoch: 0 };
      },
    },
  };
  return chain;
}

const world = (...players: bigint[]) =>
  ({
    players: new Map(players.map((id) => [id, { id, sessionEpoch: 0n }])),
  }) as unknown as sim.World;

/** A fresh copy of the module: what a reload does to its in-memory scans. */
const reload = async () => {
  vi.resetModules();
  return (await import("../src/chain/load.js")).pendingFor;
};

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
});

const invited = async (
  pendingFor: Awaited<ReturnType<typeof reload>>,
  chain: ReturnType<typeof fakeChain>,
  w: sim.World,
) => {
  const head = await chain.client.getBlock({ blockTag: "latest" });
  const out = await pendingFor(chain.client as never, GAME, 0, ME, w, head.timestamp);
  return out.filter((p) => p.kind === "controller").map((p) => p.player);
};

describe("pendingFor", () => {
  it("skips the blocks older than the TTL on a first scan", async () => {
    const chain = fakeChain();
    chain.mine(100, { invites: new Map([[10, [1n]]]) }); // an invitation long expired
    chain.mine(100, { gap: TTL + 3600n, invites: new Map([[50, [2n]]]) });
    expect(await invited(await reload(), chain, world(1n, 2n))).toEqual([2n]);
    expect(chain.ranges).toEqual(["100-199"]);
  });

  it("resumes a saved scan after a reload, reading only the new blocks", async () => {
    const chain = fakeChain();
    chain.mine(50);
    await invited(await reload(), chain, world(2n));
    chain.mine(10, { invites: new Map([[5, [2n]]]) });
    chain.ranges.length = 0;
    expect(await invited(await reload(), chain, world(2n))).toEqual([2n]);
    expect(chain.ranges).toEqual(["50-59"]);
  });

  it("finds an invitation in a block replaced while the page is open", async () => {
    const chain = fakeChain();
    chain.mine(101);
    const pendingFor = await reload();
    expect(await invited(pendingFor, chain, world(2n))).toEqual([]);
    chain.rollback(100n);
    chain.mine(2, { invites: new Map([[0, [2n]]]) }); // the new block 100 carries it
    expect(await invited(pendingFor, chain, world(2n))).toEqual([2n]);
    // And the saved scan holds it after a reload.
    expect(await invited(await reload(), chain, world(2n))).toEqual([2n]);
  });

  it("finds an invitation below the old head after the chain went back", async () => {
    const chain = fakeChain();
    chain.mine(101);
    const pendingFor = await reload();
    await invited(pendingFor, chain, world(2n));
    chain.rollback(90n);
    chain.mine(6, { invites: new Map([[1, [2n]]]) }); // head 95, the invitation at 91
    expect(await invited(pendingFor, chain, world(2n))).toEqual([2n]);
  });

  it("starts again when the saved scan belongs to another chain", async () => {
    const chain = fakeChain();
    chain.mine(30);
    await invited(await reload(), chain, world(2n));
    chain.rollback(0n); // deployed again: same address, new chain
    chain.mine(40, { invites: new Map([[20, [2n]]]) });
    expect(await invited(await reload(), chain, world(2n))).toEqual([2n]);
  });
});
