import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import {
  expansionGuide,
  expansionRecommendations,
  roomRecommendation,
  type GuideStep,
} from "../state/guide.js";
import { amount, coord, researchName, roomName, troopName } from "./format.js";
import { Cost, Countdown } from "./parts.js";

const SEEN = "vendetta.guide.seen.v1";
function stored(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function remember(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* Preferences are optional. */
  }
}

export function GameGuide() {
  const g = useGame();
  if (!g.me) return null;
  return <Guide key={String(g.me.id)} />;
}

function Guide() {
  const g = useGame();
  const { t } = useTranslation();
  const rs = g.world.rs;
  const [open, setOpen] = useState(() => !stored(SEEN));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, [open]);
  const close = () => {
    remember(SEEN, true);
    setOpen(false);
  };
  const producer = rs.buildings.find(
    (r) => r.production?.kind === "producer" && r.production.resource === "alcohol",
  )!;
  const bar = rs.buildings.find(
    (r) =>
      r.production?.kind === "converter" &&
      r.production.resource === rs.resources[rs.roles.salaryResource],
  )!;
  const smuggle = rs.buildings.find(
    (r) =>
      r.index !== bar.index &&
      r.production?.kind === "converter" &&
      r.production.resource === rs.resources[rs.roles.salaryResource],
  )!;
  const smuggleRequirements = smuggle.requirements
    .map((r) => `${r.kind === "room" ? roomName(r.index) : researchName(r.index)} ${r.level}`)
    .join(" · ");
  const topics = [
    [roomName(rs.roles.buildSpeedRoom), t("guide.office")],
    [roomName(rs.roles.researchSpeedRoom), t("guide.school")],
    [roomName(rs.roles.attackTrainingRoom), t("guide.camp")],
    [t("guide.resourcesTitle"), t("guide.resources")],
    [`${roomName(producer.index)} · ${roomName(bar.index)}`, t("guide.alcohol")],
    [roomName(smuggle.index), t("guide.smuggle", { requirements: smuggleRequirements })],
    [troopName(rs.roles.occupationTroop), t("guide.expansion")],
  ];
  return (
    <div className="game-guide">
      <div className="guide-tools">
        <button className="btn quiet" onClick={() => setOpen(true)}>
          {t("guide.help")}
        </button>
      </div>
      {open && (
        <dialog
          ref={dialog}
          className="guide-dialog"
          aria-labelledby="guide-title"
          aria-describedby="guide-intro"
          onCancel={close}
          onClose={close}
        >
          <div className="guide-dialog-head">
            <h2 id="guide-title">{t("guide.welcome")}</h2>
            <button className="btn quiet" autoFocus onClick={close}>
              {t("guide.close")}
            </button>
          </div>
          <div className="guide-dialog-body">
            <p id="guide-intro">{t("guide.intro")}</p>
            <ol className="guide-basics">
              {["build", "produce", "return"].map((key) => (
                <li key={key}>
                  <strong>{t(`guide.basics.${key}.title`)}</strong>
                  <p>{t(`guide.basics.${key}.body`)}</p>
                </li>
              ))}
            </ol>
            <details className="guide-reference">
              <summary>{t("guide.learnMore")}</summary>
              <dl className="guide-topics">
                {topics.map(([title, body]) => (
                  <div key={title}>
                    <dt>{title}</dt>
                    <dd>{body}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <p className="note">{t("guide.optional")}</p>
          </div>
          <footer className="guide-dialog-footer">
            <button className="btn primary" onClick={close}>
              {t("guide.start")}
            </button>
          </footer>
        </dialog>
      )}
    </div>
  );
}

function stepName(s: GuideStep, occupy: string): string {
  return s.kind === "occupy"
    ? occupy
    : s.kind === "troop"
      ? `${troopName(s.index)} × ${s.level}`
      : `${s.kind === "room" ? roomName(s.index) : researchName(s.index)} → ${s.level}`;
}

export function BuildingGuide() {
  const g = useGame();
  if (!g.me || !g.building) return null;
  const preference = `vendetta.guide.hidden.v1:${g.clients.deployment.chainId}:${g.clients.deployment.game}:${g.me.id}`;
  return <BuildingGuidePreference key={preference} preference={preference} />;
}

function BuildingGuidePreference({ preference }: { preference: string }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => stored(preference));
  const toggle = () => {
    remember(preference, !hidden);
    setHidden(!hidden);
  };
  return (
    <div className="building-guide">
      {hidden ? (
        <button className="btn quiet" onClick={toggle}>
          {t("guide.show")}
        </button>
      ) : (
        <ExpansionRecommendation onHide={toggle} />
      )}
    </div>
  );
}

function ExpansionRecommendation({ onHide }: { onHide: () => void }) {
  const g = useGame();
  const { t } = useTranslation();
  const b = g.building!;
  const steps = expansionGuide(g.world, g.me!, b, g.known);
  const recommendations = expansionRecommendations(steps);
  const complete = g.me!.buildings >= 2n;
  const name = (s: GuideStep) => stepName(s, t("guide.occupy"));
  return (
    <section className="guide-recommendation" aria-labelledby="expansion-title">
      <h3 id="expansion-title">
        {t("guide.nextBuilding")}
        <button className="btn quiet" onClick={onHide}>
          {t("guide.hide")}
        </button>
      </h3>
      {complete && <p>{t("guide.complete")}</p>}
      {!complete && (
        <>
          <p className="guide-phase">
            {t("guide.progress", {
              phase: (recommendations[0]?.phase ?? 0) + 1,
              total: 6,
              done: steps.filter((s) => s.done).length,
              count: steps.length,
            })}{" "}
            · {t(`guide.phases.${recommendations[0]?.phase ?? 0}.title`)}
          </p>
          {recommendations.map((step, i) => (
            <RecommendedAction
              key={`${step.kind}-${step.index}`}
              step={step}
              steps={steps}
              parallel={i > 0}
            />
          ))}
          <details className="guide-path">
            <summary>{t("guide.path")}</summary>
            <p>{t("guide.recommendation", { coord: coord(b.coord) })}</p>
            <p className="note">
              {t("guide.raiding")}{" "}
              <a href={`#/book?focus=room-${g.world.rs.roles.attackTrainingRoom}`}>
                {roomName(g.world.rs.roles.attackTrainingRoom)}
              </a>
            </p>
            {Array.from({ length: 6 }, (_, phase) => (
              <div key={phase} className="guide-stage">
                <h4>
                  {phase + 1}. {t(`guide.phases.${phase}.title`)}
                </h4>
                <p className="muted">{t(`guide.phases.${phase}.why`)}</p>
                <ol className="guide-steps">
                  {steps
                    .filter((s) => s.phase === phase)
                    .map((s) => (
                      <li
                        key={`${s.kind}-${s.index}-${s.level}`}
                        aria-current={recommendations.includes(s) ? "step" : undefined}
                      >
                        <span className={s.done ? "muted" : undefined}>{name(s)}</span>{" "}
                        <small>
                          {s.done
                            ? t("guide.done")
                            : s.pending
                              ? t("guide.pending")
                              : s.queued
                                ? t("guide.queued")
                                : ""}
                        </small>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}

function RecommendedAction({
  step: next,
  steps,
  parallel,
}: {
  step: GuideStep;
  steps: GuideStep[];
  parallel: boolean;
}) {
  const g = useGame();
  const { t } = useTranslation();
  const b = g.building!;
  const name = stepName(next, t("guide.occupy"));
  const missing = next.cost
    ? g.world.rs.resources.flatMap((r, i) => {
        const cost = next.cost![r] ?? 0n;
        const cap = sim.capacities(g.world, b)[i]! / sim.stockScale(g.world.rs);
        const stock = b.stock[i]! / sim.stockScale(g.world.rs);
        if (cost <= stock) return [];
        const suggested = g.world.rs.buildings.find((room) =>
          cost > cap ? room.storage?.resource === r : room.production?.resource === r,
        );
        const target =
          suggested &&
          steps
            .filter((s) => s.kind === "room" && s.index === suggested.index)
            .reduce((max, s) => (s.level > max ? s.level : max), 0n);
        const goal =
          suggested && (cost > cap || b.levels[suggested.index]! < (target ?? 0n))
            ? roomRecommendation(g.world, g.me!, b, suggested.index)
            : undefined;
        return [
          {
            goal,
            resource: t(`resources.${r}`),
            amount: amount(cost - stock),
            capacity: cost > cap,
          },
        ];
      })
    : [];
  const elsewhere =
    next.kind === "research" && g.me!.researchBuilding !== 0n && g.me!.researchBuilding !== b.id;
  const href =
    next.kind === "occupy"
      ? next.pending
        ? "#/missions"
        : "#/map"
      : `#/book?focus=${next.kind}-${next.index}`;
  const queue =
    next.kind === "room"
      ? b.roomQueue
      : next.kind === "research"
        ? g.me!.researchQueue
        : next.kind === "troop"
          ? b.training[g.world.rs.troops[next.index]!.isAttack ? 0 : 1]
          : [];
  // A milestone may span several upgrades; the countdown describes the active job only.
  const active = queue[0];
  const arrival =
    next.kind === "occupy" && next.pending
      ? [...g.world.missions.values()]
          .filter(
            (m) =>
              m.owner === g.me!.id &&
              !m.returning &&
              (m.hidden ? g.known.get(m.commit)?.kind : m.kind) === sim.OCCUPY,
          )
          .reduce<bigint | undefined>(
            (earliest, m) =>
              earliest === undefined || m.arrival < earliest ? m.arrival : earliest,
            undefined,
          )
      : undefined;
  const at = next.pending
    ? (arrival ?? (active?.index === next.index ? active.finishAt : undefined))
    : undefined;
  const destination =
    next.kind === "room"
      ? roomName(next.index)
      : next.kind === "research"
        ? researchName(next.index)
        : troopName(next.index);
  const current =
    next.kind === "room"
      ? b.levels[next.index]!
      : next.kind === "research"
        ? g.me!.research[next.index]!
        : undefined;
  return (
    <div className="guide-next">
      {parallel && <p className="muted">{t("guide.parallel")}</p>}
      <strong>
        {t(next.pending ? "guide.waiting" : next.queued ? "guide.queuedAction" : "guide.next", {
          name,
        })}
      </strong>
      {at !== undefined && (
        <p className="guide-timing">
          {t("guide.finishesIn")} <Countdown at={at} />
        </p>
      )}
      {next.queued && <p className="guide-timing">{t("guide.queueWait")}</p>}
      {next.cost && !next.pending && !next.queued && (
        <>
          <p className="muted">
            {current !== undefined
              ? t("guide.upgradeCost", { level: String(current + 1n) })
              : t("guide.cost")}
          </p>
          <Cost cost={next.cost} stock={b.stock} />
        </>
      )}
      <details className="guide-reason">
        <summary>{t("guide.why")}</summary>
        <p>{t(`guide.phases.${next.phase}.why`)}</p>
      </details>
      {elsewhere && <p className="note">{t("guide.researchElsewhere")}</p>}
      {!next.pending &&
        !next.queued &&
        missing.map((m) => (
          <p className="red guide-shortfall" key={m.resource}>
            {t(m.capacity ? "guide.capacity" : m.goal ? "guide.short" : "guide.shortWait", m)}{" "}
            {m.goal && (
              <a href={`#/book?focus=${m.goal.kind}-${m.goal.index}`}>
                {m.goal.kind === "room" ? roomName(m.goal.index) : researchName(m.goal.index)} →{" "}
                {String(m.goal.level)}
              </a>
            )}
          </p>
        ))}
      {next.kind === "occupy" && <p>{t(next.pending ? "guide.travel" : "guide.chooseLot")}</p>}
      <a className="btn" href={href}>
        {next.kind === "occupy"
          ? t(next.pending ? "guide.follow" : "guide.map")
          : t("guide.goTo", { name: destination })}
      </a>
    </div>
  );
}
