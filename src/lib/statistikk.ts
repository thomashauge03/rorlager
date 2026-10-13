// Statistikk over lageret. Reine funksjonar, så tala kan testast.

import { fakturakunde } from "@/lib/fakturakunde";
import type { OrderWithLines, PipeType } from "@/lib/types";

export type MestTatt = { vare: PipeType; mengde: number; salsverdi: number | null };

/** Varene som går mest, etter salsverdi (eller mengd når prisen manglar). */
export function mestTattUt(varer: PipeType[], forbruk: Map<string, number>, topp = 15): MestTatt[] {
  return varer
    .filter((v) => (forbruk.get(v.id) ?? 0) > 0)
    .map((v) => {
      const mengde = forbruk.get(v.id) as number;
      return { vare: v, mengde, salsverdi: v.price == null ? null : Math.round(v.price * mengde * 100) / 100 };
    })
    .sort((a, b) => (b.salsverdi ?? -1) - (a.salsverdi ?? -1) || b.mengde - a.mengde)
    .slice(0, topp);
}

export type StårStille = { vare: PipeType; bundet: number | null };

/**
 * Varer som ligg på lager utan å bli tekne ut i perioden – pengar som står i
 * hylla. Sortert etter kor mykje som er bunde (kostpris × beholdning).
 */
export function stårStille(varer: PipeType[], forbruk: Map<string, number>): StårStille[] {
  return varer
    .filter((v) => v.active && v.stock > 0 && !(forbruk.get(v.id) ?? 0))
    .map((v) => ({ vare: v, bundet: v.cost_price == null ? null : Math.round(v.cost_price * v.stock * 100) / 100 }))
    .sort((a, b) => (b.bundet ?? -1) - (a.bundet ?? -1));
}

export type Toppkunde = { namn: string; uttak: number; sum: number };

/** Kundane og jobbane med mest, på same nøkkel som fakturagrunnlaget. Returar trekkjer frå. */
export function toppkundar(ordrar: OrderWithLines[], topp = 10): Toppkunde[] {
  const m = new Map<string, Toppkunde>();
  for (const o of ordrar) {
    // Ei bestilling som ventar eller er avvist, har ikkje gått ut av lageret
    if (o.kind === "bestilling" && (o.stock_drawn_at == null || o.status === "avvist")) continue;
    const k = fakturakunde(o);
    const før = m.get(k.key) ?? { namn: k.namn, uttak: 0, sum: 0 };
    m.set(k.key, { namn: før.namn, uttak: før.uttak + (o.retur_av ? 0 : 1), sum: Math.round((før.sum + Number(o.total ?? 0)) * 100) / 100 });
  }
  return [...m.values()].sort((a, b) => b.sum - a.sum).slice(0, topp);
}

export type Månad = { månad: string; uttak: number; sum: number };

/** Sal eks. mva per månad, nyaste først. «2026-10». */
export function perMånad(ordrar: OrderWithLines[]): Månad[] {
  const m = new Map<string, Månad>();
  for (const o of ordrar) {
    if (o.kind === "bestilling" && (o.stock_drawn_at == null || o.status === "avvist")) continue;
    const k = o.created_at.slice(0, 7);
    const før = m.get(k) ?? { månad: k, uttak: 0, sum: 0 };
    m.set(k, { månad: k, uttak: før.uttak + (o.retur_av ? 0 : 1), sum: Math.round((før.sum + Number(o.total ?? 0)) * 100) / 100 });
  }
  return [...m.values()].sort((a, b) => b.månad.localeCompare(a.månad));
}

const MÅNADER = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
export const visMånad = (k: string) => `${MÅNADER[Number(k.slice(5, 7)) - 1] ?? k} ${k.slice(0, 4)}`;
