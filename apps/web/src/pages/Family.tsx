// Families and wars (D-20, B-31).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Empty } from "../ui/parts.js";
import { amount, playerLabel, points } from "../ui/format.js";

export function Family() {
  const g = useGame();
  const { t } = useTranslation();
  if (!g.me) return <Empty />;
  const w = g.world;
  const p = g.me;
  const f = sim.familyOf(w, p);
  const families = [...w.families.values()].filter((x) => x.alive);
  return (
    <>
      <header className="account-head">
        <h2>{f ? `[${w.families.get(f)!.tag}] ${w.families.get(f)!.name}` : t("family.title")}</h2>
        {f !== 0n && <span className="folio">{t(`family.ranks.${p.rank}`)}</span>}
      </header>
      {f === 0n ? <NoFamily families={families} /> : <Members f={f} />}
      {f !== 0n && <Wars f={f} families={families} />}
    </>
  );
}

function NoFamily({ families }: { families: sim.Family[] }) {
  const g = useGame();
  const { t } = useTranslation();
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const p = g.me!;
  return (
    <>
      <p className="note">{t("family.none")}</p>
      <h3>{t("family.create")}</h3>
      <div className="form-row">
        <label className="field">
          {t("family.tag")}
          <input value={tag} maxLength={8} onChange={(e) => setTag(e.target.value)} />
        </label>
        <label className="field">
          {t("family.name")}
          <input value={name} maxLength={35} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          className="btn primary"
          disabled={g.busy}
          onClick={() =>
            void g.act({
              done: t("family.created"),
              check: (w, c, n) => sim.createFamily(w, c, tag, name, n),
              functionName: "createFamily",
              args: [tag, name],
            })
          }
        >
          {t("family.create")}
        </button>
      </div>
      <h3>{t("family.families")}</h3>
      {families.length === 0 ? (
        <Empty />
      ) : (
        <table className="ledger">
          <tbody>
            {families.map((x) => {
              const applied = p.applications.includes(x.id);
              return (
                <tr key={String(x.id)}>
                  <td className="entry-name">
                    [{x.tag}] {x.name}
                  </td>
                  <td className="num">{amount(x.members)}</td>
                  <td className="num">
                    {applied ? (
                      <button
                        className="btn quiet"
                        disabled={g.busy}
                        onClick={() =>
                          void g.act({
                            done: t("family.done"),
                            check: (w, c, n) => sim.withdrawApplication(w, c, x.id, n),
                            functionName: "withdrawApplication",
                            args: [x.id],
                          })
                        }
                      >
                        {t("family.withdraw")}
                      </button>
                    ) : (
                      <button
                        className="btn"
                        disabled={g.busy}
                        onClick={() =>
                          void g.act({
                            done: t("family.done"),
                            check: (w, c, n) => sim.applyToFamily(w, c, x.id, n),
                            functionName: "applyToFamily",
                            args: [x.id],
                          })
                        }
                      >
                        {t("family.apply")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function Members({ f }: { f: bigint }) {
  const g = useGame();
  const { t } = useTranslation();
  const w = g.world;
  const p = g.me!;
  const leads = p.rank === sim.CAPO || p.rank === sim.SUBCAPO;
  const members = [...w.players.values()]
    .filter((x) => sim.familyOf(w, x) === f)
    .sort((a, z) => a.rank - z.rank);
  const applicants = [...w.players.values()].filter((x) => x.applications.includes(f));
  const act = (
    done: string,
    fn: string,
    args: unknown[],
    check: (w: sim.World, c: string, n: bigint) => unknown,
  ) => void g.act({ done, functionName: fn, args, check });
  return (
    <>
      <h3>{t("family.members")}</h3>
      <table className="ledger">
        <tbody>
          {members.map((m) => (
            <tr key={String(m.id)}>
              <td className="entry-name">
                {playerLabel(w, m.id)}
                <span className="entry-sub">{t(`family.ranks.${m.rank}`)}</span>
              </td>
              <td className="num">{points(m.centipoints)}</td>
              <td className="num">
                {leads && m.id !== p.id && m.rank !== sim.CAPO && (
                  <>
                    <button
                      className="btn quiet"
                      disabled={g.busy}
                      onClick={() =>
                        act(
                          t("family.done"),
                          "setRank",
                          [m.id, m.rank === sim.SUBCAPO ? sim.MEMBER : sim.SUBCAPO],
                          (w, c, n) =>
                            sim.setRank(
                              w,
                              c,
                              m.id,
                              m.rank === sim.SUBCAPO ? sim.MEMBER : sim.SUBCAPO,
                              n,
                            ),
                        )
                      }
                    >
                      {m.rank === sim.SUBCAPO ? t("family.makeMember") : t("family.makeSub")}
                    </button>
                    <button
                      className="btn quiet"
                      disabled={g.busy}
                      onClick={() =>
                        act(t("family.done"), "kickMember", [m.id], (w, c, n) =>
                          sim.kickMember(w, c, m.id, n),
                        )
                      }
                    >
                      {t("family.kick")}
                    </button>
                  </>
                )}
                {p.rank === sim.CAPO && m.id !== p.id && (
                  <button
                    className="btn quiet"
                    disabled={g.busy}
                    onClick={() =>
                      act(t("family.done"), "handOver", [m.id], (w, c, n) =>
                        sim.handOver(w, c, m.id, n),
                      )
                    }
                  >
                    {t("family.handOver")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads && (
        <>
          <h3>{t("family.applications")}</h3>
          {applicants.length === 0 ? (
            <Empty />
          ) : (
            <table className="ledger">
              <tbody>
                {applicants.map((a) => (
                  <tr key={String(a.id)}>
                    <td className="entry-name">{playerLabel(w, a.id)}</td>
                    <td className="num">
                      <button
                        className="btn"
                        disabled={g.busy}
                        onClick={() =>
                          act(t("family.done"), "answerApplication", [a.id, true], (w, c, n) =>
                            sim.acceptApplication(w, c, a.id, n),
                          )
                        }
                      >
                        {t("family.accept")}
                      </button>{" "}
                      <button
                        className="btn quiet"
                        disabled={g.busy}
                        onClick={() =>
                          act(t("family.done"), "answerApplication", [a.id, false], (w, c, n) =>
                            sim.rejectApplication(w, c, a.id, n),
                          )
                        }
                      >
                        {t("family.reject")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <p className="form-row">
        {p.rank !== sim.CAPO && (
          <button
            className="btn quiet"
            disabled={g.busy}
            onClick={() =>
              act(t("family.done"), "leaveFamily", [], (w, c, n) => sim.leaveFamily(w, c, n))
            }
          >
            {t("family.leave")}
          </button>
        )}
        {p.rank === sim.CAPO && (
          <button
            className="btn quiet"
            disabled={g.busy}
            onClick={() =>
              act(t("family.done"), "dissolveFamily", [], (w, c, n) => sim.dissolveFamily(w, c, n))
            }
          >
            {t("family.dissolve")}
          </button>
        )}
      </p>
    </>
  );
}

function Wars({ f, families }: { f: bigint; families: sim.Family[] }) {
  const g = useGame();
  const { t } = useTranslation();
  const w = g.world;
  const p = g.me!;
  const leads = p.rank === sim.CAPO || p.rank === sim.SUBCAPO;
  const [enemy, setEnemy] = useState("");
  const wars = [...w.wars.values()].filter((x) => x.a === f || x.b === f).reverse();
  const name = (id: bigint) => `[${w.families.get(id)?.tag ?? "?"}]`;
  return (
    <>
      <h3>{t("family.wars")}</h3>
      {leads && (
        <div className="form-row">
          <label className="field">
            {t("family.families")}
            <select value={enemy} onChange={(e) => setEnemy(e.target.value)}>
              <option value="">—</option>
              {families
                .filter((x) => x.id !== f)
                .map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    [{x.tag}] {x.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="btn primary"
            disabled={g.busy || !enemy}
            onClick={() =>
              void g.act({
                done: t("family.done"),
                functionName: "declareWar",
                args: [BigInt(enemy)],
                check: (w, c, n) => sim.declareWar(w, c, BigInt(enemy), n),
              })
            }
          >
            {t("family.declare")}
          </button>
        </div>
      )}
      {wars.length === 0 ? (
        <Empty />
      ) : (
        <table className="ledger">
          <thead>
            <tr>
              <th>{t("family.wars")}</th>
              <th className="num">{t("family.losses")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {wars.map((x) => {
              const running = sim.warBetween(w, x.a, x.b) === x.id;
              const theirOffer = x.offer !== sim.OFFER_NONE && x.offerBy !== f;
              return (
                <tr key={String(x.id)}>
                  <td className="entry-name">
                    {name(x.a)} × {name(x.b)}
                    <span className="entry-sub">
                      {running
                        ? x.offer !== sim.OFFER_NONE
                          ? `${t("family.offerPending")}: ${x.offer === sim.OFFER_SURRENDER ? t("family.surrender") : t("family.draw")}`
                          : ""
                        : x.winner
                          ? `${t("family.winner")} ${name(x.winner)}`
                          : t("family.drawResult")}
                    </span>
                  </td>
                  <td className="num">
                    {points(x.lostA)} / {points(x.lostB)}
                  </td>
                  <td className="num">
                    {running && p.rank === sim.CAPO && !theirOffer && (
                      <>
                        <button
                          className="btn quiet"
                          disabled={g.busy}
                          onClick={() =>
                            void g.act({
                              done: t("family.done"),
                              functionName: "offerPeace",
                              args: [x.id, sim.OFFER_SURRENDER],
                              check: (w, c, n) =>
                                sim.offerPeace(w, c, x.id, sim.OFFER_SURRENDER, n),
                            })
                          }
                        >
                          {t("family.surrender")}
                        </button>
                        <button
                          className="btn quiet"
                          disabled={g.busy}
                          onClick={() =>
                            void g.act({
                              done: t("family.done"),
                              functionName: "offerPeace",
                              args: [x.id, sim.OFFER_DRAW],
                              check: (w, c, n) => sim.offerPeace(w, c, x.id, sim.OFFER_DRAW, n),
                            })
                          }
                        >
                          {t("family.draw")}
                        </button>
                      </>
                    )}
                    {running && leads && theirOffer && (
                      <>
                        <button
                          className="btn"
                          disabled={g.busy}
                          onClick={() =>
                            void g.act({
                              done: t("family.done"),
                              functionName: "answerPeace",
                              args: [x.id, true],
                              check: (w, c, n) => sim.answerPeace(w, c, x.id, true, n),
                            })
                          }
                        >
                          {t("family.acceptOffer")}
                        </button>
                        <button
                          className="btn quiet"
                          disabled={g.busy}
                          onClick={() =>
                            void g.act({
                              done: t("family.done"),
                              functionName: "answerPeace",
                              args: [x.id, false],
                              check: (w, c, n) => sim.answerPeace(w, c, x.id, false, n),
                            })
                          }
                        >
                          {t("family.rejectOffer")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
