// Game state for the UI: chain connection, the signer, the loaded snapshot, a ticking chain clock
// and the world projected to that clock (B-20), the player's selection, and act(): validate an
// action in the simulator, then send it, wait for it and reload. With passkeys, act() first renews
// this device's session when it has lapsed (one passkey prompt), so game actions never prompt.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { useTranslation } from "react-i18next";
import { sim, vendetta as rs } from "@vendetta/rules";
import { gameAbi } from "../chain/abi.js";
import { makeClients, type Clients } from "../chain/config.js";
import { loadNetwork, type Network } from "../chain/networks.js";
import { controllerKey, loadWorld, project, cloneWorld, type Snapshot } from "../chain/load.js";
import { isPublished, NoAccountError, publishCall } from "../account/passkey.js";
import {
  DevSigner,
  PasskeySigner,
  RevertedError,
  makeSigner,
  type Call,
  type From,
} from "../account/signer.js";

export interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

export interface ActRequest {
  /** Stamp shown when the transaction is confirmed. */
  done: string;
  /** The same action on the simulator: throws sim.GameError when the contract would revert. */
  check?: (w: sim.World, controller: string, now: bigint) => unknown;
  functionName: string;
  args: readonly unknown[];
  /** Who sends it (default: the actor; account management needs the controller). */
  from?: From;
}

interface Game {
  clients: Clients;
  network: Network;
  signer: DevSigner | PasskeySigner;
  /** The player's account (dev account or passkey account); null when signed out. */
  address: Address | null;
  /** Sim key of the address game actions come from ("" when signed out). */
  controller: string;
  /** Sim key of the player's own account ("" when signed out). */
  owner: string;
  /** Passkeys: this device's session deadline, 0 when it is not live. */
  sessionUntil: bigint;
  snapshot: Snapshot;
  now: bigint;
  world: sim.World;
  me: sim.Player | undefined;
  myBuildings: sim.Building[];
  building: sim.Building | undefined;
  selectBuilding: (id: bigint) => void;
  act: (r: ActRequest) => Promise<boolean>;
  busy: boolean;
  refresh: () => Promise<void>;
  /** Dev only: move the chain clock forward. */
  warp: (seconds: number) => Promise<void>;
  /** Passkeys: create the player (new passkey if needed) with its first building at `at`. */
  createAccount: (at: sim.Coord) => Promise<boolean>;
  signIn: () => Promise<boolean>;
  signOut: () => void;
  renewSession: () => Promise<boolean>;
  /** Revokes this device's session on chain and signs out. */
  revokeSession: () => Promise<boolean>;
  toasts: Toast[];
}

const Ctx = createContext<Game | null>(null);
export const useGame = () => {
  const g = useContext(Ctx);
  if (!g) throw new Error("useGame outside GameProvider");
  return g;
};

export function useNetwork() {
  return useQuery({ queryKey: ["network"], queryFn: loadNetwork, staleTime: Infinity });
}

/** A passkey prompt the player dismissed (WebAuthn's NotAllowedError, wrapped or not). */
const cancelled = (e: unknown): boolean => {
  for (let x = e as { name?: string; cause?: unknown } | undefined; x; x = x.cause as never)
    if (x.name === "NotAllowedError") return true;
  return false;
};

/** The contract's custom error behind a failed send, "unknown" when there is none. */
const errorName = (e: unknown): string => {
  if (cancelled(e)) return "cancelled";
  if (e instanceof NoAccountError) return "noAccount";
  if (e instanceof RevertedError) return e.errorName ?? "unknown";
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? "unknown";
  }
  return "unknown";
};

const gameCall = (game: Address, functionName: string, args: readonly unknown[]): Call => ({
  to: game,
  abi: gameAbi,
  functionName,
  args,
});

export function GameProvider({
  clients,
  network,
  children,
}: {
  clients: Clients;
  network: Network;
  children: (ready: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const signer = useMemo(() => makeSigner(clients, network), [clients, network]);
  const version = useSyncExternalStore(signer.subscribe, () => signer.version);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const offset = useRef(0); // chain time − wall clock, in seconds (anvil time travel)
  const [wall, setWall] = useState(() => Math.floor(Date.now() / 1000));

  const actor = signer.actor;
  const snapshotQuery = useQuery({
    queryKey: ["world", clients.deployment.game, signer.mode === "passkey" ? actor : null],
    queryFn: () =>
      loadWorld(
        clients.public,
        clients.deployment.game,
        signer.mode === "passkey" && actor ? [actor] : [],
      ),
    refetchInterval: 6000,
  });
  const snapshot = snapshotQuery.data;
  if (snapshot) {
    offset.current = Math.max(
      offset.current,
      Number(snapshot.chainTime) - Math.floor(Date.now() / 1000),
    );
  }

  useEffect(() => {
    const id = setInterval(() => setWall(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const now = BigInt(wall + offset.current);
  const world = useMemo(
    () =>
      snapshot
        ? project(snapshot.world, now > snapshot.chainTime ? now : snapshot.chainTime)
        : null,
    [snapshot, now],
  );

  const address = signer.controller;
  const owner = address ? controllerKey(address) : "";
  const controller = actor ? controllerKey(actor) : "";
  const me = world && owner ? world.players.get(world.playerOf.get(owner) ?? 0n) : undefined;
  const liveSession =
    signer.mode === "passkey" && world && me && sim.sessionPlayer(world, controller, now) === me.id
      ? world.sessions.get(controller)!.until
      : 0n;
  const myBuildings =
    world && me ? [...world.buildings.values()].filter((b) => b.owner === me.id) : [];
  const building = myBuildings.find((b) => b.id === selected) ?? myBuildings[0];

  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, error }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), error ? 5200 : 2400);
  }, []);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["world"] });
    await qc.invalidateQueries({ queryKey: ["battles"] });
  }, [qc]);

  const game = clients.deployment.game;
  // A fresh authorization ends a little before the cap, so it still fits when it lands on chain.
  const sessionDeadline = (at: bigint) => at + rs.config.maxSessionSeconds - 600n;

  const fail = useCallback(
    (e: unknown) => {
      const name = errorName(e);
      if (name === "unknown") console.error(e);
      toast(t(`errors.${name}`, { defaultValue: t("errors.unknown") }), true);
      return false;
    },
    [t, toast],
  );

  /**
   * Checks `check` on a projected copy of the world, sends the calls and reloads. `renew` (the
   * session renewal act() adds) is checked and sent first.
   */
  const run = useCallback(
    async (r: {
      done: string;
      check?: (w: sim.World, now: bigint) => unknown;
      calls: Call[];
      from: From;
      renew?: { check: (w: sim.World) => unknown; calls: Call[] };
    }) => {
      if (!snapshot) return false;
      const w = cloneWorld(project(snapshot.world, now));
      try {
        r.renew?.check(w);
        r.check?.(w, now);
      } catch (e) {
        if (e instanceof sim.GameError) {
          toast(t(`errors.${e.code}`), true);
          return false;
        }
        throw e;
      }
      setBusy(true);
      try {
        if (r.renew) await signer.send(r.renew.calls, "controller");
        try {
          await signer.send(r.calls, r.from);
        } catch (e) {
          if (errorName(e) !== "Backlog") throw e;
          // Due missions piled up, or more came due than the gas allowed for (B-08): process
          // them first, in the same operation, and retry once.
          const advance = gameCall(game, "advance", [BigInt(sim.MAX_MISSIONS_PER_TX)]);
          await signer.send([advance, ...r.calls], r.from);
        }
        toast(r.done);
        await refresh();
        return true;
      } catch (e) {
        if (r.renew) await refresh(); // the renewal may have landed
        return fail(e);
      } finally {
        setBusy(false);
      }
    },
    [snapshot, now, signer, toast, t, refresh, fail, game],
  );

  const renewal = useCallback(() => {
    const until = sessionDeadline(now);
    const key = controller;
    return {
      check: (w: sim.World) => sim.authorizeSession(w, owner, key, until, now),
      calls: [gameCall(game, "authorizeSession", [actor, until])],
    };
  }, [now, controller, owner, actor, game]);

  const act = useCallback(
    (r: ActRequest) => {
      const from = r.from ?? "actor";
      const caller = from === "controller" ? owner : controller;
      const lapsed = signer.mode === "passkey" && from === "actor" && me && liveSession === 0n;
      return run({
        done: r.done,
        check: r.check && ((w, n) => r.check!(w, caller, n)),
        calls: [gameCall(game, r.functionName, r.args)],
        from,
        renew: lapsed ? renewal() : undefined,
      });
    },
    [signer, owner, controller, me, liveSession, run, renewal, game],
  );

  const createAccount = useCallback(
    async (at: sim.Coord) => {
      if (!(signer instanceof PasskeySigner)) return false;
      const calls: Call[] = [];
      setBusy(true);
      try {
        // A passkey made by an earlier attempt that did not land is reused.
        if (!signer.identity)
          await signer.create(`Vendetta ${at.city}:${at.neighborhood}:${at.slot}`);
        if (!(await isPublished(clients.public, signer.directory, signer.identity!)))
          calls.push(publishCall(signer.directory, signer.identity!));
      } catch (e) {
        return fail(e);
      } finally {
        setBusy(false);
      }
      const own = controllerKey(signer.identity!.address);
      const session = signer.session!.address;
      const until = sessionDeadline(now);
      calls.push(
        gameCall(game, "register", [at.city, at.neighborhood, at.slot]),
        gameCall(game, "authorizeSession", [session, until]),
      );
      return run({
        done: t("register.done"),
        check: (w, n) => {
          sim.register(w, own, at, n);
          sim.authorizeSession(w, own, controllerKey(session), until, n);
        },
        calls,
        from: "controller",
      });
    },
    [signer, now, clients, game, run, fail, t],
  );

  const signIn = useCallback(async () => {
    if (!(signer instanceof PasskeySigner)) return false;
    setBusy(true);
    try {
      await signer.signIn();
      setSelected(null);
      toast(t("entry.welcome"));
      return true;
    } catch (e) {
      return fail(e);
    } finally {
      setBusy(false);
    }
  }, [signer, fail, toast, t]);

  const signOut = useCallback(() => {
    if (signer instanceof PasskeySigner) signer.signOut();
    setSelected(null);
  }, [signer]);

  const renewSession = useCallback(() => {
    const r = renewal();
    return run({ done: t("session.renewed"), check: r.check, calls: r.calls, from: "controller" });
  }, [renewal, run, t]);

  const revokeSession = useCallback(async () => {
    if (!actor) return false;
    const key = controller;
    const ok = await run({
      done: t("session.revoked"),
      check: (w, n) => sim.revokeSession(w, owner, key, n),
      calls: [gameCall(game, "revokeSession", [actor])],
      from: "controller",
    });
    if (ok) signOut();
    return ok;
  }, [actor, controller, owner, game, run, signOut, t]);

  const warp = useCallback(
    async (seconds: number) => {
      await clients.public.request({
        method: "evm_increaseTime" as never,
        params: [seconds] as never,
      });
      await clients.public.request({ method: "evm_mine" as never });
      offset.current += seconds;
      await refresh();
    },
    [clients, refresh],
  );

  if (!snapshot || !world) return <>{children(false)}</>;
  const value: Game = {
    clients,
    network,
    signer,
    address,
    controller,
    owner,
    sessionUntil: liveSession,
    snapshot,
    now,
    world,
    me,
    myBuildings,
    building,
    selectBuilding: setSelected,
    act,
    busy,
    refresh,
    warp,
    createAccount,
    signIn,
    signOut,
    renewSession,
    revokeSession,
    toasts,
  };
  void version; // re-render on signer changes
  return <Ctx.Provider value={value}>{children(true)}</Ctx.Provider>;
}

export const useClients = (network: Network) =>
  useMemo(() => makeClients(network.deployment, network.chain), [network]);
