// Account: vacation (D-18), premium (B-25), suspension (B-14) and transfer (B-26).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isAddress } from "viem";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Empty } from "../ui/parts.js";
import { clock } from "../ui/format.js";
import { controllerKey } from "../chain/load.js";

export function Account() {
  const g = useGame();
  const { t } = useTranslation();
  const [to, setTo] = useState("");
  if (!g.me) return <Empty />;
  const p = g.me;
  const vacation = sim.onVacation(p, g.now);
  const premium = sim.isPremium(g.world, p, g.now);
  return (
    <>
      <header className="account-head">
        <h2>{t("account.title")}</h2>
        <span className="folio">{g.address.slice(0, 10)}…</span>
      </header>
      <table className="ledger">
        <tbody>
          <tr>
            <td>{t("account.state")}</td>
            <td className="num">
              {sim.suspended(p, g.now) ? (
                <span className="stamp">
                  {t("account.suspended")} {clock(p.suspendedUntil)}
                </span>
              ) : vacation ? (
                <span className="stamp blue">
                  {t("account.onVacationUntil")} {clock(p.vacationUntil)}
                </span>
              ) : (
                <span className="stamp ink">{t("account.active")}</span>
              )}
            </td>
          </tr>
          <tr>
            <td>{t("account.premium")}</td>
            <td className="num">
              {premium ? (
                `${t("account.premiumUntil")} ${clock(p.premiumUntil > g.world.globalPremiumUntil ? p.premiumUntil : g.world.globalPremiumUntil)}`
              ) : (
                <span className="muted">{t("account.noPremium")}</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>{t("account.vacation")}</h3>
      {vacation ? (
        <button
          className="btn"
          disabled={g.busy}
          onClick={() =>
            void g.act({
              done: t("account.endVacation"),
              check: (w, c, n) => sim.endVacation(w, c, n),
              functionName: "endVacation",
              args: [],
            })
          }
        >
          {t("account.endVacation")}
        </button>
      ) : (
        <button
          className="btn"
          disabled={g.busy}
          onClick={() =>
            void g.act({
              done: t("account.startVacation"),
              check: (w, c, n) => sim.startVacation(w, c, n),
              functionName: "startVacation",
              args: [],
            })
          }
        >
          {t("account.startVacation")}
        </button>
      )}

      <h3>{t("account.transfer")}</h3>
      <p className="note">{t("account.transferNote")}</p>
      <div className="form-row">
        <label className="field" style={{ flex: "1 1 18rem" }}>
          {t("account.to")}
          <input
            value={to}
            placeholder="0x…"
            onChange={(e) => setTo(e.target.value.trim())}
            aria-invalid={to !== "" && !isAddress(to)}
          />
        </label>
        <button
          className="btn primary"
          disabled={g.busy || !isAddress(to)}
          onClick={() =>
            void g.act({
              done: t("account.transferred"),
              check: (w, c, n) => sim.transferPlayer(w, c, controllerKey(to as `0x${string}`), n),
              functionName: "transferPlayer",
              args: [to],
            })
          }
        >
          {t("account.transfer")}
        </button>
      </div>
    </>
  );
}
