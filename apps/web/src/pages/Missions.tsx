// Sending missions (07-missions.md) and following them: distance, travel time, salary and cargo are
// computed with the same exact formulas as the contract (packages/rules).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  distance,
  missionSalary,
  sim,
  travelSeconds,
  troopStats,
  vendetta as rs,
} from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { useRoute } from "../router.js";
import { Countdown, Empty } from "../ui/parts.js";
import { Icon } from "../ui/icons.js";
import { amount, clock, coord, duration, playerLabel, troopName } from "../ui/format.js";

const parse = (text: string) => {
  const m = /^(\d+):(\d+):(\d+)$/.exec(text.trim());
  return m ? { city: BigInt(m[1]!), neighborhood: BigInt(m[2]!), slot: BigInt(m[3]!) } : null;
};

export function Missions() {
  const g = useGame();
  if (!g.me || !g.building) return <Empty />;
  return <MissionsFor b={g.building} p={g.me} />;
}

function MissionsFor({ b, p }: { b: sim.Building; p: sim.Player }) {
  const g = useGame();
  const { t } = useTranslation();
  const { params } = useRoute();
  const [kind, setKind] = useState(Number(params.get("kind") ?? sim.ATTACK));
  const [to, setTo] = useState(params.get("to") ?? "");
  const [troops, setTroops] = useState<Record<number, string>>({});
  const [cargo, setCargo] = useState<Record<number, string>>({});
  const [trade, setTrade] = useState(params.get("trade") ?? "0");
  const target = parse(to);
  const counts = rs.troops.map((tr) =>
    tr.isAttack ? BigInt(Number(troops[tr.index] ?? "0") || 0) : 0n,
  );
  const res = rs.resources.map((_, i) =>
    kind === sim.TRANSPORT ? BigInt(Number(cargo[i] ?? "0") || 0) : 0n,
  );

  const plan = useMemo(() => {
    if (!target) return null;
    let speed = 0n;
    let capacity = 0n;
    let salaryUnits = 0n;
    counts.forEach((n, i) => {
      if (n === 0n) return;
      const s = troopStats(rs, rs.troops[i]!, p.research);
      if (speed === 0n || s.speed < speed) speed = s.speed;
      capacity += n * s.capacity;
      salaryUnits += n * rs.troops[i]!.salary;
    });
    const dist = distance(rs, b.coord, target);
    if (speed === 0n) return { dist };
    const secs = travelSeconds(rs, dist, speed);
    const salary = missionSalary(rs, dist, salaryUnits);
    return { dist, secs, salary, free: capacity - salary };
  }, [to, troops, p.research, b.id]);

  const trades = [...g.world.trades.values()].filter(
    (x) => x.accepted && sim.tradeOpenFor(g.world, x.id, p.id, g.now),
  );
  const attackTroops = rs.troops.filter((tr) => tr.isAttack && b.troops[tr.index]! > 0n);
  const mine = [...g.world.missions.values()].filter((m) => m.owner === p.id);
  const myCoords = new Set(g.myBuildings.map((x) => sim.coordKey(x.coord)));
  const incoming = [...g.world.missions.values()].filter(
    (m) => m.owner !== p.id && !m.returning && myCoords.has(sim.coordKey(m.target)),
  );

  return (
    <>
      <header className="account-head">
        <h2>{t("missions.title")}</h2>
        <span className="folio">
          {t("common.from")} {coord(b.coord)}
        </span>
      </header>
      <section aria-labelledby="send">
        <h3 id="send">{t("missions.send")}</h3>
        <div className="form-row">
          <label className="field">
            {t("missions.kind")}
            <select value={kind} onChange={(e) => setKind(Number(e.target.value))}>
              {[sim.ATTACK, sim.STATION, sim.TRANSPORT, sim.OCCUPY].map((k) => (
                <option key={k} value={k}>
                  {t(`missions.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("missions.target")}
            <input
              value={to}
              placeholder="25:25:100"
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={to !== "" && !target}
            />
          </label>
          {kind === sim.TRANSPORT && (
            <label className="field">
              {t("missions.trade")}
              <select value={trade} onChange={(e) => setTrade(e.target.value)}>
                <option value="0">{t("missions.noTrade")}</option>
                {trades.map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    #{String(x.id)} · {playerLabel(g.world, x.seller === p.id ? x.buyer : x.seller)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {attackTroops.length === 0 ? (
          <p className="note">{t("missions.noTroops")}</p>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>{t("missions.troops")}</th>
                <th className="num">{t("missions.available")}</th>
                <th className="num">{t("book.quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {attackTroops.map((tr) => (
                <tr key={tr.id}>
                  <td className="entry-name">{troopName(tr.index)}</td>
                  <td className="num">
                    <button
                      className="btn quiet"
                      onClick={() =>
                        setTroops({ ...troops, [tr.index]: String(b.troops[tr.index]) })
                      }
                    >
                      {amount(b.troops[tr.index]!)}
                    </button>
                  </td>
                  <td className="num">
                    <input
                      className="cell"
                      inputMode="numeric"
                      aria-label={`${t("book.quantity")} ${troopName(tr.index)}`}
                      value={troops[tr.index] ?? ""}
                      onChange={(e) =>
                        setTroops({ ...troops, [tr.index]: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {kind === sim.TRANSPORT && (
          <div className="form-row" style={{ marginTop: "0.75rem" }}>
            {rs.resources.map((r, i) => (
              <label key={r} className="field">
                <span>
                  <Icon name={r} /> {t(`resources.${r}`)}
                </span>
                <input
                  inputMode="numeric"
                  value={cargo[i] ?? ""}
                  onChange={(e) => setCargo({ ...cargo, [i]: e.target.value.replace(/\D/g, "") })}
                />
              </label>
            ))}
          </div>
        )}
        {plan && (
          <table className="ledger" style={{ marginTop: "0.75rem" }}>
            <tbody>
              <tr>
                <td>{t("missions.distance")}</td>
                <td className="num">{amount(plan.dist)}</td>
              </tr>
              {"secs" in plan && plan.secs !== undefined && (
                <>
                  <tr>
                    <td>{t("missions.duration")}</td>
                    <td className="num">
                      {duration(plan.secs)} · {t("missions.arrival")} {clock(g.now + plan.secs)}
                    </td>
                  </tr>
                  <tr>
                    <td>{t("missions.salary")}</td>
                    <td className="num">
                      <Icon name="dollar" /> {amount(plan.salary!)}
                    </td>
                  </tr>
                  <tr className="total">
                    <td>{t("missions.capacity")}</td>
                    <td className={`num${plan.free! < 0n ? " red" : ""}`}>{amount(plan.free!)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        )}
        <p>
          <button
            className="btn primary"
            disabled={g.busy || !target}
            onClick={() =>
              target &&
              void g.act({
                done: t("missions.sent"),
                check: (w, c, n) =>
                  sim.sendMission(w, c, b.id, kind, target, counts, res, BigInt(trade), n),
                functionName: "sendMission",
                args: [
                  b.id,
                  kind,
                  [target.city, target.neighborhood, target.slot],
                  counts,
                  res,
                  BigInt(trade),
                ],
              })
            }
          >
            {t("missions.send")}
          </button>
        </p>
      </section>

      <section aria-labelledby="flight">
        <h3 id="flight">{t("missions.inFlight")}</h3>
        {mine.length + incoming.length === 0 ? (
          <Empty />
        ) : (
          <ul className="entries">
            {[...incoming, ...mine]
              .sort((a, z) => (a.arrival < z.arrival ? -1 : 1))
              .map((m) => {
                const hostile = m.owner !== p.id;
                const units = m.troops.reduce((s, n) => s + n, 0n);
                return (
                  <li
                    key={String(m.id)}
                    className={hostile && m.kind === sim.ATTACK ? "hostile" : undefined}
                  >
                    <span className="when">
                      <Countdown at={m.arrival} />
                    </span>
                    <span className="what">
                      {t(`missions.kinds.${m.kind}`)}{" "}
                      {m.returning ? `· ${t("missions.returning")}` : `→ ${coord(m.target)}`}
                      <small>
                        {hostile ? playerLabel(g.world, m.owner) : ""} {amount(units)} u ·{" "}
                        {clock(m.arrival)}
                      </small>
                    </span>
                    {!hostile && !m.returning ? (
                      <button
                        className="btn quiet"
                        disabled={g.busy}
                        onClick={() =>
                          void g.act({
                            done: t("missions.recalled"),
                            check: (w, c, n) => sim.recall(w, c, m.id, n),
                            functionName: "recall",
                            args: [m.id],
                          })
                        }
                      >
                        {t("missions.recall")}
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </>
  );
}
