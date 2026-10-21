// Devices and recovery (B-15, B-26): the controllers of the player, adding another device (it shows
// a link or QR that a device already in the account approves), recovery codes, and recovering the
// account on a new device with one. Removing another controller takes two steps a delay apart,
// cancellable meanwhile; this device leaves at once.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAddress, type Address } from "viem";
import { useGame } from "../state/game.js";
import { useRoute, go } from "../router.js";
import { controllerKey } from "../chain/load.js";
import { newRecoveryCode, usedRecovery } from "../account/recovery.js";
import { clock } from "../ui/format.js";

/** A QR code of `text`; the encoder loads on first use (only a device joining needs it). */
function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    void import("uqr").then(({ renderSVG }) => live && setSvg(renderSVG(text, { border: 2 })));
    return () => {
      live = false;
    };
  }, [text]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The link a device already in the account opens to approve this one. */
const joinLink = (a: Address) =>
  `${location.origin}${location.pathname}#/account?add=${a.toLowerCase()}`;

/** The address in a pasted join link, or a bare address. */
function addressIn(text: string): Address | null {
  const t = text.trim();
  if (isAddress(t)) return t;
  const m = /[?&]add=(0x[0-9a-fA-F]{40})/.exec(t);
  return m && isAddress(m[1]!) ? (m[1] as Address) : null;
}

/** Account page: who manages the account, add a device, recovery code. */
export function Devices() {
  const g = useGame();
  const { t } = useTranslation();
  const [link, setLink] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!g.me) return null;
  const me = g.me;
  const days = Number(g.world.rs.config.controllerRemovalDelay / 86400n);
  const used = usedRecovery(g.clients.deployment.chainId);
  const added = addressIn(link);
  return (
    <>
      <h3>{t("devices.title")}</h3>
      <p className="note">{t("devices.note", { days })}</p>
      <table className="ledger">
        <tbody>
          {me.controllers.map((c) => {
            const who =
              c === g.owner
                ? t("devices.this")
                : me.recovery.has(c)
                  ? t("devices.code")
                  : t("devices.other");
            const at = me.removalAt.get(c);
            const due = at !== undefined && g.now >= at;
            const label = `${who} ${short(c)}`;
            return (
              <tr key={c}>
                <td>
                  {who} <span className="muted">{short(c)}</span>
                  {c === used && <span className="muted"> · {t("devices.usedHere")}</span>}
                  {at !== undefined && (
                    <>
                      {" "}
                      <span className={due ? "stamp" : "stamp blue"}>
                        {t("devices.pending")} {clock(at)}
                      </span>
                    </>
                  )}
                </td>
                <td className="num">
                  {at !== undefined && (
                    <button
                      className="btn quiet"
                      disabled={g.busy}
                      onClick={() => void g.cancelRemoval(c)}
                    >
                      {t("devices.cancel")}
                    </button>
                  )}
                  {(at === undefined || due) && (
                    <>
                      {" "}
                      <button
                        className={due ? "btn primary" : "btn quiet"}
                        disabled={g.busy || me.controllers.length === 1}
                        onClick={() => {
                          const ask =
                            c === g.owner || due
                              ? t("devices.confirmRemove", { who: label })
                              : t("devices.confirmSchedule", { who: label, days });
                          if (confirm(ask)) void g.removeController(c);
                        }}
                      >
                        {due ? t("devices.removeNow") : t("devices.remove")}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {used !== undefined && me.controllers.includes(used) && (
        <p className="note">{t("devices.usedNote")}</p>
      )}

      <h3>{t("devices.add")}</h3>
      <p className="note">{t("devices.addNote")}</p>
      <div className="form-row">
        <label className="field" style={{ flex: "1 1 18rem" }}>
          {t("devices.link")}
          <input
            value={link}
            placeholder="https://…  /  0x…"
            onChange={(e) => setLink(e.target.value)}
            aria-invalid={link !== "" && !added}
          />
        </label>
        <button
          className="btn primary"
          disabled={g.busy || !added}
          onClick={() => void g.addController(added!).then((ok) => ok && setLink(""))}
        >
          {t("devices.addSubmit")}
        </button>
      </div>

      <h3>{t("devices.recovery")}</h3>
      <p className="note">{t("devices.recoveryNote")}</p>
      {code === null ? (
        <button className="btn" disabled={g.busy} onClick={() => setCode(newRecoveryCode())}>
          {t("devices.generate")}
        </button>
      ) : (
        <>
          <p className="code-slip" aria-label={t("devices.recovery")}>
            {code}
          </p>
          <div className="form-row">
            <label className="check">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              {t("devices.saved")}
            </label>
            <button
              className="btn primary"
              disabled={g.busy || !saved}
              onClick={() =>
                void g.addRecoveryCode(code).then((ok) => {
                  if (ok) {
                    setCode(null);
                    setSaved(false);
                  }
                })
              }
            >
              {t("devices.activate")}
            </button>
            <button className="btn quiet" disabled={g.busy} onClick={() => setCode(null)}>
              {t("devices.discard")}
            </button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Account page: a removal scheduled against this device, or a pending transfer of the account
 * (B-26). Whoever holds a device sees it coming and can cancel it.
 */
export function PendingBanner() {
  const g = useGame();
  const { t } = useTranslation();
  if (!g.me) return null;
  const at = g.me.removalAt.get(g.owner);
  const to = g.me.transferTo;
  if (at === undefined && to === "") return null;
  return (
    <>
      {at !== undefined && (
        <p className="note red" role="alert">
          {t("devices.pendingSelf", { when: clock(at) })}{" "}
          <button
            className="btn quiet"
            disabled={g.busy}
            onClick={() => void g.cancelRemoval(g.owner)}
          >
            {t("devices.cancel")}
          </button>
        </p>
      )}
      {to !== "" && (
        <p className="note red" role="alert">
          {t("account.transferPendingBanner", { to: short(to), when: clock(g.me.transferAt) })}
        </p>
      )}
    </>
  );
}

/** Account page, opened from another device's join link: approve it (a passkey prompt). */
export function ApproveDevice() {
  const g = useGame();
  const { t } = useTranslation();
  const { params } = useRoute();
  const raw = params.get("add") ?? "";
  if (!g.me || !isAddress(raw)) return null;
  const a = raw as Address;
  if (g.me.controllers.includes(controllerKey(a))) return null;
  return (
    <section className="approve" aria-labelledby="approve-title">
      <h3 id="approve-title">{t("devices.approve")}</h3>
      <p>
        <span className="muted">{short(a)}</span>
      </p>
      <p className="note">{t("devices.approveNote")}</p>
      <div className="form-row">
        <button
          className="btn primary"
          disabled={g.busy}
          onClick={() => void g.addController(a).then((ok) => ok && go("account"))}
        >
          {t("devices.approveSubmit")}
        </button>
        <button className="btn quiet" disabled={g.busy} onClick={() => go("account")}>
          {t("devices.reject")}
        </button>
      </div>
    </section>
  );
}

/** Entry screen, this device waiting to be added: its link and QR, until the account shows up. */
export function Joining() {
  const g = useGame();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = joinLink(g.address!);
  return (
    <>
      <header className="account-head">
        <h2>{t("joining.title")}</h2>
      </header>
      <p className="note">{t("joining.body")}</p>
      <Qr text={link} />
      <p className="join-link">
        <a href={link}>{link}</a>
      </p>
      <div className="form-row">
        <button
          className="btn"
          onClick={() =>
            void navigator.clipboard?.writeText(link).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? t("joining.copied") : t("joining.copy")}
        </button>
        <button className="btn quiet" onClick={() => g.signOut()}>
          {t("joining.cancel")}
        </button>
      </div>
      <p className="muted">{t("joining.waiting")}</p>
    </>
  );
}

/** Entry screen: join from another device, or recover with a code. */
export function OtherWays() {
  const g = useGame();
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  return (
    <>
      <h3>{t("entry.otherDevice")}</h3>
      <p className="note">{t("entry.otherDeviceNote")}</p>
      <p>
        <button className="btn" disabled={g.busy} onClick={() => void g.prepareDevice()}>
          {t("entry.join")}
        </button>
      </p>
      <h3>{t("entry.recover")}</h3>
      <p className="note">{t("entry.recoverNote")}</p>
      <div className="form-row">
        <label className="field" style={{ flex: "1 1 16rem" }}>
          {t("entry.code")}
          <input
            value={code}
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button
          className="btn primary"
          disabled={g.busy || code.trim() === ""}
          onClick={() => void g.recover(code)}
        >
          {t("entry.recoverSubmit")}
        </button>
      </div>
    </>
  );
}
