// Kva prosjekt eit uttak skal på – for ein innlogga tilsett i kassen.
//
// Laga for ein telefon i lageret: søk øvst, trykk på prosjektet, ferdig. Når
// eitt er valt, fell lista saman til det valde med «Bytt», så knappen
// «Send inn» ikkje står gøymd under hundre prosjekt.
//
// Nedst ligg «Annet – skriv selv», for verkstaden, lageret eller eit prosjekt
// som ikkje er kome inn frå SmartDok enno.

import { useMemo, useState } from "react";
import { Check, FolderOpen, PenLine, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchKey } from "@/lib/stock";
import { prosjektTekst, type ProsjektValg } from "@/lib/orders";

/** Så mange blir viste utan søk. Resten finn ein ved å skrive. */
const MAKS_VISTE = 40;

export type ProsjektSvar =
  | { kind: "prosjekt"; id: string }
  | { kind: "annet" }
  | null;

export function filtrerProsjektValg(prosjekter: ProsjektValg[], søk: string): ProsjektValg[] {
  const ord = searchKey(søk).split(" ").filter(Boolean);
  if (ord.length === 0) return prosjekter;
  return prosjekter.filter((p) => {
    const høystakk = searchKey(prosjektTekst(p));
    return ord.every((o) => høystakk.includes(o));
  });
}

export function ProsjektVelger({
  prosjekter,
  valgt,
  onVelg,
  annetTekst,
  onAnnetTekst,
}: {
  prosjekter: ProsjektValg[];
  valgt: ProsjektSvar;
  onVelg: (v: ProsjektSvar) => void;
  annetTekst: string;
  onAnnetTekst: (v: string) => void;
}) {
  const [søk, setSøk] = useState("");
  const treff = useMemo(() => filtrerProsjektValg(prosjekter, søk), [prosjekter, søk]);
  const viste = treff.slice(0, MAKS_VISTE);
  const valgtProsjekt = valgt?.kind === "prosjekt" ? prosjekter.find((p) => p.id === valgt.id) ?? null : null;

  /* ---------- Eitt er valt: vis det, med «Bytt» ---------- */
  if (valgtProsjekt) {
    return (
      <div className="flex items-center gap-3 rounded-lg border-2 border-primary bg-primary/5 px-3 py-2.5">
        <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words text-base font-semibold text-foreground">
          {prosjektTekst(valgtProsjekt)}
        </p>
        <button
          type="button"
          onClick={() => onVelg(null)}
          className="min-h-11 shrink-0 px-2 text-sm font-medium text-primary hover:underline"
          aria-label={`Bytt prosjekt, valgt er ${prosjektTekst(valgtProsjekt)}`}
        >
          Bytt
        </button>
      </div>
    );
  }

  const annet = valgt?.kind === "annet";

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="prosjekt-sok"
          type="search"
          inputMode="search"
          value={søk}
          onChange={(e) => setSøk(e.target.value)}
          placeholder="Søk på nummer eller navn"
          aria-label="Søk etter prosjekt"
          className="h-12 pl-9 text-base"
        />
      </div>

      <div
        role="radiogroup"
        aria-label="Prosjekt"
        className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border"
      >
        {viste.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => onVelg({ kind: "prosjekt", id: p.id })}
            className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="tabular shrink-0 font-semibold text-foreground">{p.project_number}</span>
            <span className="min-w-0 break-words text-foreground">{p.name}</span>
          </button>
        ))}

        {treff.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            Ingen prosjekter passer «{søk.trim()}». Velg «Annet» og skriv det selv.
          </p>
        ) : treff.length > viste.length ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Viser {viste.length} av {treff.length}. Søk for å finne resten.
          </p>
        ) : null}

        <button
          type="button"
          role="radio"
          aria-checked={annet}
          onClick={() => onVelg({ kind: "annet" })}
          className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${
            annet ? "bg-primary/5 font-semibold" : ""
          }`}
        >
          <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-foreground">Annet – skriv selv</span>
          {annet ? <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" /> : null}
        </button>
      </div>

      {annet ? (
        <Input
          id="prosjekt"
          value={annetTekst}
          onChange={(e) => onAnnetTekst(e.target.value)}
          placeholder="Verkstedet, lageret eller prosjektet"
          aria-label="Skriv hvor varene skal"
          autoFocus
          className="h-12 text-base"
        />
      ) : null}
    </div>
  );
}
