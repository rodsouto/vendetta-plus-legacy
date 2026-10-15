// Small ledger parts shared by the pages.
import { useTranslation } from "react-i18next";
import { vendetta as rs, type ResourceCosts } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { amount, duration, whole } from "./format.js";
import { Icon } from "./icons.js";

/** A cost as ledger figures; resources the building lacks are written in red ink. */
export function Cost({ cost, stock }: { cost: ResourceCosts; stock?: bigint[] }) {
  const { t } = useTranslation();
  const items = rs.resources.map((r, i) => ({ r, i, v: cost[r] ?? 0n })).filter((x) => x.v > 0n);
  if (items.length === 0) return <span className="muted">—</span>;
  return (
    <ul className="inline-list">
      {items.map(({ r, i, v }) => {
        const short = stock !== undefined && whole(stock[i]!) < v;
        return (
          <li key={r} className={short ? "red" : undefined}>
            <Icon name={r} label={t(`resources.${r}`)} /> {amount(v)}
          </li>
        );
      })}
    </ul>
  );
}

export function Countdown({ at }: { at: bigint }) {
  const { now } = useGame();
  const { t } = useTranslation();
  return <span className="num">{at <= now ? t("common.now") : duration(at - now)}</span>;
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div aria-live="polite">
      {toasts.slice(-1).map((x) => (
        <div
          key={x.id}
          className={`stamp-toast${x.error ? " error" : ""}`}
          role={x.error ? "alert" : "status"}
        >
          {x.text}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  return <p className="empty">{children ?? t("common.none")}</p>;
}

/** Resources that appear in costs (no entity costs the converted resource), in ruleset order. */
export const COST_RESOURCES = rs.resources
  .map((r, i) => ({ r, i }))
  .filter(({ r }) => r !== "alcohol");

export function CostHeads() {
  const { t } = useTranslation();
  return (
    <>
      {COST_RESOURCES.map(({ r }) => (
        <th key={r} className="num c-res">
          <Icon name={r} label={t(`resources.${r}`)} />
        </th>
      ))}
    </>
  );
}

/** One right-aligned cell per resource (desktop) plus the compact list (phones). */
export function CostCells({ cost, stock }: { cost: ResourceCosts; stock?: bigint[] }) {
  return (
    <>
      {COST_RESOURCES.map(({ r, i }) => {
        const v = cost[r] ?? 0n;
        const short = stock !== undefined && v > 0n && whole(stock[i]!) < v;
        return (
          <td key={r} className={`num c-res${short ? " red" : ""}`}>
            {v > 0n ? amount(v) : <span className="muted">—</span>}
          </td>
        );
      })}
      <td className="c-cost-mobile">
        <Cost cost={cost} stock={stock} />
      </td>
    </>
  );
}

/** Entries whose requirements are not met, folded away under one summary. */
export function Locked({ items }: { items: { key: string; name: string; why: string }[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <details className="locked">
      <summary>
        {t("book.locked")} ({items.length})
      </summary>
      <ul>
        {items.map((x) => (
          <li key={x.key}>
            <strong>{x.name}</strong> <span className="red">{x.why}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
