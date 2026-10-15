// Market (D-19, B-11): private offers at fixed rates, delivered with transports that name the trade.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sim, vendetta as rs } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Countdown, Empty } from "../ui/parts.js";
import { Icon } from "../ui/icons.js";
import { amount, coord, playerLabel } from "../ui/format.js";
import { go } from "../router.js";

const tradable = rs.resources.map((r, i) => ({ r, i })).filter(({ r }) => r !== "alcohol");

export function Market() {
  const g = useGame();
  const { t } = useTranslation();
  const [buyer, setBuyer] = useState("");
  const [sold, setSold] = useState(0);
  const [qty, setQty] = useState("300");
  const [price, setPrice] = useState<Record<number, string>>({ 3: "100" });
  if (!g.me) return <Empty />;
  const p = g.me;
  const w = g.world;
  const others = [...w.players.values()].filter((x) => x.id !== p.id);
  const priceVec = rs.resources.map((_, i) =>
    i === sold ? 0n : BigInt(Number(price[i] ?? "0") || 0),
  );
  const quantity = BigInt(Number(qty) || 0);
  const fair = (() => {
    try {
      const probe = sim.newWorld(rs);
      probe.players.set(1n, { ...p, id: 1n, offers: [] });
      probe.players.set(2n, { ...p, id: 2n, offers: [], controllers: ["probe"] });
      probe.playerOf.set("me", 1n);
      probe.players.get(1n)!.controllers = ["me"];
      sim.offerTrade(probe, "me", 2n, sold, quantity, priceVec, 0n);
      return true;
    } catch {
      return false;
    }
  })();
  const trades = [...w.trades.values()]
    .filter((x) => x.seller === p.id || x.buyer === p.id)
    .reverse();
  const deliverTo = (x: sim.Trade) => {
    const other = x.seller === p.id ? x.buyer : x.seller;
    const dest = [...w.buildings.values()].find((b) => b.owner === other);
    if (dest) go(`missions?to=${coord(dest.coord)}&kind=${sim.TRANSPORT}&trade=${x.id}`);
  };
  return (
    <>
      <header className="account-head">
        <h2>{t("market.title")}</h2>
      </header>
      <p className="note">{t("market.rates")}</p>
      <h3>{t("market.offer")}</h3>
      <div className="form-row">
        <label className="field">
          {t("market.buyer")}
          <select value={buyer} onChange={(e) => setBuyer(e.target.value)}>
            <option value="">—</option>
            {others.map((x) => (
              <option key={String(x.id)} value={String(x.id)}>
                {playerLabel(w, x.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("market.sell")}
          <select value={sold} onChange={(e) => setSold(Number(e.target.value))}>
            {tradable.map(({ r, i }) => (
              <option key={r} value={i}>
                {t(`resources.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("market.quantity")}
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
          />
        </label>
      </div>
      <div className="form-row" style={{ marginTop: "0.6rem" }}>
        {tradable
          .filter(({ i }) => i !== sold)
          .map(({ r, i }) => (
            <label key={r} className="field">
              <span>
                {t("market.price")} · <Icon name={r} /> {t(`resources.${r}`)}
              </span>
              <input
                inputMode="numeric"
                value={price[i] ?? ""}
                onChange={(e) => setPrice({ ...price, [i]: e.target.value.replace(/\D/g, "") })}
              />
            </label>
          ))}
      </div>
      <p className={fair ? "muted" : "red"}>{fair ? t("market.fair") : t("market.unfair")}</p>
      <p>
        <button
          className="btn primary"
          disabled={g.busy || !buyer || !fair}
          onClick={() =>
            void g.act({
              done: t("market.offered"),
              check: (sw, c, n) =>
                sim.offerTrade(sw, c, BigInt(buyer), sold, quantity, priceVec, n),
              functionName: "offerTrade",
              args: [BigInt(buyer), BigInt(sold), quantity, priceVec],
            })
          }
        >
          {t("market.offer")}
        </button>
      </p>

      <h3>{t("market.mine")}</h3>
      {trades.length === 0 ? (
        <Empty />
      ) : (
        <table className="ledger">
          <tbody>
            {trades.map((x) => {
              const selling = x.seller === p.id;
              const open = sim.tradeOpenFor(w, x.id, p.id, g.now);
              return (
                <tr key={String(x.id)}>
                  <td>
                    <span className="entry-name">
                      #{String(x.id)} · {amount(x.quantity)}{" "}
                      {t(`resources.${rs.resources[x.sold]}`)}
                    </span>
                    <span className="entry-sub">
                      {selling ? t("market.buyer") : t("market.sell")}:{" "}
                      {playerLabel(w, selling ? x.buyer : x.seller)} · {t("market.delivered")}{" "}
                      {amount(x.delivered)}/{amount(x.quantity)} · {t("market.paid")}{" "}
                      {x.price
                        .map((v, i) =>
                          v > 0n
                            ? `${amount(x.paid[i]!)}/${amount(v)} ${t(`resources.${rs.resources[i]}`)}`
                            : "",
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </td>
                  <td className="num">
                    {x.accepted ? (
                      <span className="stamp ink">{t("market.accepted")}</span>
                    ) : (
                      <span className="stamp blue">{t("market.pending")}</span>
                    )}
                    {x.accepted && (
                      <span className="entry-sub">
                        {t("market.window")}{" "}
                        <Countdown at={x.acceptedAt + rs.config.marketWindowSeconds} />
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {!x.accepted && !selling && (
                      <button
                        className="btn"
                        disabled={g.busy}
                        onClick={() =>
                          void g.act({
                            done: t("family.done"),
                            check: (sw, c, n) => sim.acceptTrade(sw, c, x.id, n),
                            functionName: "acceptTrade",
                            args: [x.id],
                          })
                        }
                      >
                        {t("market.accept")}
                      </button>
                    )}
                    {!x.accepted && (
                      <button
                        className="btn quiet"
                        disabled={g.busy}
                        onClick={() =>
                          void g.act({
                            done: t("book.cancelled"),
                            check: (sw, c, n) => sim.cancelTrade(sw, c, x.id, n),
                            functionName: "cancelTrade",
                            args: [x.id],
                          })
                        }
                      >
                        {t("common.cancel")}
                      </button>
                    )}
                    {open && (
                      <button className="btn" onClick={() => deliverTo(x)}>
                        {selling ? t("market.deliver") : t("market.pay")}
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
