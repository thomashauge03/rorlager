// Forslaga frå «Annet», og prisen kontoret set på éi linje. Berre for kontoret:
// pipe_suggestions er stengd for alle andre, og pipe_price_line sjekkar sjølv.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/orders";
import type { OrderKind, PipeOrderLineRow, PipeSuggestionRow, SuggestionStatus } from "@/lib/types";

/** Eit forslag med det kortet treng å vite om ordren og linja det kom frå. */
export type Suggestion = PipeSuggestionRow & {
  order: { order_number: number; kind: OrderKind; invoice_id: string | null; status: string } | null;
  line: { unit_price: number | null; line_total: number | null } | null;
};

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  ny: "Ny",
  opprettet: "Lagt i katalogen",
  engangs: "Engangsvare",
  avvist: "Avvist",
};

export async function fetchSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from("pipe_suggestions")
    .select("*, order:pipe_orders(order_number, kind, invoice_id, status), line:pipe_order_lines(unit_price, line_total)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Klarte ikke å hente forslagene: ${error.message}`);
  return (data ?? []) as unknown as Suggestion[];
}

/** Same vare, skriven likt nok: namn, dimensjon og eining utan store bokstavar og doble mellomrom. */
export const forslagNøkkel = (s: Pick<Suggestion, "name" | "dimension" | "unit">) =>
  [s.name, s.dimension ?? "", s.unit].map((v) => v.trim().replace(/\s+/g, " ").toLowerCase()).join("|");

/**
 * Like forslag samla: fem som har bede om «PE-rør 40 mm» er éin vare kontoret
 * bør ta inn, ikkje fem kort. Rekkjefølgja er etter det nyaste forslaget i
 * kvar gruppe, og innanfor gruppa nyaste først.
 */
export function grupperForslag(liste: Suggestion[]): Suggestion[][] {
  const grupper = new Map<string, Suggestion[]>();
  for (const s of liste) {
    const k = forslagNøkkel(s);
    grupper.set(k, [...(grupper.get(k) ?? []), s]);
  }
  return [...grupper.values()]
    .map((g) => [...g].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    .sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
}

/** Lukkar eit forslag. Varen blir knytt til når ho er oppretta frå forslaget. */
export async function closeSuggestion(id: string, status: Exclude<SuggestionStatus, "ny">, pipeTypeId: string | null = null) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("pipe_suggestions")
    .update({ status, pipe_type_id: pipeTypeId, handled_at: new Date().toISOString(), handled_by: auth.user?.id ?? null })
    .eq("id", id);
  if (error) throw new Error(`Klarte ikke å lagre forslaget: ${error.message}`);
}

/** Opnar eit lukka forslag att, om nokon trykte feil. */
export async function reopenSuggestion(id: string) {
  const { error } = await supabase
    .from("pipe_suggestions")
    .update({ status: "ny", pipe_type_id: null, handled_at: null, handled_by: null })
    .eq("id", id);
  if (error) throw new Error(`Klarte ikke å åpne forslaget igjen: ${error.message}`);
}

/**
 * Set pris på éi linje. Basen reknar linjesum og ordretotal, og nektar på ein
 * fakturert ordre – meldinga derfrå er skriven for kontoret og går vidare uendra.
 */
export async function priceLine(lineId: string, unitPrice: number): Promise<PipeOrderLineRow> {
  const { data, error } = await supabase.rpc("pipe_price_line", { p_line_id: lineId, p_unit_price: unitPrice });
  if (error) throw new Error(error.message || "Klarte ikke å sette prisen");
  return data as unknown as PipeOrderLineRow;
}

// ── Retting av eit uttak ──
//
// Alle tre går gjennom funksjonar i basen som sjekkar kontoret, nektar ein
// fakturert ordre og skriv lager, sum og forslag i same transaksjon.

/** Anna prosjekt. Med projectId skriv basen teksten frå prosjektet; elles fritekst. */
export async function byttProsjekt(orderId: string, valg: { projectId: string } | { tekst: string }) {
  const { error } = await supabase.rpc("pipe_bytt_prosjekt", {
    p_order_id: orderId,
    p_project_id: "projectId" in valg ? valg.projectId : null,
    p_project: "tekst" in valg ? valg.tekst : null,
  });
  if (error) throw new Error(error.message || "Klarte ikke å bytte prosjekt");
}

/** Nytt namn på ei annet-linje. Forslaget følgjer med. */
export async function endreAnnet(lineId: string, name: string, dimension: string | null) {
  const { error } = await supabase.rpc("pipe_endre_annet", { p_line_id: lineId, p_name: name, p_dimension: dimension });
  if (error) throw new Error(error.message || "Klarte ikke å endre navnet");
}

/**
 * Nytt namn på eit forslag, før vara blir oppretta.
 *
 * Står ordren og er ikkje fakturert, går det gjennom linja, så uttaket og
 * forslaget seier det same. Er ordren sletta eller fakturert, blir berre
 * forslaget endra: eit sendt fakturagrunnlag skal ikkje skifte innhald.
 */
export async function endreForslag(s: Suggestion, name: string, dimension: string | null) {
  if (s.order_line_id && s.order && !s.order.invoice_id) {
    await endreAnnet(s.order_line_id, name, dimension);
    return;
  }
  const { error } = await supabase.from("pipe_suggestions").update({ name, dimension }).eq("id", s.id);
  if (error) throw new Error(`Klarte ikke å endre navnet: ${error.message}`);
}

/** Ny mengde på linja. Lageret får differansen når ordren har trekt det. */
export async function endreMengde(lineId: string, quantity: number) {
  const { error } = await supabase.rpc("pipe_endre_mengde", { p_line_id: lineId, p_quantity: quantity });
  if (error) throw new Error(error.message || "Klarte ikke å endre mengden");
}

/**
 * Retur til lager. Basen avgjer korleis: før faktura blir linja mindre, etter
 * faktura blir det ein returordre som krediterer på neste grunnlag.
 */
export async function registrerRetur(
  lineId: string,
  quantity: number,
  note: string | null,
): Promise<{ fort: "redusert" | "kreditert"; order_id: string; order_number?: number }> {
  const { data, error } = await supabase.rpc("pipe_retur", { p_line_id: lineId, p_quantity: quantity, p_note: note });
  if (error) throw new Error(error.message || "Klarte ikke å registrere returen");
  return data as unknown as { fort: "redusert" | "kreditert"; order_id: string; order_number?: number };
}

/** Anna vare på linja. Lageret følgjer med når ordren har trekt det. */
export async function byttVare(lineId: string, pipeTypeId: string) {
  const { error } = await supabase.rpc("pipe_bytt_vare", { p_line_id: lineId, p_pipe_type_id: pipeTypeId });
  if (error) throw new Error(error.message || "Klarte ikke å bytte vare");
}

/** Talet på fana. Same nøkkel som lista, så det følgjer med når eit forslag blir lukka. */
export function useNewSuggestionCount(enabled: boolean) {
  const q = useQuery({ queryKey: QK.suggestions, queryFn: fetchSuggestions, enabled });
  return (q.data ?? []).filter((s) => s.status === "ny").length;
}

/** Kan linja få pris no? Ho må finnast, ordren må ikkje vere fakturert. */
export const kanPrisast = (s: Suggestion) => Boolean(s.order_line_id && s.order && !s.order.invoice_id);
