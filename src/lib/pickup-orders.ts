// Datalaget for bestillingane. Innsending, oppslag og kontorets handlingar går
// gjennom databasefunksjonar: ei bestilling blir aldri skriven rett i
// pipe_orders herifrå, fordi godkjenning og avvisning flyttar rør og må skje i
// same transaksjon som statusen.

import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { QK } from "@/lib/orders";
import type {
  CustomerType,
  OrderStatus,
  OrderWithLines,
  PickupOrderInput,
  PipeOrderEmailRow,
  PipeOrderLineRow,
  PipeOrderRow,
} from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PickupOrderLine = Pick<
  PipeOrderLineRow,
  "name" | "dimension" | "sku" | "unit" | "quantity" | "unit_price" | "line_total"
>;

/** Bestillinga slik kunden ser henne – det pipe_get_pickup_order gir. */
export type PickupOrder = {
  id: string;
  order_number: number;
  created_at: string;
  status: OrderStatus;
  pickup_date: string;
  pickup_now: boolean;
  customer_type: CustomerType;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company: string | null;
  org_number: string | null;
  billing_address: string | null;
  comment: string | null;
  customer_message: string | null;
  handled_at: string | null;
  total: number;
  lines: PickupOrderLine[];
  /** Når kvittering, klar og avvist gjekk ut. Kontorets varsel er ikkje med. */
  emails: Partial<Record<"kvittering" | "klar" | "avvist", string>>;
};

export async function submitPickupOrder(input: PickupOrderInput): Promise<{ id: string; order_number: number }> {
  const { data, error } = await supabase.rpc("pipe_submit_pickup_order", {
    p_customer_type: input.customer_type,
    p_customer_name: input.customer_name,
    p_customer_email: input.customer_email,
    p_lines: input.lines as unknown as Json,
    p_customer_phone: input.customer_phone,
    p_company: input.company,
    p_org_number: input.org_number,
    p_billing_address: input.billing_address,
    p_pickup_now: input.pickup_now,
    p_pickup_date: input.pickup_date,
    p_comment: input.comment,
  });
  // Meldinga frå basen er allereie norsk og skriven for kunden.
  if (error) throw new Error(error.message || "Klarte ikke å sende bestillingen");
  const svar = data as { id?: string; order_number?: number } | null;
  if (!svar?.id) throw new Error("Klarte ikke å sende bestillingen");
  return { id: svar.id, order_number: Number(svar.order_number) };
}

const tal = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Null når id-en ikkje finst eller peikar på eit uttak. Kastar ved nettfeil. */
export async function fetchPickupOrder(id: string): Promise<PickupOrder | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.rpc("pipe_get_pickup_order", { p_id: id });
  if (error) throw new Error(`Klarte ikke å hente bestillingen: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as PickupOrder;
  return {
    ...r,
    total: Number(r.total),
    lines: (r.lines ?? []).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_price: tal(l.unit_price),
      line_total: tal(l.line_total),
    })),
    emails: r.emails ?? {},
  };
}

export async function approvePickupOrder(id: string, message: string | null): Promise<void> {
  const { error } = await supabase.rpc("pipe_approve_pickup_order", { p_id: id, p_message: message });
  if (error) throw new Error(error.message || "Klarte ikke å godkjenne bestillingen");
}

export async function rejectPickupOrder(id: string, message: string): Promise<void> {
  const { error } = await supabase.rpc("pipe_reject_pickup_order", { p_id: id, p_message: message });
  if (error) throw new Error(error.message || "Klarte ikke å avvise bestillingen");
}

/** «Henter nå» først, så tidlegaste hentedag, så eldste innsending. */
export function sorterVenter<T extends Pick<PipeOrderRow, "pickup_now" | "pickup_date" | "created_at">>(rader: T[]): T[] {
  return [...rader].sort(
    (a, b) =>
      Number(Boolean(b.pickup_now)) - Number(Boolean(a.pickup_now)) ||
      (a.pickup_date ?? "").localeCompare(b.pickup_date ?? "") ||
      a.created_at.localeCompare(b.created_at),
  );
}

/**
 * Bestillingar som ventar på godkjenning, uavhengig av datofilteret i lista.
 * Feilar spørjinga – til dømes fordi migrasjonen ikkje er køyrd og kolonnen
 * kind ikkje finst – er svaret ei tom liste: då finst det ingenting å vente på.
 */
export async function fetchWaitingPickupOrders(): Promise<OrderWithLines[]> {
  const { data, error } = await supabase
    .from("pipe_orders")
    .select("*, pipe_order_lines(*)")
    .eq("kind", "bestilling")
    .eq("status", "ny");
  if (error) return [];
  const rows = (data ?? []) as unknown as (PipeOrderRow & { pipe_order_lines?: PipeOrderLineRow[] })[];
  return sorterVenter(
    rows.map(({ pipe_order_lines, ...o }) => ({
      ...o,
      lines: [...(pipe_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    })),
  );
}

/** Spør kvart minutt, så kontoret ser nye bestillingar utan å laste sida på nytt. */
export function useWaitingPickupOrders(enabled = true) {
  return useQuery({
    queryKey: QK.waitingPickups,
    queryFn: fetchWaitingPickupOrders,
    enabled,
    refetchInterval: 60_000,
  });
}

export async function fetchOrderEmails(orderId: string): Promise<PipeOrderEmailRow[]> {
  const { data, error } = await supabase
    .from("pipe_order_emails")
    .select("*")
    .eq("order_id", orderId)
    .order("claimed_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as PipeOrderEmailRow[];
}

/** Ei rad frå adminlista i same form som kunden får – det PDF-en treng. */
export function somBestilling(o: OrderWithLines): PickupOrder {
  return {
    id: o.id,
    order_number: o.order_number,
    created_at: o.created_at,
    status: o.status,
    pickup_date: o.pickup_date ?? o.created_at.slice(0, 10),
    pickup_now: o.pickup_now ?? false,
    customer_type: o.customer_type ?? "privat",
    customer_name: o.customer_name,
    customer_email: o.customer_email ?? "",
    customer_phone: o.customer_phone,
    company: o.company,
    org_number: o.org_number ?? null,
    billing_address: o.billing_address ?? null,
    comment: o.comment,
    customer_message: o.customer_message ?? null,
    handled_at: o.handled_at,
    total: o.total,
    lines: o.lines.map((l) => ({
      name: l.name,
      dimension: l.dimension,
      sku: l.sku,
      unit: l.unit,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    })),
    emails: {},
  };
}

// ── E-post ──
//
// Funksjonen bestilling-epost tek imot ein id og ingenting anna, og avgjer sjølv
// kva som skal sendast. Kvart kall er trygt å gjenta.

export type EmailResult = { satt_opp: boolean; sendt: string[]; feilet: string[] };

const funksjonsUrl = () =>
  `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/bestilling-epost`;

/**
 * Ber om e-post utan å vente. Overlever at fana blir lukka.
 *
 * Ein enkel førespurnad – rein tekst, ingen eigne hovud – slik at han ikkje
 * treng preflight. Då kan sendBeacon og keepalive fullføre han etter at kunden
 * har gått, og funksjonen er rulla ut utan JWT-krav av same grunn.
 */
export function requestEmailsInBackground(id: string): void {
  if (!isSupabaseConfigured || !UUID.test(id)) return;
  const url = funksjonsUrl();
  const body = JSON.stringify({ id });
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* fell gjennom til fetch */
  }
  void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

/** Ber om e-post og ventar på svaret, høgst 12 sekund. Kastar aldri. */
export async function requestEmails(id: string): Promise<EmailResult | null> {
  if (!isSupabaseConfigured || !UUID.test(id)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(funksjonsUrl(), {
      method: "POST",
      body: JSON.stringify({ id }),
      headers: { "Content-Type": "text/plain" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const r = (await res.json()) as Partial<EmailResult>;
    return { satt_opp: r.satt_opp === true, sendt: r.sendt ?? [], feilet: r.feilet ?? [] };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
