// Local workshop (development accounts only): switch dev accounts, move the chain clock, process missions, admin actions.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGame } from "../state/game.js";
import { DEV_KEYS, devAccount } from "../chain/config.js";
import { DevSigner } from "../account/signer.js";
import { playerLabel } from "../ui/format.js";

export function Dev() {
  const g = useGame();
  const { t } = useTranslation();
  const dev = g.signer instanceof DevSigner ? g.signer : null;
  const [target, setTarget] = useState("1");
  const day = 86400n;
  const admin = (functionName: string, args: unknown[]) =>
    void g.act({ done: t("family.done"), functionName, args, from: "admin" });
  return (
    <>
      <header className="account-head">
        <h2>{t("dev.title")}</h2>
      </header>
      <h3>{t("dev.account")}</h3>
      <div className="form-row">
        {DEV_KEYS.map((_, i) => (
          <button
            key={i}
            className={`btn${dev?.account === i ? " primary" : ""}`}
            onClick={() => dev?.use(i)}
          >
            {i === 0 ? t("dev.admin") : `#${i}`} · {devAccount(i).address.slice(0, 6)}
          </button>
        ))}
      </div>
      <h3>{t("dev.time")}</h3>
      <div className="form-row">
        {[
          ["+1 h", 3600],
          ["+6 h", 21600],
          ["+1 d", 86400],
          ["+7 d", 604800],
        ].map(([label, s]) => (
          <button
            key={label}
            className="btn"
            disabled={g.busy}
            onClick={() => void g.warp(Number(s))}
          >
            {label}
          </button>
        ))}
        <button
          className="btn"
          disabled={g.busy}
          onClick={() =>
            void g.act({ done: t("dev.advance"), functionName: "advance", args: [50n] })
          }
        >
          {t("dev.advance")}
        </button>
      </div>
      <h3>Admin</h3>
      <div className="form-row">
        <button
          className="btn"
          disabled={g.busy}
          onClick={() => admin("setGlobalPremium", [g.now + 30n * day])}
        >
          {t("dev.globalPremium")}
        </button>
        <button
          className="btn quiet"
          disabled={g.busy}
          onClick={() => admin("setGlobalPremium", [0n])}
        >
          {t("dev.noPremium")}
        </button>
      </div>
      <div className="form-row" style={{ marginTop: "0.75rem" }}>
        <label className="field">
          {t("dev.target")}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {[...g.world.players.keys()].map((id) => (
              <option key={String(id)} value={String(id)}>
                {playerLabel(g.world, id)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          disabled={g.busy}
          onClick={() => admin("grantPremium", [BigInt(target), g.now + 30n * day])}
        >
          {t("dev.grant")}
        </button>
        <button
          className="btn"
          disabled={g.busy}
          onClick={() => admin("suspend", [BigInt(target), g.now + day])}
        >
          {t("dev.suspend")}
        </button>
        <button
          className="btn quiet"
          disabled={g.busy}
          onClick={() => admin("suspend", [BigInt(target), 0n])}
        >
          {t("dev.lift")}
        </button>
      </div>
    </>
  );
}
