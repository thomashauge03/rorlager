import { Scenenavn, slag, SPOR, sporSlag } from "../tid";
// Bare typer herfra, så planene kan lastes uten React (scripts/sjekk-tider.mjs)
import type { Del, Plan } from "./Klipp";

/**
 * Planene for hver versjon. Scenene får plass i hele slag, så hvert klipp
 * ligger på et taktslag. Sluttkortet får en fast lengde i bilder.
 *
 * Musikken er to biter, som i leiefilmen: fra en takt tidlig i sporet, og så
 * — fire slag før sluttkortet — sporets egen avslutning. Da faller
 * sluttslaget (slag 211) akkurat der platene åpner seg og logoen kommer.
 */
const paSlag = (liste: [Scenenavn, number][], slutt: number): Del[] => {
  let s = 0;
  const deler: Del[] = liste.map(([scene, antall]) => {
    const d = { scene, fra: slag(s), til: slag(s + antall) };
    s += antall;
    return d;
  });
  deler.push({ scene: "slutt", fra: slag(s), til: slag(s) + slutt });
  return deler;
};

const antallSlag = (liste: [Scenenavn, number][]) => liste.reduce((sum, [, n]) => sum + n, 0);

/**
 * Hovedfilmen, ca. 47 s. Åpningen er to takter, så grooven slår inn idet
 * steg 1 begynner. 72 slag fram til sluttkortet — et helt antall takter,
 * så hoppet til avslutningen ligger på en taktgrense.
 */
const HOVED: [Scenenavn, number][] = [
  ["apning", 8],
  ["skann", 12],
  ["mengde", 12],
  ["flere", 10],
  ["sendInn", 16],
  ["taMed", 14],
];
const hovedSlag = antallSlag(HOVED);
const hoveddeler = paSlag(HOVED, 126);
const hovedLengde = hoveddeler[hoveddeler.length - 1].til;

export const HOVEDFILM_PLAN: Plan = {
  deler: hoveddeler,
  lengde: hovedLengde,
  musikk: [
    { film: 0, spor: sporSlag(SPOR.takt1), lengde: slag(hovedSlag - 4), inn: 2, ut: 4 },
    { film: slag(hovedSlag - 4), spor: sporSlag(SPOR.sluttBygg), lengde: hovedLengde - slag(hovedSlag - 4), inn: 2, ut: 36 },
  ],
};

/**
 * Kortversjonen (Reels 9:16 og feed 4:5), ca. 32 s: de samme scenene,
 * raskere. Åpningen er én takt; 48 slag fram til sluttkortet.
 */
const KORT: [Scenenavn, number][] = [
  ["apning", 4],
  ["skann", 8],
  ["mengde", 8],
  ["flere", 7],
  ["sendInn", 11],
  ["taMed", 10],
];
const kortSlag = antallSlag(KORT);
const kortdeler = paSlag(KORT, 100);
const kortLengde = kortdeler[kortdeler.length - 1].til;

export const KORT_PLAN: Plan = {
  deler: kortdeler,
  lengde: kortLengde,
  musikk: [
    { film: 0, spor: sporSlag(SPOR.takt2), lengde: slag(kortSlag - 4), inn: 3, ut: 4 },
    { film: slag(kortSlag - 4), spor: sporSlag(SPOR.sluttBygg), lengde: kortLengde - slag(kortSlag - 4), inn: 2, ut: 30 },
  ],
};
