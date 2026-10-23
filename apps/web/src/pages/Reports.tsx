// Battle reports (B-18): the Battle event carries inputs and totals (chain/reports.ts reads them);
// the rounds are recomputed here with the same deterministic engine as the contract.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { allTroopStats, resolveBattle, sim, vendetta as rs } from "@vendetta/rules";
import { readReports, type Report } from "../chain/reports.js";
import { useGame } from "../state/game.js";
import { Empty } from "../ui/parts.js";
import { Icon } from "../ui/icons.js";
import { amount, clock, playerLabel, troopName } from "../ui/format.js";

function useBattles() {
  const g = useGame();
  const player = g.me?.id ?? null;
  return useQuery({
    // Query keys are hashed as JSON: no bigint in them.
    queryKey: ["battles", g.clients.deployment.game, player?.toString() ?? null],
    queryFn: () =>
      readReports(
        g.clients.public,
        g.clients.deployment.game,
        g.clients.deployment.fromBlock,
        player,
      ),
    refetchInterval: 10_000,
  });
}

/** Where a battle was fought; an abandoned building is no longer in the world, only its id. */
function target(w: sim.World, building: bigint): string {
  const c = w.buildings.get(building)?.coord;
  return c ? `${c.city}:${c.neighborhood}:${c.slot}` : `#${building}`;
}

export function Reports() {
  const g = useGame();
  const { t } = useTranslation();
  const q = useBattles();
  const [open, setOpen] = useState<string | null>(null);
  const mine = q.data ?? [];
  return (
    <>
      <header className="account-head">
        <h2>{t("reports.title")}</h2>
      </header>
      {mine.length === 0 ? (
        <Empty>{t("reports.none")}</Empty>
      ) : (
        mine.map((x) => {
          const attacking = g.me && x.attacker === g.me.id;
          const lostA = x.r.attacker.reduce((s, n, i) => s + n - x.r.attackerSurvivors[i]!, 0n);
          const lostD = x.r.defender.reduce((s, n, i) => s + n - x.r.defenderSurvivors[i]!, 0n);
          const won =
            x.r.defenderSurvivors.every((n) => n === 0n) &&
            x.r.attackerSurvivors.some((n) => n > 0n);
          const iWon = attacking ? won : !won;
          return (
            <section key={x.key}>
              <h3>
                {t("reports.attackOn")} {target(g.world, x.building)}
                <span className="aside nowrap">{clock(x.time)}</span>
              </h3>
              <p className="report-meta">
                {t("reports.attacker")} {playerLabel(g.world, x.attacker)} · {t("reports.defender")}{" "}
                {playerLabel(g.world, x.defender)}
              </p>
              <p className="form-row">
                <span className={`stamp${iWon ? " ink" : ""}`}>
                  {iWon ? t("reports.won") : t("reports.lostBattle")}
                </span>
                <span className="muted">
                  {t("reports.lost")}: {amount(lostA)} / {amount(lostD)}
                </span>
                {x.r.loot.some((v) => v > 0n) && (
                  <span>
                    {t("reports.loot")}:{" "}
                    {rs.resources.map((res, i) =>
                      x.r.loot[i]! > 0n ? (
                        <span key={res} style={{ marginRight: "0.6rem" }}>
                          <Icon name={res} /> {amount(x.r.loot[i]!)}
                        </span>
                      ) : null,
                    )}
                  </span>
                )}
                <button
                  className="btn quiet"
                  onClick={() => setOpen(open === x.key ? null : x.key)}
                  aria-expanded={open === x.key}
                >
                  {t("reports.detail")}
                </button>
              </p>
              {open === x.key && <Rounds x={x} />}
            </section>
          );
        })
      )}
    </>
  );
}

function Rounds({ x }: { x: Report }) {
  const { t } = useTranslation();
  const side = (count: readonly bigint[], research: readonly number[], pct: bigint) => {
    const stats = allTroopStats(rs, research.map(BigInt));
    return {
      count: [...count],
      attack: stats.map((s) => s.attack),
      defense: stats.map((s) => s.defense),
      pct,
    };
  };
  const result = resolveBattle(
    rs,
    side(x.r.attacker, x.r.attackerResearch, x.r.attackerPct),
    side(x.r.defender, x.r.defenderResearch, x.r.defenderPct),
  );
  const used = rs.troops.filter(
    (tr) => x.r.attacker[tr.index]! > 0n || x.r.defender[tr.index]! > 0n,
  );
  return (
    <div className="scroll-x">
      <table className="ledger">
        <thead>
          <tr>
            <th>{t("missions.troops")}</th>
            <th className="num">{t("reports.attacker")}</th>
            {result.attackerDeaths.map((_, n) => (
              <th key={n} className="num">
                {t("reports.round")} {n + 1}
              </th>
            ))}
            <th className="num">{t("reports.defender")}</th>
          </tr>
        </thead>
        <tbody>
          {used.map((tr) => (
            <tr key={tr.id}>
              <td className="entry-name">{troopName(tr.index)}</td>
              <td className="num">{amount(x.r.attacker[tr.index]!)}</td>
              {result.attackerDeaths.map((d, n) => (
                <td key={n} className="num">
                  <span className="red">−{amount(d[tr.index]!)}</span> /{" "}
                  <span className="red">−{amount(result.defenderDeaths[n]![tr.index]!)}</span>
                </td>
              ))}
              <td className="num">{amount(x.r.defender[tr.index]!)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>{t("reports.survivors")}</td>
            <td className="num">{amount(x.r.attackerSurvivors.reduce((s, n) => s + n, 0n))}</td>
            {result.attackerDeaths.map((_, n) => (
              <td key={n} />
            ))}
            <td className="num">{amount(x.r.defenderSurvivors.reduce((s, n) => s + n, 0n))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
