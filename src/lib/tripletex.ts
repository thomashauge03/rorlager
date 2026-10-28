// Tripletex frå appen si side: køen, innstillingane, koplingane og kallet til
// edge-funksjonen tripletex-ordre. Nøkkelen er aldri her – berre funksjonen har
// han. Kva kvart statusord tyder, står i 20261028100000_tripletex.sql.

import { supabase } from "@/integrations/supabase/client";
import type {
  PipeTripletexInnstillingRow,
  PipeTripletexKoRow,
  PipeTripletexKundeRow,
} from "@/integrations/supabase/types";
import { erAnsattUttak } from "@/lib/fakturakunde";
import type { PipeOrderRow } from "@/lib/types";

export const QK_TRIPLETEX = {
  ko: ["tripletex", "ko"],
  innstilling: ["tripletex", "innstilling"],
  kunder: ["tripletex", "kunder"],
};

/** Eit kall som står som under_sending eller laster_opp lenger enn dette, døydde midt i */
export const FORLATT_ETTER_MS = 5 * 60_000;

function fail(context: string, error: { message?: string } | null): never {
  const detail = error?.message?.trim();
  throw new Error(detail ? `${context}: ${detail}` : context);
}

/* ---------------------------------------------------------------- lesing */

/** Køradene som høyrer til eit grunnlag som finst, etter grunnlaget */
export async function fetchTripletexKo(): Promise<Map<string, PipeTripletexKoRow>> {
  const { data, error } = await supabase.from("pipe_tripletex_ko").select("*").not("invoice_id", "is", null);
  if (error) fail("Klarte ikke å hente Tripletex-statusen", error);
  return new Map((data ?? []).map((r) => [r.invoice_id as string, r as PipeTripletexKoRow]));
}

export async function fetchTripletexInnstilling(): Promise<PipeTripletexInnstillingRow | null> {
  const { data, error } = await supabase.from("pipe_tripletex_innstilling").select("*").maybeSingle();
  if (error) fail("Klarte ikke å hente Tripletex-innstillingene", error);
  return (data as PipeTripletexInnstillingRow | null) ?? null;
}

export async function lagreTripletexInnstilling(
  endring: Pick<PipeTripletexInnstillingRow, "fra_dato" | "produkt_nr" | "felleskunde_nr" | "forfall_dagar">,
): Promise<void> {
  // RLS slepp berre superadmin til. Ingen rad tilbake = ingenting lagra, og det skal seiast
  const { data, error } = await supabase.from("pipe_tripletex_innstilling").update(endring).eq("id", true).select("id");
  if (error) fail("Klarte ikke å lagre Tripletex-innstillingene", error);
  if (!data || data.length === 0) throw new Error("Bare superadmin kan endre Tripletex-innstillingene.");
}

export async function fetchTripletexKunder(): Promise<PipeTripletexKundeRow[]> {
  const { data, error } = await supabase.from("pipe_tripletex_kunde").select("*").order("koblet_at", { ascending: false });
  if (error) fail("Klarte ikke å hente kundekoblingene", error);
  return (data ?? []) as PipeTripletexKundeRow[];
}

export async function fjernTripletexKunde(nokkel: string): Promise<void> {
  const { error } = await supabase.from("pipe_tripletex_kunde").delete().eq("kunde_nokkel", nokkel);
  if (error) fail("Klarte ikke å fjerne koblingen", error);
}

/** Kontoret har sett i Tripletex. Gir det nye statusordet */
export async function tripletexKontrollert(invoiceId: string, fant: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("pipe_tripletex_kontrollert", { p_invoice_id: invoiceId, p_fant: fant });
  if (error) fail("Klarte ikke å lagre kontrollen", error);
  return data as string;
}

/* ---------------------------------------------------------------- sending */

export type VedleggSvar = { status: string; melding?: string; tripletexTekst?: string };

export type TripletexSvar = {
  sendt: boolean;
  ordreId?: number;
  grunn?: string;
  koStatus?: string;
  melding?: string;
  tripletexTekst?: string;
  lagret?: boolean;
  grunnlag?: number[];
  vedlegg?: VedleggSvar;
};

async function kallFunksjonen(body: Record<string, unknown>): Promise<TripletexSvar> {
  const { data, error } = await supabase.functions.invoke<TripletexSvar>("tripletex-ordre", { body });
  if (error) {
    // Meldinga frå funksjonen ligg i kroppen, ikkje i error.message
    let detalj = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const kropp = await ctx.json();
        detalj = typeof kropp?.feil === "string" ? kropp.feil : "";
      } catch {
        /* den generiske teksten får stå */
      }
    }
    if (/Failed to (send|fetch)|NetworkError/i.test(error.message)) {
      // Kom kallet fram? Det veit vi ikkje. Køen seier det etter ei omlasting
      throw new Error("Nådde ikke serverfunksjonen tripletex-ordre. Last siden på nytt og se statusen på grunnlaget før du sender igjen.");
    }
    throw new Error(detalj || "Tripletex-funksjonen svarte med en feil. Last siden på nytt og se statusen på grunnlaget.");
  }
  return data ?? { sendt: false, grunn: "feil" };
}

export function sendTilTripletex(a: {
  invoiceId: string;
  pdf: string;
  filnavn: string;
  kundeNokkel: string | null;
  kundenr?: number;
  intern?: boolean;
  overlappBekreftet?: boolean;
}): Promise<TripletexSvar> {
  return kallFunksjonen({
    invoice_id: a.invoiceId,
    pdf: a.pdf,
    filnavn: a.filnavn,
    kunde_nokkel: a.kundeNokkel,
    ...(a.kundenr ? { kundenr: a.kundenr } : {}),
    ...(a.intern ? { intern: true } : {}),
    ...(a.overlappBekreftet ? { overlappBekreftet: true } : {}),
  });
}

export function leggVedPdf(a: { invoiceId: string; pdf: string; filnavn: string; overta?: boolean }): Promise<TripletexSvar> {
  return kallFunksjonen({
    handling: "vedlegg",
    invoice_id: a.invoiceId,
    pdf: a.pdf,
    filnavn: a.filnavn,
    ...(a.overta ? { overta: true } : {}),
  });
}

/* ---------------------------------------------------------------- tolking */

/** Eit grunnlag der alle uttaka er tilsette sine til ein jobb: ingen kunde å fakturere */
export const erInterntGrunnlag = (ordrar: Pick<PipeOrderRow, "kind" | "created_by">[]) =>
  ordrar.length > 0 && ordrar.every(erAnsattUttak);

/** Ein toast av svaret. Null: ingenting å seie (integrasjonen er av, eller grunnlaget er eldre enn bryteren) */
export function forklarSvar(s: TripletexSvar): { tittel: string; tekst: string; feil: boolean } | null {
  if (s.sendt && s.lagret === false) return { tittel: "Ordren er laget i Tripletex", tekst: s.melding ?? "", feil: true };
  if (s.sendt) {
    const v = s.vedlegg;
    if (!v || v.status === "lagt_ved") {
      return { tittel: "Sendt til Tripletex", tekst: v?.melding ?? "Ordren er laget med PDF-en som vedlegg. Den følger fakturaen når den lages i Tripletex.", feil: false };
    }
    return {
      tittel: "Ordren er laget, men PDF-en ble ikke lagt ved",
      tekst: [v.melding, v.tripletexTekst ? `Tripletex: ${v.tripletexTekst}` : ""].filter(Boolean).join(" "),
      feil: true,
    };
  }
  switch (s.grunn) {
    case "av":
    case "ikke i koen":
      return null;
    case "ikke satt opp":
      return { tittel: "Tripletex er ikke satt opp", tekst: s.melding ?? "Ingenting er sendt.", feil: true };
    case "alt sendt":
      return { tittel: "Allerede i Tripletex", tekst: "Grunnlaget har en ordre fra før. Ingenting nytt er sendt.", feil: false };
    case "alt lagt ved":
      return { tittel: "PDF-en ligger allerede på ordren", tekst: "Ingenting nytt er lagt ved.", feil: false };
    case "opptatt":
      return { tittel: "Sendes akkurat nå", tekst: "Et annet kall holder på med dette grunnlaget. Vent litt og last siden på nytt.", feil: true };
    case "ukjent":
      return { tittel: "Se i Tripletex først", tekst: "Et tidligere forsøk kan ha kommet fram. Ingenting er sendt.", feil: true };
    case "overlapp":
      return null; // spurt om i eigen dialog
    case "mangler_kunde":
      return { tittel: "Fant ikke kunden i Tripletex", tekst: s.melding ?? "Skriv inn kundenummeret.", feil: true };
    default:
      return {
        tittel: s.koStatus === "ukjent_utfall" ? "Usikkert om ordren ble laget" : "Ble ikke sendt til Tripletex",
        tekst: [s.melding, s.tripletexTekst ? `Tripletex: ${s.tripletexTekst}` : ""].filter(Boolean).join(" ") || "Ukjent feil.",
        feil: true,
      };
  }
}

export type Visning = {
  tekst: string;
  tone: "ok" | "vent" | "advar" | "feil";
  /** Send, med eller utan kundenummer og internt */
  kanSende: boolean;
  /** Kontoret må seie kva det fann i Tripletex */
  maKontrollere: boolean;
  /** Ordren finst: grunnlaget kan ikkje angrast utan at det blir sagt */
  harOrdre: boolean;
  vedlegg: { tekst: string; knapp: "legg_ved" | "legg_ved_likevel" | null } | null;
};

/** Kva rada skal vise. Les berre orda, aldri teksten i siste_feil */
export function visTripletex(r: PipeTripletexKoRow, naa = Date.now()): Visning {
  const gammal = (t: string | null) => !!t && naa - Date.parse(t) > FORLATT_ETTER_MS;
  const ingen = { kanSende: false, maKontrollere: false, harOrdre: false, vedlegg: null };

  switch (r.status) {
    case "venter":
      return { ...ingen, tekst: "Venter på å bli sendt til Tripletex", tone: "vent", kanSende: true };
    case "feilet":
      return { ...ingen, tekst: "Tripletex avviste ordren. Ingenting er opprettet", tone: "feil", kanSende: true };
    case "mangler_kunde":
      return { ...ingen, tekst: "Fant ikke kunden i Tripletex", tone: "advar", kanSende: true };
    case "under_sending":
      return gammal(r.endret)
        ? { ...ingen, tekst: "Sendingen stoppet midt i. Ordren kan være opprettet", tone: "advar", maKontrollere: true, harOrdre: true }
        : { ...ingen, tekst: "Sender til Tripletex …", tone: "vent", harOrdre: true };
    case "ukjent_utfall":
      return { ...ingen, tekst: "Usikkert om ordren ble opprettet. Se i Tripletex", tone: "advar", maKontrollere: true, harOrdre: true };
    case "sendt":
    case "kontrollert": {
      const v = r.vedlegg_status;
      const vedlegg =
        v === "lagt_ved"
          ? { tekst: "PDF-en er lagt ved", knapp: null }
          : v === "feilet"
            ? { tekst: "PDF-en ble ikke lagt ved", knapp: "legg_ved" as const }
            : v === "ukjent" || (v === "laster_opp" && gammal(r.vedlegg_endret))
              ? { tekst: "Usikkert om PDF-en ble lagt ved", knapp: "legg_ved_likevel" as const }
              : v === "laster_opp"
                ? { tekst: "Legger ved PDF …", knapp: null }
                : // Ein ordre utan id (kontrollert) kan ikkje få vedlegg frå appen
                  r.tripletex_ordre_id
                  ? { tekst: "PDF-en er ikke lagt ved", knapp: "legg_ved" as const }
                  : { tekst: "Legg ved PDF-en for hånd i Tripletex", knapp: null };
      return {
        ...ingen,
        tekst: r.status === "kontrollert" ? "Kontrollert i Tripletex" : "Ordre i Tripletex",
        tone: "ok",
        harOrdre: true,
        vedlegg,
      };
    }
    default:
      return { ...ingen, tekst: "Ukjent Tripletex-status", tone: "advar" };
  }
}
