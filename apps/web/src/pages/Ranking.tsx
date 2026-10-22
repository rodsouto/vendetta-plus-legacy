// Ranking by points (08-progression.md#ranking, B-18): players and families of the loaded world,
// projected to now without hidden-mission plaintexts (state/ranking.ts), so it moves live with no
// query and no keeper, and every client shows the same one.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGame } from "../state/game.js";
import { ranking } from "../state/ranking.js";
import { amount, playerLabel, points } from "../ui/format.js";

const TOP = 100;

export function Ranking() {
  const g = useGame();
  const { t } = useTranslation();
  const { snapshot, now } = g;
  const at = now > snapshot.chainTime ? now : snapshot.chainTime;
  const { players, families } = useMemo(() => ranking(snapshot.world, at), [snapshot, at]);
  return (
    <>
      <header className="account-head">
        <h2>{t("ranking.title")}</h2>
      </header>
      <h3>{t("ranking.players")}</h3>
      <table className="ledger">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>{t("common.player")}</th>
            <th className="num">{t("ranking.buildings")}</th>
            <th className="num">{t("common.points")}</th>
          </tr>
        </thead>
        <tbody>
          {players.slice(0, TOP).map((p, i) => (
            <tr key={p.id} style={g.me?.id === p.id ? { fontWeight: 700 } : undefined}>
              <td className="num">{i + 1}</td>
              <td>{playerLabel(g.world, p.id)}</td>
              <td className="num">{amount(p.buildings)}</td>
              <td className="num">{points(p.centipoints)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {families.length > 0 && (
        <>
          <h3>{t("ranking.families")}</h3>
          <table className="ledger">
            <tbody>
              {families.slice(0, TOP).map((f, i) => (
                <tr key={f.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    [{f.tag}] {f.name}
                  </td>
                  <td className="num">{amount(f.members)}</td>
                  <td className="num">{points(f.centipoints)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
