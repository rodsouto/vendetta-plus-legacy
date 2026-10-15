// Game state for the UI: chain connection, the loaded snapshot, a ticking chain clock and the world
// projected to that clock (B-20), the player's selection, and act(): validate an action in the
// simulator, then send it, wait for it and reload.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { gameAbi } from "../chain/abi.js";
import { devAccount, loadDeployment, makeClients, type Clients } from "../chain/config.js";
import { controllerKey, loadWorld, project, cloneWorld, type Snapshot } from "../chain/load.js";

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
  /** Send from the admin account (dev panel). */
  asAdmin?: boolean;
}

interface Game {
  clients: Clients;
  account: number;
  setAccount: (i: number) => void;
  address: Address;
  controller: string;
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
  toasts: Toast[];
}

const Ctx = createContext<Game | null>(null);
export const useGame = () => {
  const g = useContext(Ctx);
  if (!g) throw new Error("useGame outside GameProvider");
  return g;
};

const storedAccount = () => {
  try {
    return Number(localStorage.getItem("devAccount") ?? "1");
  } catch {
    return 1;
  }
};

export function useDeployment() {
  return useQuery({ queryKey: ["deployment"], queryFn: loadDeployment, staleTime: Infinity });
}

export function GameProvider({
  clients,
  children,
}: {
  clients: Clients;
  children: (ready: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [account, setAccountState] = useState(storedAccount);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const offset = useRef(0); // chain time − wall clock, in seconds (anvil time travel)
  const [wall, setWall] = useState(() => Math.floor(Date.now() / 1000));

  const snapshotQuery = useQuery({
    queryKey: ["world", clients.deployment.game],
    queryFn: () => loadWorld(clients.public, clients.deployment.game),
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

  const address = devAccount(account).address;
  const controller = controllerKey(address);
  const me = world ? world.players.get(world.playerOf.get(controller) ?? 0n) : undefined;
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

  const act = useCallback(
    async (r: ActRequest) => {
      if (!snapshot) return false;
      if (r.check) {
        const w = cloneWorld(project(snapshot.world, now));
        try {
          r.check(w, controller, now);
        } catch (e) {
          if (e instanceof sim.GameError) {
            toast(t(`errors.${e.code}`), true);
            return false;
          }
          throw e;
        }
      }
      setBusy(true);
      try {
        const wallet = clients.wallet(r.asAdmin ? 0 : account);
        const hash = await wallet.writeContract({
          address: clients.deployment.game,
          abi: gameAbi,
          functionName: r.functionName,
          args: r.args,
          chain: wallet.chain,
          account: wallet.account!,
        } as never);
        const receipt = await clients.public.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("reverted");
        toast(r.done);
        await refresh();
        return true;
      } catch (e) {
        let name = "unknown";
        if (e instanceof BaseError) {
          const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
          if (revert instanceof ContractFunctionRevertedError)
            name = revert.data?.errorName ?? name;
        }
        toast(t(`errors.${name}`, { defaultValue: t("errors.unknown") }), true);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [snapshot, now, controller, clients, account, toast, t, refresh],
  );

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

  const setAccount = (i: number) => {
    setAccountState(i);
    setSelected(null);
    try {
      localStorage.setItem("devAccount", String(i));
    } catch {
      /* private mode */
    }
  };

  if (!snapshot || !world) return <>{children(false)}</>;
  const game: Game = {
    clients,
    account,
    setAccount,
    address,
    controller,
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
    toasts,
  };
  return <Ctx.Provider value={game}>{children(true)}</Ctx.Provider>;
}

export const useClients = (deployment: Parameters<typeof makeClients>[0]) =>
  useMemo(() => makeClients(deployment), [deployment]);
