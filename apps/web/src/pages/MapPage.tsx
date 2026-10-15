// The plat of any neighborhood, with what you can do on the selected lot.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sim } from "@vendetta/rules";
import { useGame } from "../state/game.js";
import { Plat, PlatNav, type Lot } from "../ui/Plat.js";
import { coord, playerLabel, points } from "../ui/format.js";
import { go } from "../router.js";

export function MapPage() {
  const g = useGame();
  const { t } = useTranslation();
  const home = g.building?.coord;
  const [at, setAt] = useState<Lot>({
    city: home?.city ?? 25n,
    neighborhood: home?.neighborhood ?? 25n,
    slot: home?.slot ?? 0n,
  });
  const id = at.slot > 0n ? g.world.buildingAt.get(sim.coordKey(at)) : undefined;
  const b = id === undefined ? undefined : g.world.buildings.get(id);
  const mine = !!b && !!g.me && b.owner === g.me.id;
  const owner = b ? g.world.players.get(b.owner) : undefined;
  const send = (kind: number) => go(`missions?to=${coord(at)}&kind=${kind}`);
  return (
    <>
      <header className="account-head">
        <h2>{t("map.title")}</h2>
        <span className="folio">
          {String(at.city)}:{String(at.neighborhood)}
        </span>
      </header>
      <PlatNav at={at} onChange={(l) => setAt({ ...l, slot: 0n })} />
      <div className="map-layout">
        <Plat at={at} selected={at.slot} onPick={(slot) => setAt({ ...at, slot })} />
        {at.slot > 0n && (
          <section aria-live="polite">
            <h3>
              {coord(at)}
              <span className="aside">
                {b ? (mine ? t("map.yours") : playerLabel(g.world, b.owner)) : t("map.empty")}
              </span>
            </h3>
            {b && (
              <p className="muted">
                {t("common.points")}: {points(b.centipoints)}
                {owner && sim.onVacation(owner, g.now) && (
                  <span className="stamp blue" style={{ marginLeft: "0.75rem" }}>
                    {t("map.vacation")}
                  </span>
                )}
              </p>
            )}
            {g.me && (
              <div className="form-row">
                {!b && (
                  <button className="btn primary" onClick={() => send(sim.OCCUPY)}>
                    {t("map.occupy")}
                  </button>
                )}
                {b && !mine && (
                  <button className="btn primary" onClick={() => send(sim.ATTACK)}>
                    {t("map.attack")}
                  </button>
                )}
                {b && (
                  <button className="btn" onClick={() => send(sim.TRANSPORT)}>
                    {t("map.transport")}
                  </button>
                )}
                {b && mine && b.id !== g.building?.id && (
                  <button className="btn" onClick={() => send(sim.STATION)}>
                    {t("map.station")}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
