import { Easing } from "remotion";

/**
 * Filmens farger — de samme som i Leveringsseddel-filmen og leiefilmen, så
 * de tre hører til samme serie.
 */
export const farge = {
  rod: "#d31221",
  svart: "#0a0c0d",
  hvit: "#f5f5f6",
  hvitSvak: "rgba(245,245,246,0.66)",
  hvitDempet: "rgba(245,245,246,0.42)",
} as const;

/**
 * Rørlagerets lyse tema, regnet om fra HSL-verdiene i src/index.css i appen
 * (Tailwind-navnet står bak). Skjermene i filmen skal se ut som appen, ikke
 * som en tolkning av den.
 */
export const app = {
  /** --background 0 0% 97% */
  bakgrunn: "#f7f7f7",
  /** --foreground 0 0% 8% */
  blekk: "#141414",
  /** --card */
  kort: "#ffffff",
  /** --primary 357 84% 45% (samme rødt som hylleskiltet) */
  rod: "#d3121c",
  /** --muted 0 0% 93% */
  dempet: "#ededed",
  /** --muted-foreground 0 0% 36% */
  blekkSvak: "#5c5c5c",
  /** --border og --input 0 0% 87% */
  kant: "#dedede",
  /** --ring 0 75% 45% */
  ring: "#c91d1d",
  /** --success 160 60% 40% */
  gronn: "#29a37a",
  /** --brand-surface 0 0% 9%: topplinja */
  merkeflate: "#171717",
} as const;

/** Rundingene: --radius er 0,625 rem (rounded-lg), md er 2 px mindre. */
export const RADIUS = { lg: 10, md: 8, sm: 6 } as const;

/** Vinkelen i logoens kursiv, brukt på alt som er skrått. */
export const SKRA = -18;

/**
 * Bevegelseskurvene (fra Techauge-promoen). Alt som kommer inn, lander
 * mykt; alt som går ut, akselererer bort; kameraet glir. Ingen sprett.
 */
export const ease = {
  /** Inn på scenen: rask start, lang og myk landing. */
  inn: Easing.bezier(0.16, 1, 0.3, 1),
  /** Ut av scenen: starter rolig og forsvinner fort. */
  ut: Easing.bezier(0.7, 0, 0.84, 0),
  /** Begge veier, for bevegelser som starter og stopper i ro. */
  myk: Easing.bezier(0.65, 0, 0.35, 1),
  /** Kameraet: roligere start enn myk, og lang utglidning. */
  kamera: Easing.bezier(0.45, 0, 0.12, 1),
  /** Lukkeren i mobilappen (twa/lukkar.html). */
  lukker: Easing.bezier(0.62, 0.02, 0.34, 1),
  lineaer: Easing.linear,
} as const;
