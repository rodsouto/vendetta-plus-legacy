// The neighborhood plat: 17 × 15 lots of one city:neighborhood (00-overview.md#world-map).
import { Fragment, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { sim, vendetta as rs } from "@vendetta/rules";
import { useGame } from "../state/game.js";

export interface Lot {
  city: bigint;
  neighborhood: bigint;
  slot: bigint;
}

export function PlatNav({ at, onChange }: { at: Lot; onChange: (l: Lot) => void }) {
  const { t } = useTranslation();
  const c = rs.config;
  const num = (v: string, max: bigint) => {
    const n = BigInt(Math.max(1, Math.min(Number(max), Number(v.replace(/\D/g, "")) || 1)));
    return n;
  };
  return (
    <div className="form-row">
      <label className="field">
        {t("register.city")}
        <input
          inputMode="numeric"
          value={String(at.city)}
          onChange={(e) => onChange({ ...at, city: num(e.target.value, c.cities) })}
        />
      </label>
      <label className="field">
        {t("register.neighborhood")}
        <input
          inputMode="numeric"
          value={String(at.neighborhood)}
          onChange={(e) => onChange({ ...at, neighborhood: num(e.target.value, c.neighborhoods) })}
        />
      </label>
    </div>
  );
}

export function Plat({
  at,
  selected,
  onPick,
}: {
  at: Lot;
  selected?: bigint;
  onPick: (slot: bigint) => void;
}) {
  const g = useGame();
  const { t } = useTranslation();
  const w = g.world;
  const cols = Number(rs.config.gridColumns);
  const rows = Number(rs.config.gridRows);
  const grid = useRef<HTMLDivElement>(null);
  // Center your own lot (or the selected one) in the plat's own scroller, after layout and again
  // whenever the scroller changes size (rotation, narrow screens). The page itself never scrolls.
  useLayoutEffect(() => {
    const plat = grid.current;
    const scroller = plat?.parentElement;
    if (!plat || !scroller) return;
    const center = () => {
      const el =
        plat.querySelector<HTMLElement>("button[aria-pressed='true']") ??
        plat.querySelector<HTMLElement>("button.mine");
      if (el) scroller.scrollLeft = el.offsetLeft - scroller.clientWidth / 2 + el.offsetWidth / 2;
    };
    const frame = requestAnimationFrame(center);
    const observer = new ResizeObserver(() => center());
    observer.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [at.city, at.neighborhood, w]);
  const cell = (slot: bigint) => {
    const id = w.buildingAt.get(sim.coordKey({ ...at, slot }));
    const b = id === undefined ? undefined : w.buildings.get(id);
    const owner = b ? w.players.get(b.owner) : undefined;
    const mine = !!b && !!g.me && b.owner === g.me.id;
    const fam = owner ? sim.familyOf(w, owner) : 0n;
    const tag = fam ? w.families.get(fam)!.tag.slice(0, 3) : owner ? "•" : "";
    const vacation = owner && sim.onVacation(owner, g.now);
    const label = `${at.city}:${at.neighborhood}:${slot} ${b ? (mine ? t("map.yours") : t("map.owner")) : t("map.empty")}`;
    return (
      <button
        key={String(slot)}
        type="button"
        className={
          [b ? "taken" : "", mine ? "mine" : "", vacation ? "vacation" : ""].join(" ").trim() ||
          undefined
        }
        aria-pressed={selected === slot}
        aria-label={label}
        title={label}
        onClick={() => onPick(slot)}
      >
        {tag}
      </button>
    );
  };
  return (
    <div className="scroll-x">
      <div className="plat" ref={grid} role="grid" aria-label={t("map.title")}>
        <span className="axis" aria-hidden="true" />
        {Array.from({ length: cols }, (_, c) => (
          <span key={`c${c}`} className="axis" aria-hidden="true">
            {c + 1}
          </span>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <Fragment key={`r${r}`}>
            <span className="axis" aria-hidden="true">
              {r + 1}
            </span>
            {Array.from({ length: cols }, (_, c) => cell(BigInt(r * cols + c + 1)))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
