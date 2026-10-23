// Game state for the UI: chain connection, the signer, the loaded snapshot, a ticking chain clock
// and the world projected to that clock (B-20), the player's selection, and act(): validate an
// action in the simulator, then send it, wait for it and reload. With passkeys, act() first renews
// this device's session when it has lapsed (one passkey prompt), so game actions never prompt.
// Hidden missions (B-22): a hidden mission resolves at its reveal, so this client reveals its own
// as they arrive, and every send reveals first its own due ones it has not revealed yet. Others'
// are revealed by their owner or the keeper: a parked mission holds no action back.
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
import type { Address } from "viem";
import { useTranslation } from "react-i18next";
import { sim, vendetta as rs, type HiddenPlain } from "@vendetta/rules";
import { makeClients, type Clients } from "../chain/config.js";
import { loadNetwork, type Network } from "../chain/networks.js";
import {
  byArrival,
  clockOffset,
  cloneWorld,
  controllerKey,
  loadWorld,
  pendingFor,
  project,
  type Pending,
  type Snapshot,
} from "../chain/load.js";
import {
  allStoredPlains,
  storePlain,
  storedPlains,
  timelockFor,
  type Timelock,
} from "../chain/hidden.js";
import { parseRecoveryCode, recoveryKey, rememberUsedRecovery } from "../account/recovery.js";
import { DevSigner, PasskeySigner, makeSigner, type Call, type From } from "../account/signer.js";
import { cancelled, errorName, gameCall, revealPlan, sendBehindQueue } from "./backlog.js";

// The passkey stack (permissionless, ox) loads on first use, not with the app.
const passkeys = () => import("../account/passkey.js");
const sessions = () => import("../account/session.js");

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
  /** The time of a block fetched now (the clock on a local chain). */
  chainNow: () => Promise<bigint>;
  /** Encrypts hidden missions until their arrival (B-22). */
  timelock: Timelock;
  /** Plaintexts of hidden missions this client can reveal, by commitment. */
  known: ReadonlyMap<string, HiddenPlain>;
  /** Keeps the plaintext of a hidden mission this device sends. */
  rememberHidden: (commit: string, p: HiddenPlain) => void;
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
  /** Passkeys: this device has a passkey made to join an account and waits to be invited. */
  joining: boolean;
  /** A new passkey on this device to join an account another device invites it to (B-26). */
  prepareDevice: () => Promise<boolean>;
  /** Invites another device's account (or a recovery code's, `recovery`) to manage this player. */
  inviteController: (a: Address, recovery?: boolean) => Promise<boolean>;
  /** Drops an invitation this player made (sim key). */
  cancelInvite: (key: string) => Promise<boolean>;
  /** Invitations and due transfers waiting for this device's account to accept (B-26). */
  pending: Pending[];
  /** Accepts one of them from this device's account (a passkey prompt). */
  acceptPending: (p: Pending) => Promise<boolean>;
  /**
   * Removes a controller (sim key): this device leaves at once (and signs out); another one is
   * scheduled by the first call and removed by the same call once due (B-26).
   */
  removeController: (key: string) => Promise<boolean>;
  /** Drops a scheduled removal (sim key). */
  cancelRemoval: (key: string) => Promise<boolean>;
  /** Activates a recovery code the player has written down. */
  addRecoveryCode: (code: string) => Promise<boolean>;
  /** Signed out: a new passkey on this device, added to the player by its recovery code. */
  recover: (code: string) => Promise<boolean>;
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
  const offset = useRef(0); // chain time − wall clock, in seconds (clockOffset)
  const live = network.id !== "local";
  const [wall, setWall] = useState(() => Math.floor(Date.now() / 1000));

  const actor = signer.actor;
  const snapshotQuery = useQuery({
    queryKey: ["world", clients.deployment.game, signer.mode === "passkey" ? actor : null],
    queryFn: () =>
      loadWorld(
        clients.public,
        clients.deployment.game,
        signer.mode === "passkey" && actor ? [actor] : [],
        signer.mode === "passkey" ? (signer.controller ?? undefined) : undefined,
      ),
    refetchInterval: 6000,
  });
  const snapshot = snapshotQuery.data;
  if (snapshot) offset.current = clockOffset(offset.current, snapshot, live);

  useEffect(() => {
    const id = setInterval(() => setWall(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Never before the snapshot: a device clock that jumped back must not project into the past.
  const now =
    snapshot && BigInt(wall + offset.current) < snapshot.chainTime
      ? snapshot.chainTime
      : BigInt(wall + offset.current);
  const game = clients.deployment.game;
  const timelock = useMemo(() => timelockFor(network), [network]);
  // Own plaintexts are kept per player account; switching accounts starts from that one's.
  const account = signer.controller ? controllerKey(signer.controller) : "";
  const [known, setKnown] = useState(() => storedPlains(game, account));
  const [knownFor, setKnownFor] = useState(account);
  if (knownFor !== account) {
    setKnownFor(account);
    setKnown(storedPlains(game, account));
  }
  const rememberHidden = useCallback(
    (commit: string, p: HiddenPlain) => {
      storePlain(game, account, commit, p);
      setKnown((k) => new Map(k).set(commit.toLowerCase(), p));
    },
    [game, account],
  );
  const world = useMemo(
    () => (snapshot ? project(snapshot.world, now, known) : null),
    [snapshot, now, known],
  );

  const address = signer.controller;
  const owner = address ? controllerKey(address) : "";
  const controller = actor ? controllerKey(actor) : "";
  const me = world && owner ? world.players.get(world.playerOf.get(owner) ?? 0n) : undefined;
  const liveSession =
    signer.mode === "passkey" && world && me && sim.sessionPlayer(world, controller, now) === me.id
      ? world.sessions.get(controller)!.until
      : 0n;
  // An invitation this player made to this device's session, not accepted yet (B-15): the next
  // action accepts it in front, without a prompt.
  const sessionInvite =
    signer.mode === "passkey" && world && me && liveSession === 0n
      ? world.invites.get(sim.inviteKey(controller, me.id))
      : undefined;
  const invitedSession =
    !!sessionInvite &&
    sessionInvite.kind === sim.INVITE_SESSION &&
    sessionInvite.until > now &&
    sessionInvite.epoch === me!.sessionEpoch;
  // What the player sees: this device plays without a prompt until then, accepted or still invited.
  const sessionUntil = liveSession > 0n ? liveSession : invitedSession ? sessionInvite.until : 0n;

  // What waits for this device's account when it has no player: invitations, due transfers.
  const pendingQuery = useQuery({
    // Query keys are hashed as JSON: no bigint in them.
    queryKey: ["pending", game, address, Number(snapshot?.block ?? 0n)],
    queryFn: () =>
      address && snapshot
        ? pendingFor(
            clients.public,
            game,
            clients.deployment.fromBlock,
            address,
            snapshot.world,
            now,
          )
        : Promise.resolve([] as Pending[]),
    enabled: !!address && !!snapshot && !me,
  });
  const pending = useMemo(() => (me ? [] : (pendingQuery.data ?? [])), [me, pendingQuery.data]);
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

  // A fresh authorization ends a little before the cap, so it still fits when it lands on chain.
  const sessionDeadline = (at: bigint) => at + rs.config.maxSessionSeconds - 600n;
  const days = Number(rs.config.controllerRemovalDelay / 86400n); // B-26, for the toasts

  /** The chain time now, from the wall clock (anvil time travel moves `offset`). */
  const clock = useCallback(() => BigInt(Math.floor(Date.now() / 1000) + offset.current), []);

  /**
   * The time of a block fetched now. On a live chain what must not leave before a time on chain
   * waits for it: a reveal before its mission arrives shows the target (B-22). An idle anvil's
   * latest block lags, so a local chain uses the clock.
   */
  const chainNow = useCallback(
    async () => (live ? (await clients.public.getBlock()).timestamp : clock()),
    [live, clients, clock],
  );

  /**
   * Sends the calls behind an advance() for the due missions and the reveals they need
   * (backlog.ts: one retry on Backlog, then the keeper catches up, B-08; reveals in order, B-22)
   * and resolves to the ids it revealed. The reveals are planned at a fresh block's time: only
   * missions that arrived on chain go.
   */
  const send = useCallback(
    (calls: Call[], from: From): Promise<bigint[]> =>
      sendBehindQueue({
        world: snapshot ? cloneWorld(snapshot.world) : undefined,
        known,
        game,
        calls,
        submit: (c) => signer.send(c, from),
        clock: chainNow,
      }),
    [snapshot, known, game, signer, chainNow],
  );

  // Reveals this client's own hidden missions as they arrive (B-22): a hidden mission resolves at
  // its reveal, so the sender reveals at the arrival, within the head start before anyone else can
  // open the ciphertext, instead of waiting for the keeper. send() plans at a fresh block's time,
  // so until the chain reaches the arrival it reveals nothing and this tries again on the next
  // tick. One try per mission once sent (a reveal that does not land goes in front of the next
  // action, or the keeper makes it); never during an action, and never with a lapsed passkey
  // session, which would prompt out of the blue. It holds `busy` while its transaction is out: a
  // concurrent action from the same account would take the same nonce.
  const revealedAtArrival = useRef(new Set<bigint>());
  useEffect(() => {
    if (!snapshot || !me || busy) return;
    if (signer.mode === "passkey" && liveSession === 0n) return;
    const due = revealPlan(snapshot.world, known, game, now).accepted.filter(
      (x) => !revealedAtArrival.current.has(x.id),
    );
    if (due.length === 0) return;
    setBusy(true);
    send([], "actor")
      .then((ids) => {
        for (const id of ids) revealedAtArrival.current.add(id);
        if (ids.length > 0) return refresh();
      })
      .catch((e) => {
        for (const x of due) revealedAtArrival.current.add(x.id);
        console.warn("reveal at arrival", e);
      })
      .finally(() => setBusy(false));
  }, [snapshot, me, now, busy, signer, liveSession, known, game, send, refresh]);

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
      try {
        const w = project(snapshot.world, now, known);
        r.renew?.check(w);
        r.check?.(w, now);
      } catch (e) {
        if (e instanceof sim.GameError) {
          toast(t(`errors.${e.code}`), true);
          return false;
        }
        return fail(e); // a projection that breaks must not fail silently
      }
      setBusy(true);
      try {
        if (r.renew) await signer.send(r.renew.calls, "controller");
        await send(r.calls, r.from);
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
    [snapshot, now, known, signer, toast, t, refresh, fail, send],
  );

  /**
   * Authorizes this device's session again. A passkey account not yet in the directory (one that
   * joined from another device or a recovery code) publishes its passkey in the same operation.
   */
  const renewal = useCallback(async () => {
    const until = sessionDeadline(now);
    const key = controller;
    const calls: Call[] = [];
    if (signer instanceof PasskeySigner && signer.identity && !signer.identity.published) {
      const { isPublished, publishCall } = await passkeys();
      if (await isPublished(clients.public, signer.directory, signer.identity)) signer.settled();
      else calls.push(publishCall(signer.directory, signer.identity));
    }
    calls.push(gameCall(game, "authorizeSession", [actor, until]));
    return { check: (w: sim.World) => sim.authorizeSession(w, owner, key, until, now), calls };
  }, [now, controller, owner, actor, game, signer, clients]);

  const act = useCallback(
    async (r: ActRequest) => {
      const from = r.from ?? "actor";
      const caller = from === "controller" ? owner : controller;
      // A lapsed session is invited again by the controller (a prompt) unless an invitation is
      // already waiting; either way the session accepts in front of the action (B-15).
      const lapsed = signer.mode === "passkey" && from === "actor" && me && liveSession === 0n;
      const renew = lapsed && !invitedSession ? await renewal() : undefined;
      const accept: Call[] = lapsed ? [gameCall(game, "acceptSession", [me.id])] : [];
      const ok = await run({
        done: r.done,
        check: (w, n) => {
          if (lapsed) sim.acceptSession(w, controller, me.id, n);
          r.check?.(w, caller, n);
        },
        calls: [...accept, gameCall(game, r.functionName, r.args)],
        from,
        renew,
      });
      if (ok && renew && signer instanceof PasskeySigner) signer.settled();
      return ok;
    },
    [signer, owner, controller, me, liveSession, invitedSession, run, renewal, game],
  );

  const createAccount = useCallback(
    async (at: sim.Coord) => {
      if (!(signer instanceof PasskeySigner)) return false;
      const calls: Call[] = [];
      setBusy(true);
      try {
        const { isPublished, publishCall } = await passkeys();
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
      const ok = await run({
        done: t("register.done"),
        check: (w, n) => {
          sim.register(w, own, at, n);
          sim.authorizeSession(w, own, controllerKey(session), until, n);
        },
        calls,
        from: "controller",
      });
      if (ok) signer.settled();
      return ok;
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

  const renewSession = useCallback(async () => {
    const r = await renewal();
    const ok = await run({
      done: t("session.renewed"),
      check: r.check,
      calls: r.calls,
      from: "controller",
    });
    if (ok && signer instanceof PasskeySigner) signer.settled();
    return ok;
  }, [renewal, run, t, signer]);

  const revokeSession = useCallback(async () => {
    if (!actor) return false;
    const key = controller;
    // A session still invited, not accepted (B-15), is dropped by cancelling the invitation.
    const invited = liveSession === 0n;
    const ok = await run({
      done: t("session.revoked"),
      check: (w, n) =>
        invited ? sim.cancelInvite(w, owner, key, n) : sim.revokeSession(w, owner, key, n),
      calls: [gameCall(game, invited ? "cancelInvite" : "revokeSession", [actor])],
      from: "controller",
    });
    if (ok) signOut();
    return ok;
  }, [actor, controller, owner, liveSession, game, run, signOut, t]);

  const prepareDevice = useCallback(async () => {
    if (!(signer instanceof PasskeySigner)) return false;
    setBusy(true);
    try {
      await signer.create("Vendetta", true);
      return true;
    } catch (e) {
      return fail(e);
    } finally {
      setBusy(false);
    }
  }, [signer, fail]);

  const inviteController = useCallback(
    (a: Address, recovery = false, done = t("devices.invited")) =>
      act({
        done,
        check: (w, c, n) => sim.inviteController(w, c, controllerKey(a), recovery, n),
        functionName: "inviteController",
        args: [a, recovery],
        from: "controller",
      }),
    [act, t],
  );

  const cancelInvite = useCallback(
    (key: string) =>
      act({
        done: t("devices.uninvited"),
        check: (w, c, n) => sim.cancelInvite(w, c, key, n),
        functionName: "cancelInvite",
        args: [key],
        from: "controller",
      }),
    [act, t],
  );

  /**
   * This device's account accepts an invitation or a due transfer (B-26) and, with passkeys,
   * publishes its passkey if needed and invites this device's session in the same operation.
   */
  const acceptPending = useCallback(
    async (p: Pending) => {
      if (!address || !snapshot) return false;
      const calls: Call[] = [];
      const own = controllerKey(address);
      const until = sessionDeadline(now);
      const session = signer instanceof PasskeySigner ? signer.session?.address : undefined;
      setBusy(true);
      try {
        if (signer instanceof PasskeySigner && signer.identity && !signer.identity.published) {
          const { isPublished, publishCall } = await passkeys();
          if (await isPublished(clients.public, signer.directory, signer.identity))
            signer.settled();
          else calls.push(publishCall(signer.directory, signer.identity));
        }
      } catch (e) {
        return fail(e);
      } finally {
        setBusy(false);
      }
      calls.push(
        p.kind === "transfer"
          ? gameCall(game, "acceptTransfer", [p.player])
          : gameCall(game, "acceptController", [p.player]),
      );
      if (session) calls.push(gameCall(game, "authorizeSession", [session, until]));
      const ok = await run({
        done: t(p.kind === "transfer" ? "account.transferred" : "devices.joined"),
        check: (w, n) => {
          if (p.kind === "transfer") sim.acceptTransfer(w, own, p.player, n);
          else {
            // The loaded world carries only this device's session invitations: add the one found.
            w.invites.set(sim.inviteKey(own, p.player), {
              kind: sim.INVITE_CONTROLLER,
              recovery: p.recovery,
              until: p.at,
              epoch: w.players.get(p.player)!.sessionEpoch,
            });
            sim.acceptController(w, own, p.player, n);
          }
          if (session) sim.authorizeSession(w, own, controllerKey(session), until, n);
        },
        calls,
        from: "controller",
      });
      if (ok && signer instanceof PasskeySigner) signer.settled();
      return ok;
    },
    [address, snapshot, now, signer, clients, game, run, fail, t],
  );

  const removeController = useCallback(
    async (key: string) => {
      if (key === owner) {
        // This device leaves the account: its session dies with it.
        const ok = await act({
          done: t("devices.removed"),
          check: (w, c, n) => sim.removeController(w, c, key, n),
          functionName: "removeController",
          args: [key],
          from: "controller",
        });
        if (ok) signOut();
        return ok;
      }
      // The first call schedules the removal, the same call once due executes it (B-26). Both
      // kill every session, so this device authorizes its own again in the same operation.
      const at = me?.removalAt.get(key);
      const executes = at !== undefined && now >= at;
      const until = sessionDeadline(now);
      // Both steps kill every session: this device invites its own again in the same operation
      // and accepts it with its next action.
      const calls = [gameCall(game, "removeController", [key])];
      if (actor) calls.push(gameCall(game, "authorizeSession", [actor, until]));
      return run({
        done: executes ? t("devices.removed") : t("devices.scheduled", { days }),
        check: (w, n) => {
          sim.removeController(w, owner, key, n);
          if (actor) sim.authorizeSession(w, owner, controller, until, n);
        },
        calls,
        from: "controller",
      });
    },
    [me, owner, controller, actor, now, days, game, act, run, signOut, t],
  );

  const cancelRemoval = useCallback(
    (key: string) =>
      act({
        done: t("devices.cancelled"),
        check: (w, c, n) => sim.cancelRemoval(w, c, key, n),
        functionName: "cancelRemoval",
        args: [key],
        from: "controller",
      }),
    [act, t],
  );

  /**
   * Activates a recovery code: the player invites the code's account (a prompt), and the code's
   * account accepts at once (sponsored, no prompt: this device holds the key right now).
   */
  const addRecoveryCode = useCallback(
    async (code: string) => {
      const bytes = parseRecoveryCode(code);
      if (!bytes || !me) {
        toast(t("errors.invalidCode"), true);
        return false;
      }
      const { sessionAccount } = await sessions();
      const key = recoveryKey(bytes);
      const a = (await sessionAccount(clients.public, key)).address;
      const invited = await inviteController(a, true, t("devices.invited"));
      if (!invited) return false;
      const pid = me.id;
      const ok = await run({
        done: t("devices.activated"),
        // The loaded world carries no invitation for the code's account: it was just made on chain.
        check: (w, n) => {
          w.invites.set(sim.inviteKey(controllerKey(a), pid), {
            kind: sim.INVITE_CONTROLLER,
            recovery: true,
            until: n + rs.config.inviteTtl,
            epoch: w.players.get(pid)!.sessionEpoch,
          });
          sim.acceptController(w, controllerKey(a), pid, n);
        },
        calls: [gameCall(game, "acceptController", [pid])],
        from: signer.mode === "passkey" ? { key } : "controller",
      });
      return ok;
    },
    [clients, me, signer, game, inviteController, run, toast, t],
  );

  const recover = useCallback(
    async (code: string) => {
      if (!(signer instanceof PasskeySigner) || !snapshot) return false;
      const { sessionAccount } = await sessions();
      const bytes = parseRecoveryCode(code);
      const key = bytes && recoveryKey(bytes);
      const rec = key && controllerKey((await sessionAccount(clients.public, key)).address);
      const pid = rec ? snapshot.world.playerOf.get(rec) : undefined;
      if (!key || !rec || pid === undefined) {
        toast(t("errors.invalidCode"), true);
        return false;
      }
      setBusy(true);
      try {
        // A passkey from an earlier attempt that did not land is reused.
        if (!signer.identity?.joining) await signer.create(`Vendetta #${pid}`, true);
        const id = signer.identity!;
        const kernel = controllerKey(id.address);
        const session = signer.session!.address;
        const until = sessionDeadline(now);
        const w = project(snapshot.world, now, known); // a fresh copy
        sim.inviteController(w, rec, kernel, false, now);
        sim.acceptController(w, kernel, pid, now);
        sim.authorizeSession(w, kernel, controllerKey(session), until, now);
        // The code's account invites the new one (no prompt); the new account accepts, publishes
        // its passkey and invites this device's session (a prompt). If that is cancelled, the
        // invitation waits on the entry screen.
        await send([gameCall(game, "inviteController", [id.address, false])], { key });
        const calls: Call[] = [];
        const { isPublished, publishCall } = await passkeys();
        if (!(await isPublished(clients.public, signer.directory, id)))
          calls.push(publishCall(signer.directory, id));
        calls.push(
          gameCall(game, "acceptController", [pid]),
          gameCall(game, "authorizeSession", [session, until]),
        );
        await send(calls, "controller");
        signer.settled();
        rememberUsedRecovery(clients.deployment.chainId, rec); // the list suggests replacing it
        toast(t("recovery.done"));
        return true;
      } catch (e) {
        if (e instanceof sim.GameError) {
          toast(t(`errors.${e.code}`), true);
          return false;
        }
        return fail(e);
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [signer, snapshot, clients, now, known, game, send, toast, t, fail, refresh],
  );

  /**
   * Dev only. A jump in one go would carry every due hidden mission past its grace and forfeit
   * it (B-22), so the jump stops at the arrival of each mission this browser can reveal (any
   * account's plaintext it stored) and reveals it there, in arrival order, as the keeper would in
   * real time, behind an advance() like any send. A mission that does not reveal stops the jump
   * there: going on would forfeit it before the keeper had a tick. It holds `busy` throughout:
   * the reveals at arrival and the player's actions wait.
   */
  const warp = useCallback(
    async (seconds: number) => {
      const increase = async (s: number) => {
        await clients.public.request({
          method: "evm_increaseTime" as never,
          params: [s] as never,
        });
        await clients.public.request({ method: "evm_mine" as never });
        offset.current += s;
      };
      const start = BigInt(Math.floor(Date.now() / 1000) + offset.current);
      const target = start + BigInt(seconds);
      const plains = allStoredPlains(game);
      const landing = [...(snapshot?.world.missions.values() ?? [])]
        .filter(
          (m) =>
            m.hidden &&
            !m.returning &&
            plains.has(m.commit) &&
            m.arrival > start &&
            m.arrival <= target,
        )
        .sort(byArrival);
      const w = snapshot ? cloneWorld(snapshot.world) : undefined;
      const revealed = new Set<bigint>();
      setBusy(true);
      try {
        let at = start;
        for (const m of landing) {
          if (m.arrival > at) {
            await increase(Number(m.arrival - at));
            at = m.arrival;
          }
          if (!revealed.has(m.id)) {
            try {
              const sent = await sendBehindQueue({
                world: w,
                known: plains,
                game,
                calls: [],
                submit: (c) => signer.send(c, "admin"),
                clock: () => at,
              });
              for (const id of sent) revealed.add(id);
            } catch (e) {
              console.warn("reveal during warp", m.id, e);
            }
          }
          if (!revealed.has(m.id)) {
            toast(t("dev.warpStopped"), true);
            return;
          }
        }
        if (target > at) await increase(Number(target - at));
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [clients, refresh, snapshot, game, signer, toast, t],
  );

  if (!snapshot || !world) return <>{children(false)}</>;
  const value: Game = {
    clients,
    network,
    signer,
    address,
    controller,
    owner,
    sessionUntil,
    snapshot,
    now,
    world,
    me,
    myBuildings,
    building,
    selectBuilding: setSelected,
    act,
    chainNow,
    timelock,
    known,
    rememberHidden,
    busy,
    refresh,
    warp,
    createAccount,
    signIn,
    signOut,
    renewSession,
    revokeSession,
    joining: signer instanceof PasskeySigner && !!signer.identity?.joining && !me,
    prepareDevice,
    inviteController,
    cancelInvite,
    pending,
    acceptPending,
    removeController,
    cancelRemoval,
    addRecoveryCode,
    recover,
    toasts,
  };
  void version; // re-render on signer changes
  return <Ctx.Provider value={value}>{children(true)}</Ctx.Provider>;
}

export const useClients = (network: Network) =>
  useMemo(() => makeClients(network.deployment, network.chain), [network]);
