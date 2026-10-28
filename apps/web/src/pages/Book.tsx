// The account page of one building: balance, next entries, rooms, research and troops.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  distance,
  productionRates,
  researchUpgrade,
  sim,
  troopStats,
  vendetta as rs,
} from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { CostCells, CostHeads, Countdown, Empty } from "../ui/parts.js";
import { Icon } from "../ui/icons.js";
import {
  RATE_DEN,
  amount,
  clock,
  coord,
  duration,
  playerLabel,
  points,
  researchName,
  roomName,
  troopName,
  whole,
} from "../ui/format.js";
import { go, useRoute } from "../router.js";
import { BuildingGuide } from "../ui/Guide.js";
import { Register } from "./Register.js";

const bookSections = ["rooms", "research", "troops"] as const;
type BookSection = (typeof bookSections)[number];

const sectionFor = (value: string | null): BookSection | undefined => {
  if (value === "rooms" || value?.startsWith("room-")) return "rooms";
  if (value === "research" || value?.startsWith("research-")) return "research";
  if (value === "troops" || value?.startsWith("troop-")) return "troops";
  return undefined;
};

export function Book() {
  const g = useGame();
  const { t } = useTranslation();
  const { params } = useRoute();
  const focus = params.get("focus");
  const activeSection = sectionFor(focus) ?? sectionFor(params.get("tab")) ?? "rooms";
  const selectSection = (section: BookSection) => go(`book?tab=${section}`);
  useEffect(() => {
    if (!focus || !/^(rooms|research|troops|(room|research|troop)-\d+)$/.test(focus)) return;
    const target =
      document.getElementById(focus) ??
      document.getElementById(
        focus.startsWith("room-") ? "rooms" : focus.startsWith("research-") ? "research" : "troops",
      );
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [focus, g.building?.id]);
  if (!g.me || !g.building) return <Register />;
  const b = g.building;
  return (
    <>
      <header className="account-head">
        <h2>
          {t("book.building")} {coord(b.coord)}
        </h2>
        {g.myBuildings.length > 1 && (
          <label className="field" style={{ marginLeft: "auto" }}>
            <span className="visually-hidden">{t("book.building")}</span>
            <select value={String(b.id)} onChange={(e) => g.selectBuilding(BigInt(e.target.value))}>
              {g.myBuildings.map((x) => (
                <option key={String(x.id)} value={String(x.id)}>
                  {coord(x.coord)}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="folio">
          {t("book.points")}: {points(b.centipoints)}
        </span>
      </header>
      <Balance b={b} />
      <NextEntries b={b} />
      <BuildingGuide />
      <div className="book-sections" role="tablist" aria-label={t("book.sections")}>
        {bookSections.map((section, index) => (
          <button
            key={section}
            id={`book-tab-${section}`}
            type="button"
            role="tab"
            aria-selected={activeSection === section}
            aria-controls={`book-panel-${section}`}
            tabIndex={activeSection === section ? 0 : -1}
            onClick={() => selectSection(section)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % bookSections.length;
              else if (event.key === "ArrowLeft")
                next = (index + bookSections.length - 1) % bookSections.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = bookSections.length - 1;
              else return;
              event.preventDefault();
              const section = bookSections[next]!;
              selectSection(section);
              document.getElementById(`book-tab-${section}`)?.focus({ preventScroll: true });
            }}
          >
            {t(`book.${section}`)}
          </button>
        ))}
      </div>
      {bookSections.map((section) => (
        <div
          key={section}
          id={`book-panel-${section}`}
          role="tabpanel"
          aria-labelledby={`book-tab-${section}`}
          hidden={activeSection !== section}
          tabIndex={0}
        >
          {section === "rooms" ? (
            <Rooms b={b} />
          ) : section === "research" ? (
            <Research b={b} />
          ) : (
            <Troops b={b} />
          )}
        </div>
      ))}
      {g.myBuildings.length > 1 && <AbandonBuilding key={String(b.id)} b={b} />}
    </>
  );
}

function AbandonBuilding({ b }: { b: sim.Building }) {
  const g = useGame();
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    cancel.current?.focus();
  }, [open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <>
      <p>
        <button ref={trigger} className="btn quiet" disabled={g.busy} onClick={() => setOpen(true)}>
          {t("book.abandon")}
        </button>
      </p>
      {open && (
        <dialog
          ref={dialog}
          className="guide-dialog"
          aria-labelledby="abandon-title"
          aria-describedby="abandon-description"
          onCancel={close}
        >
          <div className="guide-dialog-head">
            <h2 id="abandon-title">{t("book.abandonTitle", { coord: coord(b.coord) })}</h2>
          </div>
          <div className="guide-dialog-body" id="abandon-description">
            <p>{t("book.abandonWarning")}</p>
            <p>{t("book.abandonReturningWarning")}</p>
          </div>
          <footer className="guide-dialog-footer">
            <button ref={cancel} className="btn" onClick={close}>
              {t("book.keepBuilding")}
            </button>
            <button
              className="btn primary"
              disabled={g.busy}
              onClick={() => {
                close();
                void g.act({
                  done: t("book.abandoned"),
                  check: (w, c, n) => sim.abandon(w, c, b.id, n),
                  functionName: "abandon",
                  args: [b.id],
                });
              }}
            >
              {t("book.confirmAbandon")}
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}

function Balance({ b }: { b: sim.Building }) {
  const g = useGame();
  const { t } = useTranslation();
  const caps = sim.capacities(g.world, b);
  const rates = productionRates(rs, b.levels, b.stock[rs.resources.indexOf("alcohol")]!);
  return (
    <section aria-labelledby="balance">
      <h3 id="balance">{t("book.balance")}</h3>
      <div className="balance">
        {rs.resources.map((r, i) => {
          const have = whole(b.stock[i]!);
          const cap = whole(caps[i]!);
          const full = b.stock[i]! >= caps[i]!;
          const rate = rates[r]!;
          const perHour = Number(rate) / Number(RATE_DEN);
          return (
            <div key={r}>
              <span className="label">
                <Icon name={r} /> {t(`resources.${r}`)}
              </span>
              <span className={`amount num${full ? " full" : ""}`} style={{ textAlign: "left" }}>
                {amount(have)}
                {full && <span className="stamp full-stamp">{t("book.full")}</span>}
              </span>
              <span className={`meta${rate < 0n ? " red" : ""}`}>
                {perHour >= 0 ? "+" : "−"}
                {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
                  Math.abs(perHour),
                )}
                {t("common.perHour")} · {amount(cap)} {t("common.capacity")}
              </span>
              <div className={`rule${full ? " full" : ""}`} aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface Line {
  at: bigint;
  start?: bigint;
  what: string;
  sub?: string;
  hostile?: boolean;
}

function NextEntries({ b }: { b: sim.Building }) {
  const g = useGame();
  const { t } = useTranslation();
  const w = g.world;
  const p = g.me!;
  const lines: Line[] = [];
  const room = b.roomQueue[0];
  if (room) {
    const secs = sim.roomJob(w, b, room.index).seconds;
    lines.push({
      at: room.finishAt,
      start: room.finishAt - secs,
      what: `${roomName(room.index)} → ${b.levels[room.index]! + 1n}`,
      sub: t("book.rooms"),
    });
  }
  const research = p.researchBuilding === b.id ? p.researchQueue[0] : undefined;
  if (research) {
    const secs = sim.researchJob(w, p, b, research.index).seconds;
    lines.push({
      at: research.finishAt,
      start: research.finishAt - secs,
      what: `${researchName(research.index)} → ${p.research[research.index]! + 1n}`,
      sub: t("book.research"),
    });
  }
  b.training.forEach((q) => {
    const item = q[0];
    if (!item) return;
    lines.push({
      at: item.finishAt,
      start: item.finishAt - sim.trainingSeconds(w, b, item),
      what: `${amount(item.quantity)} × ${troopName(item.index)}`,
      sub: t("book.troops"),
    });
  });
  for (const m of w.missions.values()) {
    const here = m.hidden
      ? distance(rs, m.from, b.coord) <= m.cover * rs.config.distanceUnit // may be (B-22)
      : sim.coordKey(m.target) === sim.coordKey(b.coord);
    const ownMission = m.owner === p.id && (m.origin === b.id || (!m.hidden && here));
    const incoming = m.owner !== p.id && !m.returning && here;
    if (!ownMission && !incoming) continue;
    const kind = m.hidden ? t("missions.hidden") : t(`missions.kinds.${m.kind}`);
    const to = m.hidden ? t("missions.hiddenTarget") : coord(m.target);
    lines.push({
      at: m.arrival,
      start: m.start,
      what: incoming
        ? `${t("book.incoming")}: ${kind}`
        : m.returning
          ? `${t("book.returning")} · ${kind}`
          : `${kind} → ${to}`,
      sub: incoming ? playerLabel(w, m.owner) : to,
      hostile: incoming && m.kind === sim.ATTACK,
    });
  }
  lines.sort((a, z) => (a.at < z.at ? -1 : a.at > z.at ? 1 : 0));
  return (
    <section aria-labelledby="next">
      <h3 id="next">{t("book.next")}</h3>
      {lines.length === 0 ? (
        <Empty />
      ) : (
        <ul className="entries">
          {lines.map((l, i) => {
            const total = l.start !== undefined ? Number(l.at - l.start) : 0;
            const done =
              l.start !== undefined && total > 0 ? Math.min(1, Number(g.now - l.start) / total) : 0;
            return (
              <li key={i} className={l.hostile ? "hostile" : undefined}>
                <span className="when">
                  <Countdown at={l.at} />
                </span>
                <span className="what">
                  {l.what}
                  <small>
                    {l.sub} · {clock(l.at)}
                  </small>
                  <span className="bar" aria-hidden="true">
                    <i style={{ width: `${done * 100}%` }} />
                  </span>
                </span>
                <span />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function unmet(
  w: sim.World,
  p: sim.Player,
  b: sim.Building,
  reqs: { kind: string; index: number; level: bigint }[],
) {
  return reqs.filter(
    (r) => (r.kind === "room" ? b.levels[r.index]! : p.research[r.index]!) < r.level,
  );
}

function Requirements({ list }: { list: { kind: string; index: number; level: bigint }[] }) {
  const { t } = useTranslation();
  if (list.length === 0) return null;
  return (
    <span className="entry-sub red">
      {t("common.requires")}:{" "}
      {list
        .map((r) => `${r.kind === "room" ? roomName(r.index) : researchName(r.index)} ${r.level}`)
        .join(", ")}
    </span>
  );
}

function Rooms({ b }: { b: sim.Building }) {
  const g = useGame();
  const { t } = useTranslation();
  const p = g.me!;
  return (
    <section aria-labelledby="rooms">
      <h3 id="rooms" tabIndex={-1}>
        {t("book.rooms")}
        <span className="aside">
          {t("common.queue")}: {b.roomQueue.length}/
          {g.world.rs.config.roomQueue[sim.isPremium(g.world, p, g.now) ? 1 : 0]}
        </span>
      </h3>
      {b.roomQueue.length > 0 && (
        <ul className="entries">
          {b.roomQueue.map((q, i) => (
            <li key={String(q.seq)}>
              <span className="when">
                {i === 0 ? (
                  <Countdown at={q.finishAt} />
                ) : (
                  <span className="stamp ink">{t("common.waiting")}</span>
                )}
              </span>
              <span className="what">{roomName(q.index)}</span>
              <button
                className="btn quiet"
                disabled={g.busy}
                onClick={() =>
                  void g.act({
                    done: t("book.cancelled"),
                    check: (w, c, n) => sim.cancelRoom(w, c, b.id, i, n),
                    functionName: "cancelRoom",
                    args: [b.id, BigInt(i)],
                  })
                }
              >
                {t("common.cancel")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="scroll-x">
        <table className="ledger stack">
          <thead>
            <tr>
              <th>{t("book.rooms")}</th>
              <th className="num">{t("common.level")}</th>
              <CostHeads />
              <th className="num">{t("common.time")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rs.buildings.map((room) => {
              const job = sim.roomJob(g.world, b, room.index);
              const missing = unmet(g.world, p, b, room.requirements);
              return (
                <tr key={room.id} id={`room-${room.index}`} tabIndex={-1}>
                  <td className="c-name">
                    <span className={missing.length > 0 ? "entry-name red" : "entry-name"}>
                      {roomName(room.index)}
                    </span>
                    <Requirements list={missing} />
                  </td>
                  <td className="num c-fig" data-label={t("common.level")}>
                    {String(b.levels[room.index])}
                  </td>
                  <CostCells cost={job.cost} stock={b.stock} />
                  <td className="num c-time">{duration(job.seconds)}</td>
                  <td className="num c-act">
                    <button
                      className="btn"
                      disabled={g.busy || missing.length > 0}
                      onClick={() =>
                        void g.act({
                          done: t("book.queued"),
                          check: (w, c, n) => sim.queueRoom(w, c, b.id, room.index, n),
                          functionName: "queueRoom",
                          args: [b.id, BigInt(room.index)],
                        })
                      }
                    >
                      {t("book.queueRoom")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Research({ b }: { b: sim.Building }) {
  const g = useGame();
  const { t } = useTranslation();
  const p = g.me!;
  const school = b.levels[rs.roles.researchSpeedRoom]!;
  const elsewhere = p.researchBuilding !== 0n && p.researchBuilding !== b.id;
  return (
    <section aria-labelledby="research">
      <h3 id="research" tabIndex={-1}>
        {t("book.research")}
        <span className="aside">
          {t("common.queue")}: {elsewhere ? 0 : p.researchQueue.length}/
          {g.world.rs.config.researchQueue[sim.isPremium(g.world, p, g.now) ? 1 : 0]}
        </span>
      </h3>
      {school < 1n ? (
        <p className="note">{t("book.needSchool")}</p>
      ) : elsewhere ? (
        <p className="note">{t("book.researchHere")}</p>
      ) : null}
      {!elsewhere && p.researchQueue.length > 0 && (
        <ul className="entries">
          {p.researchQueue.map((q, i) => (
            <li key={String(q.seq)}>
              <span className="when">
                {i === 0 ? (
                  <Countdown at={q.finishAt} />
                ) : (
                  <span className="stamp ink">{t("common.waiting")}</span>
                )}
              </span>
              <span className="what">{researchName(q.index)}</span>
              <button
                className="btn quiet"
                disabled={g.busy}
                onClick={() =>
                  void g.act({
                    done: t("book.cancelled"),
                    check: (w, c, n) => sim.cancelResearch(w, c, b.id, i, n),
                    functionName: "cancelResearch",
                    args: [b.id, BigInt(i)],
                  })
                }
              >
                {t("common.cancel")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="scroll-x">
        <table className="ledger stack">
          <thead>
            <tr>
              <th>{t("book.research")}</th>
              <th className="num">{t("common.level")}</th>
              <CostHeads />
              <th className="num">{t("common.time")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rs.research.map((r) => {
              const job = researchUpgrade(
                g.world.rs,
                r,
                p.research[r.index]!,
                school > 0n ? school : 1n,
              );
              const missing = unmet(g.world, p, b, r.requirements);
              return (
                <tr key={r.id} id={`research-${r.index}`} tabIndex={-1}>
                  <td className="c-name">
                    <span
                      className={
                        missing.length > 0 || school < 1n ? "entry-name red" : "entry-name"
                      }
                    >
                      {researchName(r.index)}
                    </span>
                    <Requirements list={missing} />
                  </td>
                  <td className="num c-fig" data-label={t("common.level")}>
                    {String(p.research[r.index])}
                  </td>
                  <CostCells cost={job.cost} stock={b.stock} />
                  <td className="num c-time">{school > 0n ? duration(job.seconds) : "—"}</td>
                  <td className="num c-act">
                    <button
                      className="btn"
                      disabled={g.busy || missing.length > 0 || school < 1n || elsewhere}
                      onClick={() =>
                        void g.act({
                          done: t("book.queued"),
                          check: (w, c, n) => sim.queueResearch(w, c, b.id, r.index, n),
                          functionName: "queueResearch",
                          args: [b.id, BigInt(r.index)],
                        })
                      }
                    >
                      {t("book.queueResearch")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Troops({ b }: { b: sim.Building }) {
  const g = useGame();
  const { t } = useTranslation();
  const p = g.me!;
  const [qty, setQty] = useState<Record<number, string>>({});
  return (
    <section aria-labelledby="troops">
      <h3 id="troops" tabIndex={-1}>
        {t("book.troops")}
      </h3>
      <p className="note">{t("book.perUnit")}</p>
      {b.training.map((q, queue) =>
        q.length === 0 ? null : (
          <ul className="entries" key={queue}>
            {q.map((item, i) => (
              <li key={String(item.seq)}>
                <span className="when">
                  {i === 0 ? (
                    <Countdown at={item.finishAt} />
                  ) : (
                    <span className="stamp ink">{t("common.waiting")}</span>
                  )}
                </span>
                <span className="what">
                  {amount(item.quantity)} × {troopName(item.index)}
                </span>
                <button
                  className="btn quiet"
                  disabled={g.busy}
                  onClick={() =>
                    void g.act({
                      done: t("book.cancelled"),
                      check: (w, c, n) => sim.cancelTraining(w, c, b.id, queue, i, n),
                      functionName: "cancelTraining",
                      args: [b.id, BigInt(queue), BigInt(i)],
                    })
                  }
                >
                  {t("common.cancel")}
                </button>
              </li>
            ))}
          </ul>
        ),
      )}
      <div className="scroll-x">
        <table className="ledger stack">
          <thead>
            <tr>
              <th>{t("book.troops")}</th>
              <th className="num">{t("book.atHome")}</th>
              <th className="num">Atk / Def</th>
              <CostHeads />
              <th className="num">{t("common.time")}</th>
              <th className="num">{t("book.quantity")}</th>
            </tr>
          </thead>
          <tbody>
            {rs.troops.map((tr) => {
              const s = troopStats(rs, tr, p.research);
              const missing = unmet(g.world, p, b, tr.requirements);
              const roomLevel = b.levels[tr.trainedAt]!;
              if (
                roomLevel < 1n &&
                !missing.some((r) => r.kind === "room" && r.index === tr.trainedAt && r.level >= 1n)
              ) {
                missing.unshift({ kind: "room", index: tr.trainedAt, level: 1n });
              }
              const locked = missing.length > 0;
              const n = BigInt(Math.max(0, Math.floor(Number(qty[tr.index] ?? "1")) || 0));
              return (
                <tr key={tr.id} id={`troop-${tr.index}`} tabIndex={-1}>
                  <td className="c-name">
                    <span className={locked ? "entry-name red" : "entry-name"}>
                      {troopName(tr.index)}
                    </span>
                    <Requirements list={missing} />
                  </td>
                  <td className="num c-fig">{amount(b.troops[tr.index]!)}</td>
                  <td className="num c-meta" data-label="Atk / Def">
                    {amount(s.attack)} / {amount(s.defense)}
                  </td>
                  <CostCells cost={tr.cost} stock={b.stock} />
                  <td className="num c-time">
                    {roomLevel > 0n ? duration(tr.trainingSeconds / roomLevel) : "—"}
                  </td>
                  <td className="num c-act">
                    <input
                      className="cell"
                      disabled={g.busy || locked}
                      inputMode="numeric"
                      aria-label={`${t("book.quantity")} ${troopName(tr.index)}`}
                      value={qty[tr.index] ?? "1"}
                      onChange={(e) =>
                        setQty({ ...qty, [tr.index]: e.target.value.replace(/\D/g, "") })
                      }
                    />
                    <button
                      className="btn"
                      disabled={g.busy || locked || n < 1n}
                      onClick={() =>
                        void g.act({
                          done: t("book.trained"),
                          check: (w, c, now) => sim.train(w, c, b.id, tr.index, n, now),
                          functionName: "train",
                          args: [b.id, BigInt(tr.index), n],
                        })
                      }
                    >
                      {t("book.train")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
