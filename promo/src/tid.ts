/**
 * Filmens tidslinje. 30 bilder i sekundet, som de to andre filmene i serien.
 *
 * Scenene er skrevet for lengdene i LENGDE. Planene (versjoner/planer.ts)
 * gir dem plass etter taktslagene i musikken, og spiller dem litt fortere
 * eller saktere for å treffe (felles/Tempo.tsx).
 */
export const FPS = 30;

export const LENGDE = {
  apning: 120,
  skann: 210,
  mengde: 210,
  flere: 180,
  sendInn: 285,
  taMed: 250,
  slutt: 135,
} as const;

export type Scenenavn = keyof typeof LENGDE;

/** De fem stegene, i rekkefølge — for framdriftslinja. */
export const STEGENE: Scenenavn[] = ["skann", "mengde", "flere", "sendInn", "taMed"];

/**
 * Musikken: «Smart Sparks» (public/musikk/KILDE.md), samme spor som
 * leiefilmen, målt med scripts/takt.mjs: 101,85 BPM, første slag 0,436 s
 * inn i sporet. Taktene starter på slag 3, 7, 11 … (de tre første er opptakt).
 *
 *   slag 0–14    intro, bygger seg forsiktig opp
 *   slag 15      grooven slår inn (9,27 s)
 *   slag 207     siste oppbygging (122,38 s)
 *   slag 211     sluttslaget (124,74 s), så utklang til ca. 128 s
 */
export const MUSIKK = { bpm: 101.85, forsteSlag: 0.436 } as const;

/** Bilder per slag: 17,67. Klippene rundes til nærmeste hele bilde. */
export const SLAG = (60 / MUSIKK.bpm) * FPS;

/** Bildet i filmen etter n slag. */
export const slag = (n: number) => Math.round(n * SLAG);

/** Bildet i sporet der slag n ligger. */
export const sporSlag = (n: number) => Math.round((MUSIKK.forsteSlag + (n * 60) / MUSIKK.bpm) * FPS);

/** Slagene i sporet som klippene bygger på. */
export const SPOR = { takt1: 7, takt2: 11, grooveInn: 15, sluttBygg: 207, sluttslag: 211 } as const;
