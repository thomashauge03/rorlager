// Dyplenker fra Innboks. Et klikk på en sak der skal åpne adminpanelet akkurat
// på saken: riktig fane, filtrene slik at den kommer med, rullet fram og
// markert. Her ligger det som er felles for fanene: lesingen av URL-en, hvilken
// fane som eier saken, den trygge «next»-stien etter innlogging og markeringen.
//
// Parametrene leses bare. De endrer aldri data, og de fjernes ikke fra
// adressefeltet.

export type Dyplenke =
  /** Uttak eller hentebestilling, på order_number i pipe_orders. */
  | { type: "ordre"; nummer: number }
  /** Prosjektbehov, på order_number i project_orders. */
  | { type: "behov"; nummer: number }
  /** Mottakskontroll, på receipt_number i project_receipts. */
  | { type: "mottak"; nummer: number };

/**
 * Bare et positivt heltall slipper gjennom.
 *
 * Verdien kommer rett fra adressefeltet, så den valideres strengt før den
 * brukes i en spørring eller vises. Ni sifre holder godt for løpenumrene, og
 * stopper tall som ikke lenger er nøyaktige i JavaScript.
 */
export function lesNummer(verdi: string | null | undefined): number | null {
  if (verdi == null) return null;
  const v = verdi.trim();
  if (!/^[0-9]{1,9}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

/** Den første gyldige dyplenken i URL-en, eller null. */
export function lesDyplenke(params: URLSearchParams): Dyplenke | null {
  for (const type of ["ordre", "behov", "mottak"] as const) {
    const nummer = lesNummer(params.get(type));
    if (nummer !== null) return { type, nummer };
  }
  return null;
}

/**
 * Fanen som viser saken.
 *
 * Saken vinner over «fane»: prosjektbehov og mottak ligger under «Å bestille»,
 * ikke under «Prosjekt», så en lenke med fane=prosjekt&behov=12 skal likevel
 * havne der behovet står.
 */
export function faneFor(d: Dyplenke): "bestillinger" | "abestille" {
  return d.type === "ordre" ? "bestillinger" : "abestille";
}

/**
 * Stien innloggingen kan sende brukeren tilbake til, eller null.
 *
 * Bare lokale stier under /admin. Alt annet, også «//ondsinnet.no» og
 * skråstreker baklengs som enkelte nettlesere tolker som vertsnavn, avvises,
 * så parameteren aldri kan bli en åpen videresending.
 */
export function tryggNeste(neste: string | null | undefined): string | null {
  if (!neste || neste.length > 500) return null;
  if (!/^\/admin(?:[/?#]|$)/.test(neste)) return null;
  if (/[\\\s]/.test(neste) || neste.includes("//")) return null;
  return neste;
}

/** Hvor lenge markeringen står. Kravet er 3 til 4 sekunder. */
export const MARKERING_MS = 3500;

/**
 * Ruller elementet inn midt i synsfeltet og markerer det en stund.
 *
 * Markeringen er en klasse som tas av igjen med en tidtaker, ikke en
 * animasjon: index.css setter animasjonene til nesten null ved
 * prefers-reduced-motion, og da ville markeringen blitt borte før noen så den.
 */
export function markerOgRull(el: HTMLElement): void {
  const rolig =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ block: "center", behavior: rolig ? "auto" : "smooth" });
  el.classList.add("hm-dyplenke");
  window.setTimeout(() => el.classList.remove("hm-dyplenke"), MARKERING_MS);
}
