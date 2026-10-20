// Market (D-19, B-11): private offers at fixed rates, delivered with transports that name the trade.
// Once a window closes, the side that fell behind owes restitution plus a penalty: the creditor
// claims it from the debtor's buildings here, and the debtor can pay it back with a transport.
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
      probe.players.set(1n, { ...p, id: 1n, offers: [], debts: 0 });
      probe.players.set(2n, { ...p, id: 2n, offers: [], debts: 0, controllers: ["probe"] });
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
  const creditors = others.filter((x) => sim.owes(w, p.id, x.id) > 0);
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
      {p.debts > 0 && (
        <p className="note red" role="alert">
          {t("market.inDebt", { count: p.debts })}{" "}
          {creditors.length > 0 &&
            `${t("market.creditors")}: ${creditors.map((x) => playerLabel(w, x.id)).join(", ")}.`}
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
          disabled={g.busy || !buyer || !fair || p.debts > 0}
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
            {trades.map((x) => (
              <TradeRow key={String(x.id)} x={x} deliverTo={deliverTo} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function TradeRow({ x, deliverTo }: { x: sim.Trade; deliverTo: (x: sim.Trade) => void }) {
  const g = useGame();
  const { t } = useTranslation();
  const p = g.me!;
  const w = g.world;
  const selling = x.seller === p.id;
  const other = selling ? x.buyer : x.seller;
  const open = sim.tradeOpenFor(w, x.id, p.id, g.now);
  const closed = x.accepted && g.now > sim.tradeWindow(w, x);
  const debt = closed ? sim.tradeDebt(w, x) : null;
  const inDefault = debt !== null && sim.inDefault(debt);
  const iOwe = inDefault && debt.debtor === p.id;
  const owedToMe = inDefault && debt.creditor === p.id;
  return (
    <tr>
      <td>
        <span className="entry-name">
          #{String(x.id)} · {amount(x.quantity)} {t(`resources.${rs.resources[x.sold]}`)}
        </span>
        <span className="entry-sub">
          {selling ? t("market.buyer") : t("market.sell")}: {playerLabel(w, other)} ·{" "}
          {t("market.delivered")} {amount(x.delivered)}/{amount(x.quantity)} · {t("market.paid")}{" "}
          {progress(x.paid, x.price, t)}
        </span>
        {debt && debt.debtor !== 0n && (
          <span className="entry-sub">
            {debt.debtor === p.id ? t("market.youOwe") : t("market.owesYou")}{" "}
            {progress(x.returned, debt.owed, t)} {t("market.returned")} ·{" "}
            {t("market.penaltyNote", { percent: String(rs.config.marketPenaltyPercent) })}
          </span>
        )}
        {owedToMe && <ClaimForm x={x} debt={debt} />}
      </td>
      <td className="num">
        {!x.accepted ? (
          <span className="stamp blue">{t("market.pending")}</span>
        ) : !closed ? (
          <span className="stamp ink">{t("market.accepted")}</span>
        ) : inDefault ? (
          <span className="stamp">{t("market.defaulted")}</span>
        ) : debt && debt.debtor !== 0n ? (
          <span className="stamp ink">{t("market.settled")}</span>
        ) : (
          <span className="stamp ink">
            {t("market.closed")} · {t("market.noDebt")}
          </span>
        )}
        {x.accepted && !closed && (
          <span className="entry-sub">
            {t("market.window")} <Countdown at={sim.tradeWindow(w, x)} />
          </span>
        )}
        {iOwe && <span className="entry-sub">{t("market.debtorLocked")}</span>}
      </td>
      <td className="num">
        {!x.accepted && !selling && (
          <button
            className="btn"
            disabled={g.busy || p.debts > 0}
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
            {iOwe ? t("market.payBack") : selling ? t("market.deliver") : t("market.pay")}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * The creditor's claim on a defaulted trade: a building of the debtor, one of its own, and an
 * exact amount per owed resource, prefilled with the most the simulator says fits right now.
 */
function ClaimForm({ x, debt }: { x: sim.Trade; debt: sim.TradeDebt }) {
  const g = useGame();
  const { t } = useTranslation();
  const w = g.world;
  const theirs = [...w.buildings.values()].filter((b) => b.owner === debt.debtor);
  const mine = g.myBuildings;
  const [fromId, setFromId] = useState(theirs[0] ? String(theirs[0].id) : "");
  const [toId, setToId] = useState(g.building ? String(g.building.id) : "");
  const [edited, setEdited] = useState<Record<number, string>>({});
  const from = w.buildings.get(BigInt(fromId || 0));
  const to = w.buildings.get(BigInt(toId || 0));
  const max = from && to ? sim.claimable(w, x, from, to) : debt.remaining.map(() => 0n);
  const owed = debt.remaining.map((v, i) => ({ v, i })).filter(({ v }) => v > 0n);
  const amounts = rs.resources.map((_, i) =>
    edited[i] === undefined ? max[i]! : BigInt(Number(edited[i]) || 0),
  );
  const nothing = max.every((v) => v === 0n);
  const key = (b: sim.Building) => String(b.id);
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div className="form-row">
        <label className="field">
          {t("market.claimFrom")}
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {theirs.map((b) => (
              <option key={key(b)} value={key(b)}>
                {coord(b.coord)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("market.claimTo")}
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            {mine.map((b) => (
              <option key={key(b)} value={key(b)}>
                {coord(b.coord)}
              </option>
            ))}
          </select>
        </label>
        {owed.map(({ i }) => (
          <label key={rs.resources[i]} className="field">
            <span>
              <Icon name={rs.resources[i]!} /> {t(`resources.${rs.resources[i]}`)} ·{" "}
              {t("market.claimMax")} {amount(max[i]!)}
            </span>
            <input
              inputMode="numeric"
              value={edited[i] ?? String(max[i])}
              onChange={(e) => setEdited({ ...edited, [i]: e.target.value.replace(/\D/g, "") })}
            />
          </label>
        ))}
      </div>
      <p className="note">{nothing ? t("market.claimNone") : t("market.claimNote")}</p>
      <p>
        <button
          className="btn primary"
          disabled={g.busy || !from || !to || amounts.every((v) => v === 0n)}
          onClick={() =>
            void g.act({
              done: t("market.claimed"),
              check: (sw, c, n) => sim.claimTrade(sw, c, x.id, from!.id, to!.id, amounts, n),
              functionName: "claimTrade",
              args: [x.id, from!.id, to!.id, amounts],
            })
          }
        >
          {t("market.claim")}
        </button>
      </p>
    </div>
  );
}
