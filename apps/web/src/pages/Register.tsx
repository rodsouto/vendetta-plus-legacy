// Opening an account: pick a free lot for the first building (B-12). With passkeys this is also the
// entry screen: sign in with an existing passkey, create one along with the first building, join an
// account from another device, or recover one with a code (B-26).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Plat, PlatNav, type Lot } from "../ui/Plat.js";
import { Joining, OtherWays } from "./Devices.js";

export function Register() {
  const g = useGame();
  const { t } = useTranslation();
  const [at, setAt] = useState<Lot>({ city: 25n, neighborhood: 25n, slot: 0n });
  const taken = at.slot > 0n && g.world.buildingAt.has(sim.coordKey(at));
  const passkey = g.signer.mode === "passkey";
  const signedOut = passkey && !g.address;
  if (g.joining) return <Joining />;
  return (
    <>
      <header className="account-head">
        <h2>{t(signedOut ? "entry.title" : "register.title")}</h2>
      </header>
      {signedOut && (
        <>
          <p className="note">{t("entry.body")}</p>
          <p>
            <button className="btn" disabled={g.busy} onClick={() => void g.signIn()}>
              {t("entry.signIn")}
            </button>
          </p>
          <h3>{t("entry.create")}</h3>
        </>
      )}
      <p className="note">{t("register.body")}</p>
      <PlatNav at={at} onChange={(l) => setAt({ ...l, slot: 0n })} />
      <p className="muted">
        {at.slot > 0n ? `${at.city}:${at.neighborhood}:${at.slot}` : t("register.pick")}
      </p>
      <Plat at={at} selected={at.slot} onPick={(slot) => setAt({ ...at, slot })} />
      <p>
        <button
          className="btn primary"
          disabled={g.busy || at.slot === 0n || taken}
          onClick={() =>
            void (passkey
              ? g.createAccount(at)
              : g.act({
                  done: t("register.done"),
                  check: (w, c, n) => sim.register(w, c, at, n),
                  functionName: "register",
                  args: [at.city, at.neighborhood, at.slot],
                }))
          }
        >
          {t(signedOut ? "entry.submit" : "register.submit")}
        </button>
      </p>
      {signedOut && <p className="muted">{t("entry.passkeyNote")}</p>}
      {signedOut && <OtherWays />}
    </>
  );
}
