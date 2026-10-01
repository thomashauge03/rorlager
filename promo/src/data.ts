/**
 * Alt filmen viser av varer, kunde og uttak, samlet ett sted.
 *
 * Varene er ekte, fra katalogen (navn, dimensjon, varenummer og kode sjekket
 * mot pipe_catalog 01.10.2026). Hylleplass og beholdning er oppdiktet: i
 * produksjon har ingen varer hylleplass ennå, og alt står på 0.
 *
 * Kunden og uttaket er oppdiktet. «Byggefelt Vest, tomt 4» er appens egen
 * plassholder, og 900 00 000 likeså.
 */

export type Vare = {
  kategori: string;
  navn: string;
  dimensjon: string;
  varenr: string;
  kode: string;
  hylle: string;
  enhet: "m" | "stk";
  lager: number;
};

export const AVLOPSROR: Vare = {
  kategori: "Avløpsrør",
  navn: "Avløpsrør PVC",
  dimensjon: "110 mm",
  varenr: "2251059",
  kode: "avlopsror-pvc-110-mm",
  hylle: "B3",
  enhet: "m",
  lager: 48,
};

export const BEND: Vare = {
  kategori: "Deler avløp",
  navn: "Bend grunnavløp 45°",
  dimensjon: "110 mm",
  varenr: "2252269",
  kode: "bend-grunnavlop-45gr-110-mm",
  hylle: "C1",
  enhet: "stk",
  lager: 36,
};

/** Det kunden tar ut: 12 m rør (to lengder à 6 m) og 4 bend. */
export const UTTAKET = [
  { vare: AVLOPSROR, mengde: 12 },
  { vare: BEND, mengde: 4 },
] as const;

export const KUNDE = {
  navn: "Kari Nordmann",
  telefon: "900 00 000",
  epost: "kari@example.com",
  prosjekt: "Byggefelt Vest, tomt 4",
} as const;

/** Uttaket i kvitteringen, i appens format (dateTime: «dd.MM.yy HH:mm»). */
export const KVITTERING = { nr: 1042, tid: "02.10.26 07:42" } as const;

/** «Avløpsrør PVC 110 mm», som pipeLabel i appen. */
export const varenavn = (v: Vare) => `${v.navn} ${v.dimensjon}`;

/** «12 m», som qtyLabel i appen. */
export const mengdeTekst = (mengde: number, enhet: string) => `${mengde.toLocaleString("nb-NO")} ${enhet}`;
