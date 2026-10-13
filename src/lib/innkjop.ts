// Innkjøpsforslag: kva som bør bestillast, og kor mykje. Reine funksjonar, så
// reknestykket kan testast utan database.
//
// Ei vare kjem med når
//   * beholdninga er på eller under varselgrensa, eller
//   * ho ikkje har grense, men går tom innan 14 dagar med forbruket no.
//
// Mengda fyller opp til det høgaste av
//   * to gonger varselgrensa, og
//   * varselgrensa pluss forbruket for 30 dagar,
// og blir runda opp til heile meter eller stykk.

import type { PipeType } from "@/lib/types";

export const DEKNING_DAGAR = 30;
export const VARSEL_DAGAR = 14;

export type Innkjøpslinje = {
  vare: PipeType;
  /** Forbruk per dag, snitt over perioden. */
  perDag: number;
  /** Kor mange dagar beholdninga held med forbruket no. Null utan forbruk. */
  dagarIgjen: number | null;
  forslag: number;
  grunn: "under_grense" | "går_tom";
};

export function innkjøpsforslag(
  varer: PipeType[],
  forbruk: Map<string, number>,
  periodeDagar: number,
): Innkjøpslinje[] {
  const ut: Innkjøpslinje[] = [];
  for (const v of varer) {
    if (!v.active) continue;
    const grense = v.low_stock_threshold ?? 0;
    const perDag = (forbruk.get(v.id) ?? 0) / periodeDagar;
    const lager = Number(v.stock);
    const dagarIgjen = perDag > 0 ? Math.max(0, lager) / perDag : null;

    const underGrense = grense > 0 && lager <= grense;
    const gårTom = grense === 0 && perDag > 0 && lager < perDag * VARSEL_DAGAR;
    if (!underGrense && !gårTom) continue;

    const mål = Math.max(grense * 2, grense + perDag * DEKNING_DAGAR);
    const forslag = Math.ceil(mål - lager);
    if (forslag <= 0) continue;

    ut.push({ vare: v, perDag, dagarIgjen, forslag, grunn: underGrense ? "under_grense" : "går_tom" });
  }
  // Det som går tom først, øvst. Utan forbruk: etter kor langt under grensa.
  return ut.sort(
    (a, b) =>
      (a.dagarIgjen ?? Number.POSITIVE_INFINITY) - (b.dagarIgjen ?? Number.POSITIVE_INFINITY) ||
      a.vare.stock - a.vare.low_stock_threshold - (b.vare.stock - b.vare.low_stock_threshold),
  );
}

export type Bestillingslinje = { varenr: string; vare: string; mengde: number; enhet: string };

const celle = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Bestillingslista som CSV for Dahl: varenummer først, det er det dei les. */
export function bestillingCsv(linjer: Bestillingslinje[]): string {
  const rader = linjer.map((l) =>
    [celle(l.varenr), celle(l.vare), String(l.mengde).replace(".", ","), celle(l.enhet)].join(";"),
  );
  return "﻿" + ["Varenr;Vare;Antall;Enhet", ...rader].join("\r\n") + "\r\n";
}

/** Same liste som tekst, til ein e-post eller ein SMS. */
export function bestillingTekst(linjer: Bestillingslinje[]): string {
  return linjer
    .map((l) => `${l.varenr ? `${l.varenr}  ` : ""}${l.vare} – ${String(l.mengde).replace(".", ",")} ${l.enhet}`)
    .join("\n");
}
