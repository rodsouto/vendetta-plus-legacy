// The whole account on one page (the legacy "Visión general" and "Visión global"): what is coming
// to the player's buildings, the state of each one, the research and the missions in flight; and
// side by side, every building's resources, room levels and troops.
import { useTranslation } from "react-i18next";
import { sim, vendetta as rs } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { arrivals, buildingState, type Arrival, type BuildingState } from "../state/overview.js";
import { go, useRoute } from "../router.js";
import { Countdown, Empty } from "../ui/parts.js";
import { Icon } from "../ui/icons.js";
import {
  amount,
  clock,
  coord,
  playerLabel,
  points,
  researchName,
  roomName,
  troopName,
  whole,
} from "../ui/format.js";
import { Register } from "./Register.js";

const views = ["status", "resources", "troops"] as const;
type View = (typeof views)[number];

export function Overview() {
  const g = useGame();
  const { t } = useTranslation();
  const { params } = useRoute();
  if (!g.me || !g.building) return <Register />;
  const view: View = views.find((v) => v === params.get("view")) ?? "status";
  const select = (v: View) => go(v === "status" ? "overview" : `overview?view=${v}`);
  const total = g.myBuildings.reduce((s, b) => s + b.centipoints, 0n);
  return (
    <>
      <header className="account-head">
        <h2>{t("overview.title")}</h2>
        <span className="folio">
          {t("overview.buildingCount", { count: g.myBuildings.length })} · {points(total)}
        </span>
      </header>
      <div className="book-sections" role="tablist" aria-label={t("overview.views")}>
        {views.map((v, index) => (
          <button
            key={v}
            id={`overview-tab-${v}`}
            type="button"
            role="tab"
            aria-selected={view === v}
            aria-controls="overview-panel"
            tabIndex={view === v ? 0 : -1}
            onClick={() => select(v)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % views.length;
              else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = views.length - 1;
              else return;
              event.preventDefault();
              select(views[next]!);
              document
                .getElementById(`overview-tab-${views[next]}`)
                ?.focus({ preventScroll: true });
            }}
          >
            {t(`overview.${v}`)}
          </button>
        ))}
      </div>
      <div id="overview-panel" role="tabpanel" aria-labelledby={`overview-tab-${view}`}>
        {view === "status" ? <Status /> : view === "resources" ? <Resources /> : <Troops />}
      </div>
    </>
  );
}

/** Opens a building's page in the ledger. */
function useOpen() {
  const g = useGame();
  return (b: sim.Building, tab?: string) => {
    g.selectBuilding(b.id);
    go(tab ? `book?tab=${tab}` : "book");
  };
}

function Status() {
  const g = useGame();
  const { t } = useTranslation();
  const open = useOpen();
  const p = g.me!;
  const w = g.world;
  const list = arrivals(w, p, g.myBuildings);
  const states = g.myBuildings.map((b) => ({ b, s: buildingState(w, p, b, list) }));
  const upgrading = states.filter(({ s }) => !s.roomsIdle).length;
  const allBusy = states.every(({ s }) => !s.roomsIdle && !s.recruitIdle && !s.threat && !s.full);
  const research = p.researchQueue[0];
  const researchAt = w.buildings.get(p.researchBuilding);
  const mine = [...w.missions.values()]
    .filter((m) => m.owner === p.id)
    .sort((a, z) => (a.arrival < z.arrival ? -1 : 1));
  return (
    <>
      {list.length > 0 && (
        <section aria-labelledby="arrivals">
          <h3 id="arrivals">{t("overview.arrivals")}</h3>
          <ul className="entries">
            {list.map((a) => (
              <ArrivalLine key={String(a.m.id)} a={a} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="estate">
        <h3 id="estate">
          {t("overview.buildings")}
          <span className="aside">
            {allBusy ? (
              <span className="stamp ink">{t("overview.allBusy")}</span>
            ) : (
              t("overview.upgrading", { busy: upgrading, total: states.length })
            )}
          </span>
        </h3>
        <ul className="estate">
          {states.map(({ b, s }) => (
            <li key={String(b.id)}>
              <EstateRow b={b} s={s} onOpen={open} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="overview-research">
        <h3 id="overview-research">{t("book.research")}</h3>
        {research && researchAt ? (
          <ul className="entries">
            <li>
              <span className="when">
                <Countdown at={research.finishAt} />
              </span>
              <span className="what">
                {researchName(research.index)} → {String(p.research[research.index]! + 1n)}
                <small>
                  {t("overview.researchAt", { coord: coord(researchAt.coord) })} ·{" "}
                  {clock(research.finishAt)}
                </small>
              </span>
              <button className="btn quiet" onClick={() => open(researchAt, "research")}>
                {t("book.goThere")}
              </button>
            </li>
          </ul>
        ) : (
          <Empty>{t("overview.researchNone")}</Empty>
        )}
      </section>

      <section aria-labelledby="overview-missions">
        <h3 id="overview-missions">
          {t("overview.mine")}
          {mine.length > 0 && (
            <span className="aside">
              <a href="#/missions">
                {t("overview.seeAll")} ({mine.length})
              </a>
            </span>
          )}
        </h3>
        {mine.length === 0 ? (
          <Empty />
        ) : (
          <ul className="entries">
            {mine.slice(0, 3).map((m) => (
              <li key={String(m.id)}>
                <span className="when">
                  <Countdown at={m.arrival} />
                </span>
                <span className="what">
                  {m.hidden && !m.returning ? t("missions.hidden") : t(`missions.kinds.${m.kind}`)}{" "}
                  {m.returning
                    ? `· ${t("missions.returning")}`
                    : `→ ${m.hidden ? t("missions.hiddenTarget") : coord(m.target)}`}
                  <small>
                    {t("common.from")} {coord(m.from)} · {clock(m.arrival)}
                  </small>
                </span>
                <span />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * One building on the overview: what it is building and training now, each with its countdown,
 * and the stamps that say why it may need the player.
 */
function EstateRow({
  b,
  s,
  onOpen,
}: {
  b: sim.Building;
  s: BuildingState;
  onOpen: (b: sim.Building) => void;
}) {
  const g = useGame();
  const { t } = useTranslation();
  const room = b.roomQueue[0];
  const work = [
    room && {
      key: "room",
      what: `${roomName(room.index)} → ${String(b.levels[room.index]! + 1n)}`,
      more: b.roomQueue.length - 1,
      at: room.finishAt,
    },
    ...b.training.map((q, i) => {
      const item = q[0];
      return (
        item && {
          key: `training-${i}`,
          what: `${amount(item.quantity)} × ${troopName(item.index)}`,
          more: q.length - 1,
          at: item.finishAt,
        }
      );
    }),
  ].filter((x) => !!x);
  const stamps = [
    s.threat && (
      <span key="threat" className="stamp">
        {t(s.threat === "attack" ? "overview.attack" : "overview.possible")}
      </span>
    ),
    s.full && (
      <span key="full" className="stamp">
        {t("overview.full")}
      </span>
    ),
    s.roomsIdle && (
      <span key="rooms" className="stamp ink">
        {t("overview.roomsIdle")}
      </span>
    ),
    s.recruitIdle && (
      <span key="recruit" className="stamp ink">
        {t("overview.recruitIdle")}
      </span>
    ),
  ].filter(Boolean);
  return (
    <a
      href="#/book"
      aria-current={b.id === g.building?.id ? "true" : undefined}
      title={t("overview.open", { coord: coord(b.coord) })}
      onClick={(e) => {
        e.preventDefault();
        onOpen(b);
      }}
    >
      <span className="estate-coord">{coord(b.coord)}</span>
      <span className="estate-points">
        {t("common.points")} {points(b.centipoints)}
      </span>
      {work.length > 0 && (
        <span className="estate-work">
          {work.map((w) => (
            <span key={w.key} className="estate-line">
              <span>
                {w.what}
                {w.more > 0 && <small> · {t("overview.queued", { count: w.more })}</small>}
              </span>
              <span className="num">
                <Countdown at={w.at} />
              </span>
            </span>
          ))}
        </span>
      )}
      {stamps.length > 0 && <span className="estate-stamps">{stamps}</span>}
    </a>
  );
}

/** Another player's mission on its way: a hidden one names every building it may reach. */
function ArrivalLine({ a }: { a: Arrival }) {
  const g = useGame();
  const { t } = useTranslation();
  const { m } = a;
  const troops = m.troops
    .map((n, i) => (n > 0n ? `${amount(n)} × ${troopName(i)}` : ""))
    .filter(Boolean)
    .join(", ");
  const where = a.targets.map((b) => coord(b.coord)).join(", ");
  return (
    <li className={a.hostile ? "hostile" : undefined}>
      <span className="when">
        <Countdown at={m.arrival} />
      </span>
      <span className="what">
        {m.hidden
          ? `${t("missions.hidden")} · ${t("overview.mayReach", { list: where })}`
          : `${t(`missions.kinds.${m.kind}`)} → ${where}`}
        <small>
          {playerLabel(g.world, m.owner)}
          {troops ? ` · ${troops}` : ""} · {clock(m.arrival)}
        </small>
      </span>
      <span />
    </li>
  );
}

/**
 * The legacy "Visión global": stores and room levels of every building. One building per row, so
 * many buildings grow the tables down, inside a box that keeps the heads and coordinates in view.
 */
function Resources() {
  const g = useGame();
  const { t } = useTranslation();
  const open = useOpen();
  const rows = g.myBuildings.map((b) => ({ b, caps: sim.capacities(g.world, b) }));
  const sum = (f: (r: (typeof rows)[number]) => bigint) => rows.reduce((s, r) => s + f(r), 0n);
  return (
    <>
      <h3>{t("overview.resources")}</h3>
      <div className="matrix-box">
        <table className="ledger matrix">
          <thead>
            <tr>
              <th>{t("book.building")}</th>
              {rs.resources.map((r) => (
                <th key={r} className="num">
                  <Icon name={r} label={t(`resources.${r}`)} />{" "}
                  <span className="res-name" aria-hidden="true">
                    {t(`resources.${r}`)}
                  </span>
                </th>
              ))}
              <th className="num c-points">{t("common.points")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, caps }) => (
              <tr key={String(b.id)}>
                <th scope="row">
                  <BuildingLink b={b} onOpen={open} />
                </th>
                {rs.resources.map((r, i) => {
                  const full = b.stock[i]! >= caps[i]!;
                  return (
                    <td key={r} className={`num${full ? " red" : ""}`}>
                      {amount(whole(b.stock[i]!))}
                      <span className="entry-sub">
                        {full ? t("book.full") : `/ ${amount(whole(caps[i]!))}`}
                      </span>
                    </td>
                  );
                })}
                <td className="num c-points">{points(b.centipoints)}</td>
              </tr>
            ))}
            <tr className="total">
              <th scope="row">{t("overview.total")}</th>
              {rs.resources.map((r, i) => (
                <td key={r} className="num">
                  {amount(whole(sum(({ b }) => b.stock[i]!)))}
                  <span className="entry-sub">/ {amount(whole(sum(({ caps }) => caps[i]!)))}</span>
                </td>
              ))}
              <td className="num c-points">{points(sum(({ b }) => b.centipoints))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{t("overview.levels")}</h3>
      <div className="matrix-box">
        <table className="ledger matrix register">
          <thead>
            <tr>
              <th>{t("book.building")}</th>
              {rs.buildings.map((room) => (
                <th key={room.id} className="vertical" scope="col">
                  <span>{roomName(room.index)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b }) => (
              <tr key={String(b.id)}>
                <th scope="row">
                  <BuildingLink b={b} onOpen={open} tab="rooms" />
                </th>
                {rs.buildings.map((room) => (
                  <td key={room.id} className={`num${b.levels[room.index] ? "" : " muted"}`}>
                    {String(b.levels[room.index]!)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The legacy "Visión global de las tropas": troops at home in every building. */
function Troops() {
  const g = useGame();
  const { t } = useTranslation();
  const open = useOpen();
  const bs = g.myBuildings;
  const kept = rs.troops.filter((tr) => bs.some((b) => b.troops[tr.index]! > 0n));
  return (
    <>
      <h3>{t("overview.troops")}</h3>
      <p className="note">{t("overview.atHome")}</p>
      {kept.length === 0 ? (
        <Empty />
      ) : (
        <div className="matrix-box">
          <table className="ledger matrix register">
            <thead>
              <tr>
                <th>{t("book.building")}</th>
                {kept.map((tr) => (
                  <th key={tr.id} className="vertical" scope="col">
                    <span>{troopName(tr.index)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bs.map((b) => (
                <tr key={String(b.id)}>
                  <th scope="row">
                    <BuildingLink b={b} onOpen={open} tab="troops" />
                  </th>
                  {kept.map((tr) => (
                    <td key={tr.id} className={`num${b.troops[tr.index] ? "" : " muted"}`}>
                      {amount(b.troops[tr.index]!)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="total">
                <th scope="row">{t("overview.total")}</th>
                {kept.map((tr) => (
                  <td key={tr.id} className="num">
                    {amount(bs.reduce((s, b) => s + b.troops[tr.index]!, 0n))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BuildingLink({
  b,
  onOpen,
  tab,
}: {
  b: sim.Building;
  onOpen: (b: sim.Building, tab?: string) => void;
  tab?: string;
}) {
  const { t } = useTranslation();
  return (
    <a
      href={tab ? `#/book?tab=${tab}` : "#/book"}
      title={t("overview.open", { coord: coord(b.coord) })}
      onClick={(e) => {
        e.preventDefault();
        onOpen(b, tab);
      }}
    >
      {coord(b.coord)}
    </a>
  );
}
