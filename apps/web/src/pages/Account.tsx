// Account: this device's session (B-15), devices and recovery codes, vacation (D-18), premium
// (B-25), suspension (B-14) and transfer (B-26).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isAddress, type Address } from "viem";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Empty } from "../ui/parts.js";
import { clock, playerLabel } from "../ui/format.js";
import { controllerKey } from "../chain/load.js";
import { ApproveDevice, Devices, PendingBanner } from "./Devices.js";

export function Account() {
  const g = useGame();
  const { t } = useTranslation();
  const [to, setTo] = useState("");
  if (!g.me) return <Empty />;
  const p = g.me;
  const vacation = sim.onVacation(p, g.now);
  const premium = sim.isPremium(g.world, p, g.now);
  // D-19, B-11: no vacation with a registered market debt or an accepted trade's window open.
  const creditors = [...g.world.players.values()].filter((x) => sim.owes(g.world, p.id, x.id) > 0);
  const tradeLocked = !vacation && g.now <= p.tradeLockUntil;
  const days = Number(g.world.rs.config.controllerRemovalDelay / 86400n);
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  return (
    <>
      <header className="account-head">
        <h2>{t("account.title")}</h2>
        <span className="folio">{g.address?.slice(0, 10)}…</span>
      </header>
      {g.signer.mode === "passkey" && <ApproveDevice />}
      <PendingBanner />
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
            {premium ? (
              <td className="num">
                {`${t("account.premiumUntil")} ${clock(p.premiumUntil > g.world.globalPremiumUntil ? p.premiumUntil : g.world.globalPremiumUntil)}`}
              </td>
            ) : (
              // A sentence, not a figure: it wraps instead of widening the page on a phone.
              <td className="muted">{t("account.noPremium")}</td>
            )}
          </tr>
        </tbody>
      </table>

      {g.signer.mode === "passkey" && <Session />}
      {g.signer.mode === "passkey" && <Devices />}

      <h3>{t("account.vacation")}</h3>
      {p.debts > 0 && (
        <p className="note red" role="alert">
          {t("market.inDebt", { count: p.debts })}{" "}
          {creditors.length > 0 &&
            `${t("market.creditors")}: ${creditors.map((x) => playerLabel(g.world, x.id)).join(", ")}.`}
        </p>
      )}
      {tradeLocked && (
        <p className="note">
          {t("market.vacationLocked")} {clock(p.tradeLockUntil)}
        </p>
      )}
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
          disabled={g.busy || p.debts > 0 || tradeLocked}
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
      <p className="note">{t("account.transferNote", { days })}</p>
      {p.transferTo !== "" && (
        <>
          <p className="note">
            {t("account.transferPending")} <span className="muted">{short(p.transferTo)}</span>,{" "}
            {t("account.transferFrom")} {clock(p.transferAt)}
          </p>
          <div className="form-row">
            <button
              className="btn quiet"
              disabled={g.busy}
              onClick={() =>
                void g.act({
                  done: t("account.transferCancelled"),
                  check: (w, c, n) => sim.cancelTransfer(w, c, n),
                  functionName: "cancelTransfer",
                  args: [],
                  from: "controller",
                })
              }
            >
              {t("account.transferCancel")}
            </button>
          </div>
        </>
      )}
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
            void g
              .act({
                done: t("account.transferScheduled", { days }),
                check: (w, c, n) => sim.transferPlayer(w, c, controllerKey(to as Address), n),
                functionName: "transferPlayer",
                args: [to],
                from: "controller",
              })
              .then((ok) => ok && setTo(""))
          }
        >
          {t("account.transferSubmit")}
        </button>
      </div>
    </>
  );
}

/** This device: how long it may still play without a passkey prompt, renew, revoke, sign out. */
function Session() {
  const g = useGame();
  const { t } = useTranslation();
  const live = g.sessionUntil > 0n;
  return (
    <>
      <h3>{t("session.title")}</h3>
      <p className="note">{t("session.note")}</p>
      <table className="ledger">
        <tbody>
          <tr>
            <td>{t("session.device")}</td>
            <td className="num">
              {live ? (
                <span className="stamp ink">
                  {t("session.until")} {clock(g.sessionUntil)}
                </span>
              ) : (
                <span className="muted">{t("session.lapsed")}</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="form-row">
        <button className="btn" disabled={g.busy} onClick={() => void g.renewSession()}>
          {t("session.renew")}
        </button>
        <button
          className="btn quiet"
          disabled={g.busy || !live}
          onClick={() => void g.revokeSession()}
        >
          {t("session.revoke")}
        </button>
        <button className="btn quiet" disabled={g.busy} onClick={() => g.signOut()}>
          {t("session.signOut")}
        </button>
      </div>
    </>
  );
}
