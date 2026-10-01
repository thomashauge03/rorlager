import { miks } from "./hjelp";
import type { Oppsett } from "./oppsett";

/** Telefonens plassering: midtpunkt x, zoom og vridning om loddaksen. */
export type Kam = { x: number; zoom: number; ry: number };

export const miksKam = (a: Kam, b: Kam, t: number): Kam => ({
  x: miks(a.x, b.x, t),
  zoom: miks(a.zoom, b.zoom, t),
  ry: miks(a.ry, b.ry, t),
});

/**
 * Kameraet gjennom stegene, samlet ett sted: hvert steg starter nøyaktig der
 * det forrige slapp, så overgangene aldri rykker. Bevegelsene er ulike fra
 * steg til steg (aldri den samme to ganger på rad):
 *
 *   steg 1  telefonen kommer opp nedenfra, og skyves sakte innover
 *   steg 2  glir litt til venstre og nærmere
 *   steg 3  vrir seg mer og trekker seg tilbake, så innover mot bildet
 *   steg 4  glir over til høyre side
 *   steg 5  senkes, og løftes opp igjen foran skiltet
 */
export const kameraer = (o: Oppsett) => {
  const v = o.telefon(0);
  const h = o.telefon(1);
  const l = o.type === "liggende";
  const skannSlutt: Kam = { x: v.x, zoom: v.zoom * 1.04, ry: v.ry };
  const fyllInn: Kam = { x: v.x - (l ? 10 : 0), zoom: v.zoom * 1.06, ry: v.ry + (l ? 3 : 0) };
  const fyllSlutt: Kam = { ...fyllInn, zoom: v.zoom * 1.075 };
  const bilde: Kam = { x: v.x + (l ? 20 : 0), zoom: v.zoom, ry: v.ry - (l ? 3 : 0) };
  const bildeSlutt: Kam = { ...bilde, zoom: v.zoom * 1.08 };
  const start: Kam = { x: h.x, zoom: h.zoom * 1.02, ry: h.ry };
  const startSlutt: Kam = { ...start, zoom: h.zoom * 1.02 * 1.06 };
  const lever: Kam = { x: h.x, zoom: h.zoom * 1.02, ry: h.ry };
  const leverSlutt: Kam = { ...lever, zoom: h.zoom * 1.02 * 1.05 };
  return { y: v.y, skannSlutt, fyllInn, fyllSlutt, bilde, bildeSlutt, start, startSlutt, lever, leverSlutt };
};
