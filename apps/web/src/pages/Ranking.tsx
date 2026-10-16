// Ranking by points (08-progression.md#ranking), served by the indexer (B-18): the stored points of
// every player (B-19) and of every family, as announced by PointsChanged.
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { indexerQuery } from "../chain/indexer.js";
import { useGame } from "../state/game.js";
import { Empty } from "../ui/parts.js";
import { amount, playerLabel, points } from "../ui/format.js";

const TOP = 100;

interface RankingData {
  players: { id: string; centipoints: string; buildings: number }[];
  families: { id: string; tag: string; name: string; members: number; centipoints: string }[];
}

function useRanking() {
  const url = useGame().clients.deployment.indexer;
  return useQuery({
    queryKey: ["ranking", url],
    enabled: !!url,
    queryFn: () =>
      indexerQuery<RankingData>(
        url!,
        `{
          players(first: ${TOP}, orderBy: centipoints, orderDirection: desc) {
            id centipoints buildings
          }
          families(first: ${TOP}, where: { alive: true }, orderBy: centipoints, orderDirection: desc) {
            id tag name members centipoints
          }
        }`,
      ),
    refetchInterval: 10_000,
  });
}

export function Ranking() {
  const g = useGame();
  const { t } = useTranslation();
  const q = useRanking();
  const head = (
    <header className="account-head">
      <h2>{t("ranking.title")}</h2>
    </header>
  );
  if (!g.clients.deployment.indexer || q.isError)
    return (
      <>
        {head}
        <Empty>{t("ranking.unavailable")}</Empty>
      </>
    );
  if (!q.data) return head;
  const { players, families } = q.data;
  return (
    <>
      {head}
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
            <tr key={p.id} style={g.me?.id === BigInt(p.id) ? { fontWeight: 700 } : undefined}>
              <td className="num">{i + 1}</td>
              <td>{playerLabel(g.world, BigInt(p.id))}</td>
              <td className="num">{amount(BigInt(p.buildings))}</td>
              <td className="num">{points(BigInt(p.centipoints))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {families.length > 0 && (
        <>
          <h3>{t("ranking.families")}</h3>
          <table className="ledger">
            <tbody>
              {families.map((f, i) => (
                <tr key={f.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    [{f.tag}] {f.name}
                  </td>
                  <td className="num">{amount(BigInt(f.members))}</td>
                  <td className="num">{points(BigInt(f.centipoints))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
