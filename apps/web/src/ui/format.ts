// Number, time and name formatting shared by the pages.
import { sim, vendetta as rs } from "@vendetta/rules";
import i18n from "../i18n/index.js";

export const SCALE = sim.stockScale(rs);
export const RATE_DEN = SCALE / 3600n;

export function amount(n: bigint): string {
  return new Intl.NumberFormat(i18n.language).format(n);
}

/** Whole visible stock from stock units (B-27). */
export const whole = (units: bigint) => units / SCALE;

/** Duration in seconds as "3 d 4 h", "2 h 05 m", "4 m 09 s". */
export function duration(seconds: bigint): string {
  let s = seconds < 0n ? 0n : seconds;
  const d = s / 86400n;
  s %= 86400n;
  const h = s / 3600n;
  s %= 3600n;
  const m = s / 60n;
  s %= 60n;
  const p2 = (x: bigint) => x.toString().padStart(2, "0");
  if (d > 0n) return `${d} d ${h} h`;
  if (h > 0n) return `${h} h ${p2(m)} m`;
  return `${m} m ${p2(s)} s`;
}

export function clock(chainSeconds: bigint): string {
  return new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(Number(chainSeconds) * 1000));
}

export const coord = (c: { city: bigint; neighborhood: bigint; slot: bigint }) =>
  `${c.city}:${c.neighborhood}:${c.slot}`;

export const roomName = (i: number) => i18n.t(`entities.rooms.${rs.buildings[i]!.id}.name`);
export const researchName = (i: number) => i18n.t(`entities.research.${rs.research[i]!.id}.name`);
export const troopName = (i: number) => i18n.t(`entities.troops.${rs.troops[i]!.id}.name`);
export const resourceName = (i: number) => i18n.t(`resources.${rs.resources[i]}`);

export const points = (centipoints: bigint) => amount(centipoints / 100n);

export function playerLabel(w: sim.World, id: bigint): string {
  const p = w.players.get(id);
  if (!p) return `#${id}`;
  const f = sim.familyOf(w, p);
  const tag = f ? `[${w.families.get(f)!.tag}] ` : "";
  return `${tag}${p.controller.slice(0, 6)}…${p.controller.slice(-4)}`;
}
