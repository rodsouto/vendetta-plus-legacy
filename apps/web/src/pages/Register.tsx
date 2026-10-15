// Opening an account: pick a free lot for the first building (B-12).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Plat, PlatNav, type Lot } from "../ui/Plat.js";

export function Register() {
  const g = useGame();
  const { t } = useTranslation();
  const [at, setAt] = useState<Lot>({ city: 25n, neighborhood: 25n, slot: 0n });
  const taken = at.slot > 0n && g.world.buildingAt.has(sim.coordKey(at));
  return (
    <>
      <header className="account-head">
        <h2>{t("register.title")}</h2>
      </header>
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
            void g.act({
              done: t("register.done"),
              check: (w, c, n) => sim.register(w, c, at, n),
              functionName: "register",
              args: [at.city, at.neighborhood, at.slot],
            })
          }
        >
          {t("register.submit")}
        </button>
      </p>
    </>
  );
}
