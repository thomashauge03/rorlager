// Prisoversikta i innstillingane: kva kvar vare kostar inn, kva ho blir selt
// for, og kor mykje som ligg oppå – i kroner og i prosent. Reint rekneverk,
// slik at tala kan testast utan å teikne noko.

import { previewPrice } from "@/lib/orders";
import { prisInklMva } from "@/lib/mva";
import { hoppProsent } from "@/lib/prishopp";
import type { PipeType } from "@/lib/types";

/**
 * standard   salsprisen er innkjøp × påslag × prishopp (med ei av avrundingane)
 * avvik      salsprisen er sett for hand, eller med eit anna påslag
 * utenInnkjop varen har ingen innkjøpspris, så påslaget kan ikkje reknast
 * utenPris   varen har innkjøpspris, men ingen salspris
 */
export type PrisStatus = "standard" | "avvik" | "utenInnkjop" | "utenPris";

export const PRIS_STATUS_LABEL: Record<PrisStatus, string> = {
  standard: "Standard",
  avvik: "Avviker",
  utenInnkjop: "Mangler innkjøp",
  utenPris: "Mangler salgspris",
};

export type Prislinje = {
  vare: PipeType;
  innkjop: number | null;
  utsalg: number | null;
  utsalgInklMva: number | null;
  /** Kroner oppå innkjøpsprisen */
  tillegg: number | null;
  /** Tillegget i prosent av innkjøpsprisen – påslag og prishopp til saman */
  paaslag: number | null;
  /** Prishoppa sidan siste prisliste, i prosent (0 = ingen) */
  hopp: number;
  /** Tillegget i prosent av salsprisen */
  dekningsgrad: number | null;
  /** Det påslaget og prishoppet ville gitt, runda til heile kroner */
  standardPris: number | null;
  status: PrisStatus;
};

/** Same trinn som avrundingsvalet i innstillingane. Prisen kan ha vore rekna
 *  med kva som helst av dei, og alle skal telje som standard. */
const AVRUNDINGAR = [0.01, 1, 5, 10];

const likt = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function prislinje(vare: PipeType, paaslagProsent: number, mvaSats: number): Prislinje {
  const innkjop = vare.cost_price;
  const utsalg = vare.price;
  const utsalgInklMva = utsalg === null ? null : prisInklMva(utsalg, mvaSats);
  const faktor = vare.prishopp_faktor ?? 1;
  const hopp = hoppProsent(faktor);
  const standardPris = previewPrice(innkjop, paaslagProsent, 1, faktor);

  if (innkjop === null) {
    return {
      vare, innkjop, utsalg, utsalgInklMva, standardPris, hopp,
      tillegg: null, paaslag: null, dekningsgrad: null,
      status: "utenInnkjop",
    };
  }
  if (utsalg === null) {
    return {
      vare, innkjop, utsalg, utsalgInklMva, standardPris, hopp,
      tillegg: null, paaslag: null, dekningsgrad: null,
      status: "utenPris",
    };
  }

  const tillegg = Math.round((utsalg - innkjop) * 100) / 100;
  const paaslag = innkjop > 0 ? (tillegg / innkjop) * 100 : null;
  const dekningsgrad = utsalg > 0 ? (tillegg / utsalg) * 100 : null;
  const fylgjerStandard = AVRUNDINGAR.some((r) => likt(previewPrice(innkjop, paaslagProsent, r, faktor) ?? NaN, utsalg));

  return {
    vare, innkjop, utsalg, utsalgInklMva, standardPris, hopp,
    tillegg, paaslag, dekningsgrad,
    status: fylgjerStandard ? "standard" : "avvik",
  };
}

export type Prisoppsummering = {
  antall: number;
  perStatus: Record<PrisStatus, number>;
  /** Snittet av påslaget på varene som har begge prisane */
  snittPaaslag: number | null;
  lavestPaaslag: number | null;
  hoyestPaaslag: number | null;
  /** Beholdning × pris, berre for varer som har begge prisane */
  lagerverdiInnkjop: number;
  lagerverdiUtsalg: number;
};

export function prisoppsummering(linjer: Prislinje[]): Prisoppsummering {
  const perStatus: Record<PrisStatus, number> = { standard: 0, avvik: 0, utenInnkjop: 0, utenPris: 0 };
  const paaslag: number[] = [];
  let lagerverdiInnkjop = 0;
  let lagerverdiUtsalg = 0;

  for (const l of linjer) {
    perStatus[l.status]++;
    if (l.paaslag !== null) paaslag.push(l.paaslag);
    if (l.innkjop !== null && l.utsalg !== null) {
      const beholdning = Math.max(0, l.vare.stock ?? 0);
      lagerverdiInnkjop += beholdning * l.innkjop;
      lagerverdiUtsalg += beholdning * l.utsalg;
    }
  }

  return {
    antall: linjer.length,
    perStatus,
    snittPaaslag: paaslag.length ? paaslag.reduce((a, b) => a + b, 0) / paaslag.length : null,
    lavestPaaslag: paaslag.length ? Math.min(...paaslag) : null,
    hoyestPaaslag: paaslag.length ? Math.max(...paaslag) : null,
    lagerverdiInnkjop: Math.round(lagerverdiInnkjop * 100) / 100,
    lagerverdiUtsalg: Math.round(lagerverdiUtsalg * 100) / 100,
  };
}

/** Dekningsgraden eit påslag gir: 25 % påslag er 20 % av salsprisen. */
export const dekningsgradAv = (paaslagProsent: number) =>
  paaslagProsent <= -100 ? null : (paaslagProsent / (100 + paaslagProsent)) * 100;

/** Avrundingane prisjusteringa og prishoppet kan velje mellom. */
export const AVRUNDINGAR_VAL = [
  { value: "1", label: "Nærmeste krone" },
  { value: "5", label: "Nærmeste 5 kroner" },
  { value: "10", label: "Nærmeste 10 kroner" },
  { value: "0.01", label: "Øre" },
] as const;

/**
 * Nokre varer spreidde over prisspennet. Dei første radene i katalogen høyrer
 * alle til same varegruppe, og ville ikkje vist kva ei endring gjer med dei dyre.
 */
export function spreiddUtval<T>(rader: T[], pris: (r: T) => number, antall: number): T[] {
  if (rader.length === 0) return [];
  const sortert = [...rader].sort((a, b) => pris(a) - pris(b));
  const ønska = Math.min(antall, sortert.length);
  const teke = new Set<number>();
  const ut: T[] = [];
  for (let i = 0; i < ønska; i++) {
    const idx = Math.round((i * (sortert.length - 1)) / Math.max(1, ønska - 1));
    if (teke.has(idx)) continue;
    teke.add(idx);
    ut.push(sortert[idx]);
  }
  return ut;
}
