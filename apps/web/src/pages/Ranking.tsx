// Ranking by points (08-progression.md#ranking), computed from the loaded state; the indexer takes
// over in 4c.
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { amount, playerLabel, points } from "../ui/format.js";

export function Ranking() {
  const g = useGame();
  const { t } = useTranslation();
  const w = g.world;
  const players = [...w.players.values()].sort((a, z) => (a.centipoints > z.centipoints ? -1 : 1));
  const families = [...w.families.values()]
    .filter((f) => f.alive)
    .map((f) => ({
      f,
      cp: [...w.players.values()]
        .filter((p) => sim.familyOf(w, p) === f.id)
        .reduce((s, p) => s + p.centipoints, 0n),
    }))
    .sort((a, z) => (a.cp > z.cp ? -1 : 1));
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
          {players.map((p, i) => (
            <tr key={String(p.id)} style={g.me?.id === p.id ? { fontWeight: 700 } : undefined}>
              <td className="num">{i + 1}</td>
              <td>{playerLabel(w, p.id)}</td>
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
              {families.map(({ f, cp }, i) => (
                <tr key={String(f.id)}>
                  <td className="num">{i + 1}</td>
                  <td>
                    [{f.tag}] {f.name}
                  </td>
                  <td className="num">{amount(f.members)}</td>
                  <td className="num">{points(cp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
