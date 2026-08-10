// Datalaget mot Supabase. Alle spørjingar appen gjer skal gå gjennom denne fila,
// slik at sortering, filtrering og feilmeldingar blir like overalt.

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { searchKey } from "@/lib/stock";
import type {
  OrderStatus,
  OrderWithLines,
  PipeCategoryRow,
  PipeInvoiceRow,
  PipeOrderLineRow,
  PipeOrderRow,
  PipeStockLogRow,
  PipeType,
  PipeTypeRow,
  SubmittedOrder,
} from "@/lib/types";

/** Nøklane react-query deler på tvers av faner. Ligg her fordi det er her
 *  dataa blir henta – då kan ein invalidere utan å gjette på nøkkelen. */
export const QK = {
  types: ["pipe_types"],
  categories: ["pipe_categories"],
  orders: ["pipe_orders"],
  invoices: ["pipe_invoices"],
  settings: ["pipe_settings"],
  stockLog: ["pipe_stock_log"],
} as const;

/** Postgres-feil er engelske og kryptiske. Vi set på norsk kontekst så brukaren
 *  skjønar kva som feila, men held på originalteksten for feilsøking. */
function fail(context: string, error: { message?: string } | null): never {
  const detail = error?.message?.trim();
  throw new Error(detail ? `${context}: ${detail}` : context);
}

/** Norsk sortering med numeric: "32" før "110", og "110" før "160". */
const nb = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").localeCompare(b ?? "", "nb", { numeric: true });

// ---------------------------------------------------------------- rørtypar

export async function fetchPipeTypes(): Promise<PipeType[]> {
  const { data, error } = await supabase.from("pipe_types").select("*, pipe_categories(name)");
  if (error) fail("Klarte ikke å hente rørtypene", error);

  const rows = (data ?? []) as unknown as (PipeTypeRow & { pipe_categories?: { name: string } | null })[];

  return rows
    .map(({ pipe_categories, ...row }) => ({ ...row, category_name: pipe_categories?.name ?? null }))
    .sort((a, b) => {
      const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (bySort !== 0) return bySort;
      const byName = nb(a.name, b.name);
      return byName !== 0 ? byName : nb(a.dimension, b.dimension);
    });
}

/**
 * Slaar opp eit rør frå QR-koden. Fell tilbake til varenummeret fordi ein
 * skada etikett ofte blir taua inn manuelt – då er det SKU-en folk har for seg.
 */
export async function fetchPipeTypeBySlug(slug: string): Promise<PipeType | null> {
  const key = (slug ?? "").trim();
  if (!key) return null;

  const select = "*, pipe_categories(name)";
  const flatten = (row: any): PipeType | null => {
    if (!row) return null;
    const { pipe_categories, ...rest } = row;
    return { ...rest, category_name: pipe_categories?.name ?? null } as PipeType;
  };

  const bySlug = await supabase.from("pipe_types").select(select).eq("qr_slug", key.toLowerCase()).maybeSingle();
  if (bySlug.error) fail("Klarte ikke å hente røret", bySlug.error);
  if (bySlug.data) return flatten(bySlug.data);

  const bySku = await supabase.from("pipe_types").select(select).ilike("sku", key).maybeSingle();
  if (bySku.error) fail("Klarte ikke å hente røret", bySku.error);
  return flatten(bySku.data);
}

export async function fetchCategories(): Promise<PipeCategoryRow[]> {
  const { data, error } = await supabase
    .from("pipe_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) fail("Klarte ikke å hente kategoriene", error);
  return (data ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || nb(a.name, b.name));
}

export async function savePipeType(patch: Partial<PipeTypeRow> & { id?: string }): Promise<PipeTypeRow> {
  const { id, ...values } = patch;

  const query = id
    ? supabase.from("pipe_types").update(values).eq("id", id).select("*").single()
    : supabase.from("pipe_types").insert(values as PipeTypeRow).select("*").single();

  const { data, error } = await query;
  if (error) fail("Klarte ikke å lagre rørtypen", error);
  return data as PipeTypeRow;
}

export async function deletePipeType(id: string): Promise<void> {
  const { error } = await supabase.from("pipe_types").delete().eq("id", id);
  if (error) fail("Klarte ikke å slette rørtypen", error);
}

export async function saveCategory(patch: Partial<PipeCategoryRow> & { id?: string }): Promise<PipeCategoryRow> {
  const { id, ...values } = patch;

  const query = id
    ? supabase.from("pipe_categories").update(values).eq("id", id).select("*").single()
    : supabase.from("pipe_categories").insert(values as PipeCategoryRow).select("*").single();

  const { data, error } = await query;
  if (error) fail("Klarte ikke å lagre kategorien", error);
  return data as PipeCategoryRow;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("pipe_categories").delete().eq("id", id);
  if (error) fail("Klarte ikke å slette kategorien", error);
}

// ------------------------------------------------------------ bestillingar

/**
 * Sender kurven inn via RPC. Anonyme kundar har ikkje skrivetilgang til
 * pipe_orders, og prisane blir uansett henta i databasen – det klienten
 * måtte meine om pris blir ignorert.
 */
export async function submitOrder(input: {
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  company?: string | null;
  project?: string | null;
  comment?: string | null;
  signature?: string | null;
  lines: { pipe_type_id: string; quantity: number }[];
}): Promise<SubmittedOrder> {
  const { data, error } = await supabase.rpc("pipe_submit_order", {
    p_customer_name: input.customer_name,
    p_lines: input.lines.map((l) => ({ pipe_type_id: l.pipe_type_id, quantity: l.quantity })),
    p_customer_phone: input.customer_phone ?? null,
    p_customer_email: input.customer_email ?? null,
    p_company: input.company ?? null,
    p_project: input.project ?? null,
    p_comment: input.comment ?? null,
    p_signature: input.signature ?? null,
  });

  // Meldinga frå databasen er allereie skriven for kunden ("Handlekurven er tom"),
  // så ho blir sendt vidare uendra.
  if (error) throw new Error(error.message || "Klarte ikke å sende inn uttaket");
  if (!data) throw new Error("Klarte ikke å sende inn uttaket");

  return data as unknown as SubmittedOrder;
}

/** Frå-dato tel frå midnatt lokalt, ikkje UTC – elles fell kvelden før med. */
const startOfDayIso = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const endOfDayIso = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

/** Alt ein kan søkje etter i ei bestilling, samla i éin streng. */
function orderHaystack(order: PipeOrderRow): string {
  const phone = (order.customer_phone ?? "").replace(/\D/g, "");
  return searchKey(
    [order.customer_name, order.company, order.project, order.customer_phone, phone, `#${order.order_number}`, order.order_number]
      .filter(Boolean)
      .join(" "),
  );
}

export async function fetchOrders(
  opts: { from?: string; to?: string; status?: OrderStatus | "alle"; search?: string; onlyUninvoiced?: boolean } = {},
): Promise<OrderWithLines[]> {
  let query = supabase.from("pipe_orders").select("*, pipe_order_lines(*)").order("created_at", { ascending: false });

  if (opts.from) query = query.gte("created_at", startOfDayIso(opts.from));
  if (opts.to) query = query.lte("created_at", endOfDayIso(opts.to));
  if (opts.status && opts.status !== "alle") query = query.eq("status", opts.status);
  if (opts.onlyUninvoiced) query = query.is("invoice_id", null);

  const { data, error } = await query;
  if (error) fail("Klarte ikke å hente bestillingene", error);

  const rows = (data ?? []) as unknown as (PipeOrderRow & { pipe_order_lines?: PipeOrderLineRow[] })[];

  const orders: OrderWithLines[] = rows.map(({ pipe_order_lines, ...order }) => ({
    ...order,
    lines: [...(pipe_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));

  // Søket blir gjort i klienten med same nøkkel som resten av appen, slik at
  // "hauge maskin" treffer like godt som "Hauge  Maskin".
  const term = searchKey(opts.search ?? "");
  if (!term) return orders;

  const words = term.split(" ");
  return orders.filter((o) => {
    const haystack = orderHaystack(o);
    return words.every((word) => haystack.includes(word));
  });
}

export async function updateOrder(id: string, patch: Partial<PipeOrderRow>): Promise<void> {
  const { error } = await supabase.from("pipe_orders").update(patch).eq("id", id);
  if (error) fail("Klarte ikke å oppdatere bestillingen", error);
}

/**
 * Statusbytte fører også med seg kven som tok tak i bestillinga og når. Blir
 * status sett tilbake til "ny" må sporet nullstillast, elles ser det ut som
 * bestillinga er behandla likevel.
 */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  let handledBy: string | null = null;
  if (status !== "ny") {
    const { data } = await supabase.auth.getUser();
    handledBy = data?.user?.id ?? null;
  }

  const patch: Partial<PipeOrderRow> =
    status === "ny"
      ? { status, handled_at: null, handled_by: null }
      : { status, handled_at: new Date().toISOString(), handled_by: handledBy };

  const { error } = await supabase.from("pipe_orders").update(patch).eq("id", id);
  if (error) fail("Klarte ikke å endre status", error);
}

/** Sletting går via RPC fordi røra samstundes skal leggjast tilbake på lageret. */
export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.rpc("pipe_delete_order", { p_order_id: id });
  if (error) fail("Klarte ikke å slette bestillingen", error);
}

// ------------------------------------------------------------------ lager

export async function adjustStock(
  pipeTypeId: string,
  change: number,
  reason = "justering",
  note?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("pipe_adjust_stock", {
    p_pipe_type_id: pipeTypeId,
    p_change: change,
    p_reason: reason,
    p_note: note ?? null,
  });
  if (error) fail("Klarte ikke å justere beholdningen", error);
  return Number(data);
}

export async function setStock(pipeTypeId: string, stock: number, note?: string): Promise<number> {
  const { data, error } = await supabase.rpc("pipe_set_stock", {
    p_pipe_type_id: pipeTypeId,
    p_stock: stock,
    p_note: note ?? null,
  });
  if (error) fail("Klarte ikke å sette beholdningen", error);
  return Number(data);
}

// ------------------------------------------------------------------ prisar

export type MarkupScope = {
  /** Avgrens til éi varegruppe. Utelaten = alle. */
  categoryId?: string | null;
  /** Avgrens til utvalde varer. Utelaten = alle. */
  pipeTypeIds?: string[] | null;
  /** Rund av til nærmaste: 1 = heile kroner, 0.01 = øre. */
  roundTo?: number;
};

/**
 * Reknar salsprisen på nytt frå innkjøpsprisen. Returnerer talet på varer som
 * fekk ny pris – varer utan innkjøpspris blir hoppa over, og differansen mellom
 * dette talet og lista er det grensesnittet må forklare.
 */
export async function applyMarkup(percent: number, scope: MarkupScope = {}): Promise<number> {
  const { data, error } = await supabase.rpc("pipe_apply_markup", {
    p_percent: percent,
    p_category_id: scope.categoryId ?? null,
    p_pipe_type_ids: scope.pipeTypeIds ?? null,
    p_round_to: scope.roundTo ?? 1,
  });
  if (error) fail("Klarte ikke å oppdatere prisene", error);
  return Number(data ?? 0);
}

export type ImportResult = {
  /** Varer som fekk ny innkjøps- og salspris */
  updated: number;
  /** Linjer databasen tok imot */
  received: number;
  /** Varenummer i fila som ikkje finst i katalogen */
  unmatched: string[];
};

/**
 * Skriv innkjøpsprisane frå ei prisliste inn i katalogen og reknar ut
 * salsprisane på nytt. Namn, dimensjon, hylleplass og beholdning blir ikkje
 * rørte – dei kan vere retta for hand, og ein prisimport skal ikkje viske det ut.
 */
export async function importCosts(
  rows: { sku: string; cost: number }[],
  percent: number,
  roundTo = 1,
): Promise<ImportResult> {
  const { data, error } = await supabase.rpc("pipe_import_costs", {
    p_rows: rows as unknown as Json,
    p_percent: percent,
    p_round_to: roundTo,
  });
  if (error) fail("Klarte ikke å importere prisene", error);
  const r = (data ?? {}) as { updated?: number; received?: number; unmatched?: string[] };
  return { updated: r.updated ?? 0, received: r.received ?? 0, unmatched: r.unmatched ?? [] };
}

/**
 * Opprettar fleire varer i eitt kall. Brukt når ei prisliste inneheld varer
 * katalogen ikkje har frå før – då kan det vere hundrevis, og ei løkke med eitt
 * kall per vare ville teke minutt og kunne stoppa halvvegs.
 */
export async function createPipeTypes(rows: Partial<PipeTypeRow>[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await supabase.from("pipe_types").insert(rows as PipeTypeRow[]).select("id");
  if (error) fail("Klarte ikke å opprette varene", error);
  return data?.length ?? 0;
}

/** Reknar ut same pris som databasen gjer, slik at førehandsvisinga stemmer. */
export function previewPrice(costPrice: number | null, percent: number, roundTo = 1): number | null {
  if (costPrice === null || costPrice === undefined) return null;
  const step = roundTo || 1;
  return Math.round((costPrice * (1 + percent / 100)) / step) * step;
}

export async function fetchStockLog(opts: { pipeTypeId?: string; limit?: number } = {}): Promise<PipeStockLogRow[]> {
  let query = supabase
    .from("pipe_stock_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.pipeTypeId) query = query.eq("pipe_type_id", opts.pipeTypeId);

  const { data, error } = await query;
  if (error) fail("Klarte ikke å hente lagerloggen", error);
  return (data ?? []) as PipeStockLogRow[];
}

// ---------------------------------------------------------------- faktura

export async function fetchInvoices(): Promise<PipeInvoiceRow[]> {
  const { data, error } = await supabase
    .from("pipe_invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) fail("Klarte ikke å hente fakturagrunnlagene", error);
  return (data ?? []) as PipeInvoiceRow[];
}

export async function createInvoice(args: {
  customer_name: string;
  period_from: string;
  period_to: string;
  order_ids: string[];
  total: number;
  note?: string;
}): Promise<PipeInvoiceRow> {
  const { data, error } = await supabase.rpc("pipe_create_invoice", {
    p_customer_name: args.customer_name,
    p_period_from: args.period_from,
    p_period_to: args.period_to,
    p_order_ids: args.order_ids,
    p_total: args.total,
    p_note: args.note ?? null,
  });
  if (error) fail("Klarte ikke å lage fakturagrunnlaget", error);
  return data as unknown as PipeInvoiceRow;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.rpc("pipe_delete_invoice", { p_id: id });
  if (error) fail("Klarte ikke å slette fakturagrunnlaget", error);
}
