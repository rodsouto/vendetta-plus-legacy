// Sending missions (07-missions.md) and following them: distance, travel time, salary and cargo are
// computed with the same exact formulas as the contract (packages/rules). Missions go hidden
// (B-22) with a random cover distance, except transports bound to a market order.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  coverFor,
  distance,
  missionSalary,
  sim,
  travelSeconds,
  troopStats,
  vendetta as rs,
} from "@vendetta/rules";
import { randomSalt } from "../chain/hidden.js";
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
  const hidden = !(kind === sim.TRANSPORT && trade !== "0");
  // A fresh random cover for every target, so repeated sends do not average it out.
  const cover = useMemo(
    () =>
      target
        ? coverFor(rs, b.coord, target, crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32)
        : 0n,
    [to, b.id],
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
    const over = hidden ? cover * rs.config.distanceUnit : dist;
    const secs = travelSeconds(rs, over, speed);
    const salary = missionSalary(rs, over, salaryUnits);
    return { dist, secs, salary, free: capacity - salary };
  }, [to, troops, p.research, b.id, hidden, cover]);

  // Shown before sending: a hidden mission's target is only checked on-chain at its arrival.
  const targetError = useMemo(() => {
    if (!target) return null;
    try {
      sim.checkSendTarget(g.world, p.id, b.coord, kind, target, g.now);
      return null;
    } catch (e) {
      if (e instanceof sim.GameError) return e.code;
      throw e;
    }
  }, [to, kind, b.id, g.world, g.now]);

  const trades = [...g.world.trades.values()].filter(
    (x) => x.accepted && sim.tradeCounterparty(g.world, x.id, p.id, g.now) !== undefined,
  );
  // D-26: what does not fit at the destination is lost; warn the sender before it leaves.
  const scale = sim.stockScale(rs);
  const freeAt = (dest: sim.Building) =>
    sim
      .capacities(g.world, dest)
      .map((c, i) => (c > dest.stock[i]! ? (c - dest.stock[i]!) / scale : 0n));
  const destination = target
    ? g.world.buildings.get(g.world.buildingAt.get(sim.coordKey(target)) ?? 0n)
    : undefined;
  const noRoom =
    kind === sim.TRANSPORT && destination
      ? rs.resources.filter((_, i) => res[i]! > freeAt(destination)[i]!)
      : [];
  const attackTroops = rs.troops.filter((tr) => tr.isAttack && b.troops[tr.index]! > 0n);
  const mine = [...g.world.missions.values()].filter((m) => m.owner === p.id);
  const myCoords = new Set(g.myBuildings.map((x) => sim.coordKey(x.coord)));
  // A hidden mission may be for any of my buildings within its cover of where it left.
  const reaches = (m: sim.Mission) =>
    g.myBuildings.some((x) => distance(rs, m.from, x.coord) <= m.cover * rs.config.distanceUnit);
  const incoming = [...g.world.missions.values()].filter(
    (m) =>
      m.owner !== p.id &&
      !m.returning &&
      (m.hidden ? reaches(m) : myCoords.has(sim.coordKey(m.target))),
  );
  // A public transport bound to one of my buildings that does not fit there (D-26).
  const overflows = (m: sim.Mission) => {
    if (m.hidden || m.kind !== sim.TRANSPORT) return false;
    const dest = g.world.buildings.get(g.world.buildingAt.get(sim.coordKey(m.target)) ?? 0n);
    return !!dest && freeAt(dest).some((f, i) => m.cargo[i]! > f);
  };

  // The arrival the send will take: a hidden mission's is fixed a little after its natural one,
  // a head start before its round (B-22); 0 without a timelock means the natural one.
  const arrivalOf = (natural: bigint) => (hidden && g.timelock.prepare(natural).arrival) || natural;

  const send = async () => {
    if (!target || targetError) return;
    if (!hidden) {
      await g.act({
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
      });
      return;
    }
    const plain = { kind, target, salt: randomSalt() };
    const commit = sim.hiddenCommit(p.id, kind, target, plain.salt);
    // A fixed arrival, a head start before the round the ciphertext is made for (B-22), from a
    // fresh block: the device clock may be off.
    const secs = plan && "secs" in plan && plan.secs !== undefined ? plan.secs : 0n;
    const prepared = g.timelock.prepare((await g.chainNow()) + secs);
    const { arrival } = prepared;
    const ciphertext = await g.timelock.encrypt(plain, prepared);
    g.rememberHidden(commit, plain);
    await g.act({
      done: t("missions.sent"),
      check: (w, c, n) => {
        sim.checkSendTarget(w, p.id, b.coord, kind, target, n);
        return sim.sendHiddenMission(w, c, b.id, commit, cover, counts, res, arrival, n);
      },
      functionName: "sendHiddenMission",
      args: [b.id, commit, Number(cover), counts, res, ciphertext, arrival],
    });
  };

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
                      {duration(plan.secs)} · {t("missions.arrival")}{" "}
                      {clock(arrivalOf(g.now + plan.secs))}
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
        <p className="note">{t(hidden ? "missions.hiddenNote" : "missions.publicNote")}</p>
        {noRoom.length > 0 && (
          <p className="note red" role="alert">
            {t("missions.noRoom", { list: noRoom.map((r) => t(`resources.${r}`)).join(", ") })}
          </p>
        )}
        {targetError && (
          <p className="note red" role="alert">
            {t(`errors.${targetError}`)}
          </p>
        )}
        <p>
          <button
            className="btn primary"
            disabled={g.busy || !target || !!targetError}
            onClick={() => void send()}
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
                // Troops and cargo are public on-chain, hidden missions included: shown in full.
                const troopsText = m.troops
                  .map((n, i) => (n > 0n ? `${amount(n)} × ${troopName(i)}` : ""))
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li
                    key={String(m.id)}
                    className={
                      hostile && (m.hidden || m.kind === sim.ATTACK) ? "hostile" : undefined
                    }
                  >
                    <span className="when">
                      <Countdown at={m.arrival} />
                    </span>
                    <span className="what">
                      {m.hidden ? t("missions.hidden") : t(`missions.kinds.${m.kind}`)}{" "}
                      {m.returning
                        ? `· ${t("missions.returning")}`
                        : m.hidden
                          ? `→ ${hostile ? t("missions.mayBeYou") : t("missions.hiddenTarget")}`
                          : `→ ${coord(m.target)}`}
                      <small>
                        {hostile ? `${playerLabel(g.world, m.owner)} · ` : ""}
                        {troopsText}
                        {rs.resources.map((r, i) =>
                          m.cargo[i]! > 0n ? (
                            <span key={r}>
                              {" "}
                              · <Icon name={r} /> {amount(m.cargo[i]!)}
                            </span>
                          ) : null,
                        )}{" "}
                        · {clock(m.arrival)}
                        {m.hidden && !m.returning && m.arrival <= g.now
                          ? ` · ${t("missions.revealing")}`
                          : ""}
                        {hostile && overflows(m) ? ` · ${t("missions.incomingOverflow")}` : ""}
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
