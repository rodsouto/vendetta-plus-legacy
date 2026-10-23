// Market (D-19, B-11): private offers at fixed rates. When the buyer accepts, the seller's goods
// and the buyer's deposit are held in the trade; the buyer pays with transports that name it and
// withdraws the goods it paid for here. Once final, the seller withdraws the rest and its share of
// the deposit. A share left in a final trade blocks new offers and acceptances.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sim, vendetta as rs } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Countdown, Empty } from "../ui/parts.js";
import { Icon } from "../ui/icons.js";
import { amount, clock, coord, playerLabel } from "../ui/format.js";
import { go } from "../router.js";

const tradable = rs.resources.map((r, i) => ({ r, i })).filter(({ r }) => r !== "alcohol");

/** "120/300 weapons, 0/100 dollars" for the non-zero entries of `total`. */
function progress(done: readonly bigint[], total: readonly bigint[], t: (k: string) => string) {
  return total
    .map((v, i) =>
      v > 0n ? `${amount(done[i]!)}/${amount(v)} ${t(`resources.${rs.resources[i]}`)}` : "",
    )
    .filter(Boolean)
    .join(", ");
}

/** "300 weapons, 10 dollars" for the non-zero entries. */
function list(v: readonly bigint[], t: (k: string) => string) {
  return v
    .map((x, i) => (x > 0n ? `${amount(x)} ${t(`resources.${rs.resources[i]}`)}` : ""))
    .filter(Boolean)
    .join(", ");
}

export function Market() {
  const g = useGame();
  const { t } = useTranslation();
  const [buyer, setBuyer] = useState("");
  const [fromId, setFromId] = useState("");
  const [sold, setSold] = useState(0);
  const [qty, setQty] = useState("300");
  const [price, setPrice] = useState<Record<number, string>>({ 3: "100" });
  if (!g.me) return <Empty />;
  const p = g.me;
  const w = g.world;
  const from = w.buildings.get(BigInt(fromId || 0)) ?? g.building;
  const others = [...w.players.values()].filter((x) => x.id !== p.id);
  const priceVec = rs.resources.map((_, i) =>
    i === sold ? 0n : BigInt(Number(price[i] ?? "0") || 0),
  );
  const quantity = BigInt(Number(qty) || 0);
  const fair = (() => {
    if (!from) return false;
    try {
      const probe = sim.newWorld(rs);
      const free = { offers: [], purchases: [], vacationUntil: 0n, suspendedUntil: 0n };
      probe.players.set(1n, { ...p, ...free, id: 1n, controllers: ["me"] });
      probe.players.set(2n, { ...p, ...free, id: 2n, controllers: ["probe"] });
      probe.playerOf.set("me", 1n);
      probe.buildings.set(1n, { ...from, id: 1n, owner: 1n });
      sim.offerTrade(probe, "me", 2n, 1n, sold, quantity, priceVec, 0n);
      return true;
    } catch {
      return false;
    }
  })();
  const trades = [...w.trades.values()]
    .filter((x) => x.seller === p.id || x.buyer === p.id)
    .reverse();
  // D-19: a share left in a final trade blocks offering and accepting until it is withdrawn.
  const blocked = trades.some(
    (x) => sim.tradeFinal(x, g.now) && sim.shareLeft(x, p.id, g.now).some((v) => v > 0n),
  );
  // D-26: a payment goes to the seller's building.
  const payTo = (x: sim.Trade) => {
    const dest = [...w.buildings.values()].find((b) => b.owner === x.seller);
    if (dest) go(`missions?to=${coord(dest.coord)}&kind=${sim.TRANSPORT}&trade=${x.id}`);
  };
  const key = (b: sim.Building) => String(b.id);
  return (
    <>
      <header className="account-head">
        <h2>{t("market.title")}</h2>
      </header>
      <p className="note">{t("market.rates")}</p>
      <p className="note">
        {t("market.escrowNote", {
          days: String(rs.config.marketWindowSeconds / 86400n),
          percent: String(rs.config.marketDepositPercent),
        })}
      </p>
      {blocked && (
        <p className="note red" role="alert">
          {t("market.sharesLeft")}
        </p>
      )}
      {g.now <= p.tradeLockUntil && (
        <p className="note">
          {t("market.vacationLocked")} {clock(p.tradeLockUntil)}
        </p>
      )}
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
          {t("market.from")}
          <select value={from ? key(from) : ""} onChange={(e) => setFromId(e.target.value)}>
            {g.myBuildings.map((b) => (
              <option key={key(b)} value={key(b)}>
                {coord(b.coord)}
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
      <p className="note">{t("market.offerNote")}</p>
      <p>
        <button
          className="btn primary"
          disabled={g.busy || !buyer || !fair || !from || blocked}
          onClick={() =>
            void g.act({
              done: t("market.offered"),
              check: (sw, c, n) =>
                sim.offerTrade(sw, c, BigInt(buyer), from!.id, sold, quantity, priceVec, n),
              functionName: "offerTrade",
              args: [BigInt(buyer), from!.id, BigInt(sold), quantity, priceVec],
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
            {trades.map((x) => (
              <TradeRow key={String(x.id)} x={x} payTo={payTo} blocked={blocked} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function TradeRow({
  x,
  payTo,
  blocked,
}: {
  x: sim.Trade;
  payTo: (x: sim.Trade) => void;
  blocked: boolean;
}) {
  const g = useGame();
  const { t } = useTranslation();
  const p = g.me!;
  const w = g.world;
  const selling = x.seller === p.id;
  const other = selling ? x.buyer : x.seller;
  const final = sim.tradeFinal(x, g.now);
  const fullyPaid = x.paid.every((v, i) => v === x.price[i]);
  const left = sim.shareLeft(x, p.id, g.now);
  const fromB = w.buildings.get(x.from);
  const deposit = x.accepted ? x.deposit : sim.tradeDeposit(w, x);
  return (
    <tr>
      <td>
        <span className="entry-name">
          #{String(x.id)} · {amount(x.quantity)} {t(`resources.${rs.resources[x.sold]}`)}
        </span>
        <span className="entry-sub">
          {selling ? t("market.buyer") : t("market.seller")}: {playerLabel(w, other)} ·{" "}
          {t("market.paid")} {progress(x.paid, x.price, t)}
        </span>
        <span className="entry-sub">
          {t("market.goodsFrom")} {fromB ? coord(fromB.coord) : "—"} · {t("market.deposit")}{" "}
          {list(deposit, t)}
        </span>
        {left.some((v) => v > 0n) && (
          <span className="entry-sub">
            {t("market.yourShare")}: {list(left, t)}
          </span>
        )}
        {/* Keyed by the share: once it changes (here or on another device) the edits reset. */}
        {left.some((v) => v > 0n) && <WithdrawForm key={left.join(",")} x={x} left={left} />}
      </td>
      <td className="num">
        {!x.accepted ? (
          <span className="stamp blue">{t("market.pending")}</span>
        ) : !final ? (
          <span className="stamp ink">{t("market.accepted")}</span>
        ) : fullyPaid ? (
          <span className="stamp ink">{t("market.paidInFull")}</span>
        ) : x.paid.every((v) => v === 0n) ? (
          <span className="stamp">{t("market.unpaid")}</span>
        ) : (
          <span className="stamp">{t("market.partlyPaid")}</span>
        )}
        {x.accepted && !final && (
          <span className="entry-sub">
            {t("market.window")} <Countdown at={x.closesAt} />
          </span>
        )}
      </td>
      <td className="num">
        {!x.accepted && !selling && (
          <button
            className="btn"
            disabled={g.busy || blocked || !g.building}
            title={t("market.depositFrom")}
            onClick={() =>
              void g.act({
                done: t("family.done"),
                check: (sw, c, n) => sim.acceptTrade(sw, c, x.id, g.building!.id, n),
                functionName: "acceptTrade",
                args: [x.id, g.building!.id],
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
        {sim.tradePayable(w, x.id, p.id, x.seller, g.now) && (
          <button className="btn" onClick={() => payTo(x)}>
            {t("market.pay")}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * A party's withdrawal: one of its buildings and an exact amount per resource of its share,
 * prefilled with the most the simulator says fits right now.
 */
function WithdrawForm({ x, left }: { x: sim.Trade; left: bigint[] }) {
  const g = useGame();
  const { t } = useTranslation();
  const p = g.me!;
  const w = g.world;
  const [toId, setToId] = useState(g.building ? String(g.building.id) : "");
  const [edited, setEdited] = useState<Record<number, string>>({});
  const to = w.buildings.get(BigInt(toId || 0));
  const max = to ? sim.withdrawable(w, x, p.id, to, g.now) : left.map(() => 0n);
  const shares = left.map((v, i) => ({ v, i })).filter(({ v }) => v > 0n);
  // A resource with nothing left has no input, and sends nothing.
  const amounts = rs.resources.map((_, i) =>
    left[i] === 0n ? 0n : edited[i] === undefined ? max[i]! : BigInt(Number(edited[i]) || 0),
  );
  const nothing = max.every((v) => v === 0n);
  const key = (b: sim.Building) => String(b.id);
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div className="form-row">
        <label className="field">
          {t("market.withdrawTo")}
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            {g.myBuildings.map((b) => (
              <option key={key(b)} value={key(b)}>
                {coord(b.coord)}
              </option>
            ))}
          </select>
        </label>
        {shares.map(({ i }) => (
          <label key={rs.resources[i]} className="field">
            <span>
              <Icon name={rs.resources[i]!} /> {t(`resources.${rs.resources[i]}`)} ·{" "}
              {t("market.withdrawMax")} {amount(max[i]!)}
            </span>
            <input
              inputMode="numeric"
              value={edited[i] ?? String(max[i])}
              onChange={(e) => setEdited({ ...edited, [i]: e.target.value.replace(/\D/g, "") })}
            />
          </label>
        ))}
      </div>
      <p className="note">{nothing ? t("market.withdrawNone") : t("market.withdrawNote")}</p>
      <p>
        <button
          className="btn primary"
          disabled={g.busy || !to || amounts.every((v) => v === 0n)}
          onClick={() =>
            void g.act({
              done: t("market.withdrawn"),
              check: (sw, c, n) => sim.withdrawTrade(sw, c, x.id, to!.id, amounts, n),
              functionName: "withdrawTrade",
              args: [x.id, to!.id, amounts],
            })
          }
        >
          {t("market.withdraw")}
        </button>
      </p>
    </div>
  );
}
