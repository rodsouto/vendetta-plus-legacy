// The building the player works on, switchable from every page (the legacy side menu's −/+), and
// a spoken alert when a new hostile mission heads for one of the player's buildings.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGame } from "../state/game.js";
import { arrivals, buildingState } from "../state/overview.js";
import { coord } from "./format.js";
import { Icon } from "./icons.js";

export function BuildingSwitch() {
  const g = useGame();
  const { t } = useTranslation();
  const list = g.myBuildings;
  if (!g.me || !g.building || list.length < 2) return null;
  const p = g.me;
  const here = list.findIndex((b) => b.id === g.building!.id);
  const coming = arrivals(g.world, p, list);
  const states = list.map((b) => buildingState(g.world, p, b, coming));
  const threatened = states.some((s) => s.threat);
  const step = (by: number) => g.selectBuilding(list[(here + by + list.length) % list.length]!.id);
  // Each option says why the building may need the player, in the overview's order.
  const flag = (i: number) => {
    const s = states[i]!;
    const why = s.threat
      ? t(s.threat === "attack" ? "overview.attack" : "overview.possible")
      : s.full
        ? t("overview.full")
        : s.roomsIdle
          ? t("overview.roomsIdle")
          : "";
    return why ? ` · ${why}` : "";
  };
  return (
    <div className="switch" role="group" aria-label={t("switch.label")}>
      <button type="button" aria-label={t("switch.prev")} onClick={() => step(-1)}>
        <Icon name="prev" />
      </button>
      <select
        aria-label={t("switch.label")}
        className={states[here]?.threat ? "threat" : undefined}
        value={String(g.building.id)}
        onChange={(e) => g.selectBuilding(BigInt(e.target.value))}
      >
        {list.map((b, i) => (
          <option key={String(b.id)} value={String(b.id)}>
            {coord(b.coord)}
            {flag(i)}
          </option>
        ))}
      </select>
      {threatened && (
        <span
          className="alarm"
          role="img"
          aria-label={t("switch.alarm")}
          title={t("switch.alarm")}
        />
      )}
      <button type="button" aria-label={t("switch.next")} onClick={() => step(1)}>
        <Icon name="next" />
      </button>
    </div>
  );
}

/** Hostile missions heading for the player's buildings: their count, and a live announcement. */
export function useHostile() {
  const g = useGame();
  return g.me ? arrivals(g.world, g.me, g.myBuildings).filter((a) => a.hostile) : [];
}

export function HostileAnnouncer() {
  const { t } = useTranslation();
  const hostile = useHostile();
  const seen = useRef<Set<bigint> | null>(null);
  const [text, setText] = useState("");
  const ids = hostile.map((a) => a.m.id).join(",");
  // Keyed by the missions' ids: the world is projected anew every second.
  useEffect(() => {
    const fresh = hostile.filter((a) => !seen.current?.has(a.m.id));
    // The first reading only records what was already on its way.
    if (seen.current && fresh.length > 0) {
      const list = [...new Set(fresh.flatMap((a) => a.targets.map((b) => coord(b.coord))))];
      setText(t("overview.announce", { list: list.join(", ") }));
    }
    seen.current = new Set(hostile.map((a) => a.m.id));
  }, [ids]);
  return (
    <p className="visually-hidden" role="alert">
      {text}
    </p>
  );
}
