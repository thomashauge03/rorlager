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

/** Talet på fana. Same nøkkel som lista, så det følgjer med når eit forslag blir lukka. */
export function useNewSuggestionCount(enabled: boolean) {
  const q = useQuery({ queryKey: QK.suggestions, queryFn: fetchSuggestions, enabled });
  return (q.data ?? []).filter((s) => s.status === "ny").length;
}

/** Kan linja få pris no? Ho må finnast, ordren må ikkje vere fakturert. */
export const kanPrisast = (s: Suggestion) => Boolean(s.order_line_id && s.order && !s.order.invoice_id);
