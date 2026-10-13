// Forbruk per prosjekt: kva som er teke frå lageret til kvar jobb, og kva det
// kosta. Reine funksjonar, så reknestykka kan testast utan database.
//
// Eksporten er ei CSV-fil med semikolon og desimalkomma, slik norsk Excel
// opnar ho rett. SmartDok og Tripletex har kvar sine importformat; fila har
// alle felta dei treng (prosjektnummer, dato, varenummer, mengde, kost og sal),
// men kolonnene må koplast i importen første gong.

import type { OrderWithLines } from "@/lib/types";

export type ProsjektNamn = { project_number: number; name: string };

export type ForbrukLinje = {
  prosjektnr: number | null;
  prosjekt: string;
  dato: string;
  ordrenr: number;
  tattUtAv: string;
  varenr: string;
  vare: string;
  mengde: number;
  enhet: string;
  kostpris: number | null;
  kostSum: number | null;
  salgspris: number | null;
  salgSum: number | null;
};

const rund = (n: number) => Math.round(n * 100) / 100;

/** Éi rad per varelinje på uttak som er førte på eit prosjekt frå lista. */
export function forbrukLinjer(ordrar: OrderWithLines[], prosjekt: Map<string, ProsjektNamn>): ForbrukLinje[] {
  return ordrar
    .filter((o) => o.project_id && o.kind !== "bestilling")
    .flatMap((o) => {
      const p = prosjekt.get(o.project_id as string);
      // Ein retur trekkjer frå: mengda og kosten er positive på returlinja
      // (lageret får røra tilbake), men forbruket på jobben blir mindre.
      // Salet er alt negativt (line_total på ein retur er minus).
      const forteikn = o.retur_av ? -1 : 1;
      return o.lines.map((l) => ({
        prosjektnr: p?.project_number ?? null,
        prosjekt: p?.name ?? o.project ?? "",
        dato: o.created_at.slice(0, 10),
        ordrenr: o.order_number,
        tattUtAv: o.customer_name,
        varenr: l.sku ?? "",
        vare: [l.name, l.dimension].filter(Boolean).join(" "),
        mengde: forteikn * Number(l.quantity),
        enhet: l.unit,
        kostpris: l.unit_cost ?? null,
        kostSum: l.unit_cost == null ? null : rund(forteikn * l.unit_cost * Number(l.quantity)),
        salgspris: l.unit_price ?? null,
        salgSum: l.line_total ?? null,
      }));
    })
    .sort((a, b) => (a.prosjektnr ?? 0) - (b.prosjektnr ?? 0) || a.dato.localeCompare(b.dato) || a.ordrenr - b.ordrenr);
}

export type ForbrukSum = { uttak: number; linjer: number; kost: number; salg: number; utanKost: number };

export function summerForbruk(rader: ForbrukLinje[]): ForbrukSum {
  return {
    uttak: new Set(rader.map((r) => r.ordrenr)).size,
    linjer: rader.length,
    kost: rund(rader.reduce((s, r) => s + (r.kostSum ?? 0), 0)),
    salg: rund(rader.reduce((s, r) => s + (r.salgSum ?? 0), 0)),
    utanKost: rader.filter((r) => r.kostSum === null).length,
  };
}

const KOLONNER: [keyof ForbrukLinje, string][] = [
  ["prosjektnr", "Prosjektnr"],
  ["prosjekt", "Prosjekt"],
  ["dato", "Dato"],
  ["ordrenr", "Uttak"],
  ["tattUtAv", "Tatt ut av"],
  ["varenr", "Varenr"],
  ["vare", "Vare"],
  ["mengde", "Mengde"],
  ["enhet", "Enhet"],
  ["kostpris", "Kostpris"],
  ["kostSum", "Kost sum"],
  ["salgspris", "Salgspris eks mva"],
  ["salgSum", "Salg sum eks mva"],
];

const TALFELT = new Set<keyof ForbrukLinje>(["mengde", "kostpris", "kostSum", "salgspris", "salgSum"]);

function celle(verdi: unknown, tal: boolean): string {
  if (verdi === null || verdi === undefined) return "";
  // Desimalkomma: norsk Excel les «12.5» som tekst eller dato
  if (tal && typeof verdi === "number") return String(verdi).replace(".", ",");
  const s = String(verdi);
  // Semikolon, sitatteikn eller linjeskift i ein vare- eller prosjektnamn
  // ville splitta rada. Då står feltet i hermeteikn, med dobla hermeteikn inni.
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV med BOM, så Excel skjønar at det er UTF-8 og viser æ, ø og å rett. */
export function forbrukCsv(rader: ForbrukLinje[]): string {
  const hovud = KOLONNER.map(([, t]) => t).join(";");
  const linjer = rader.map((r) => KOLONNER.map(([k]) => celle(r[k], TALFELT.has(k))).join(";"));
  return "﻿" + [hovud, ...linjer].join("\r\n") + "\r\n";
}

export function lastNedCsv(innhald: string, filnamn: string) {
  const url = URL.createObjectURL(new Blob([innhald], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filnamn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
