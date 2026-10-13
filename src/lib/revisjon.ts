// Revisjonssporet: kven endra kva, og når. Skrive av triggerar i basen
// (20261014190000_revisjon.sql); her blir det berre lese og gjort lesbart.

import { supabase } from "@/integrations/supabase/client";

export type Revisjon = {
  id: string;
  created_at: string;
  created_by_name: string | null;
  tabell: string;
  rad_id: string | null;
  kva: string | null;
  handling: "ny" | "endret" | "slettet";
  endringar: Record<string, unknown>;
};

export const TABELL_LABEL: Record<string, string> = {
  pipe_types: "Vare",
  pipe_settings: "Innstillinger",
  pipe_orders: "Ordre",
  pipe_order_lines: "Ordrelinje",
  pipe_invoices: "Fakturagrunnlag",
  system_users: "Bruker",
};

const FELT_LABEL: Record<string, string> = {
  price: "pris",
  cost_price: "kostpris",
  name: "navn",
  dimension: "dimensjon",
  sku: "varenr.",
  active: "aktiv",
  low_stock_threshold: "varselgrense",
  category_id: "kategori",
  qr_slug: "QR-kode",
  markup_percent: "påslag %",
  vat_rate: "mva %",
  show_prices: "vis priser",
  require_phone: "krev telefon",
  require_signature: "krev signatur",
  accept_orders: "ta imot bestillinger",
  order_email: "varsel-e-post",
  payment_terms_days: "betalingsfrist",
  stock_project_id: "lagerprosjekt",
  company_name: "firmanavn",
  org_number: "org.nr.",
  address: "adresse",
  phone: "telefon",
  email: "e-post",
  status: "status",
  project: "prosjekt",
  project_id: "prosjekt (id)",
  invoice_id: "fakturert",
  order_number: "nr.",
  quantity: "mengde",
  pipe_type_id: "vare",
  unit_price: "pris",
  order_id: "ordre",
  invoice_number: "grunnlag nr.",
  total: "sum",
  period_from: "fra",
  period_to: "til",
  full_name: "navn",
  role: "rolle",
};

/** Felt som berre er ein id – meiningslause å vise som tal. */
const SKJULT = new Set(["category_id", "project_id", "pipe_type_id", "order_id", "stock_project_id"]);

const vis = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "ja" : "nei";
  if (typeof v === "number") return String(v).replace(".", ",");
  return String(v);
};

/** «pris 100 → 120 · kostpris 60 → 65». Id-felt blir nemnde utan verdiar. */
export function beskrivEndring(r: Pick<Revisjon, "handling" | "endringar">): string {
  const deler = Object.entries(r.endringar ?? {}).map(([felt, v]) => {
    const namn = FELT_LABEL[felt] ?? felt;
    if (r.handling === "endret") {
      if (felt === "invoice_id") {
        const ft = v as { fra: unknown; til: unknown };
        return ft.til ? "fakturert" : "faktura angret";
      }
      if (SKJULT.has(felt)) return `${namn} byttet`;
      const { fra, til } = v as { fra: unknown; til: unknown };
      return `${namn} ${vis(fra)} → ${vis(til)}`;
    }
    if (SKJULT.has(felt)) return null;
    return `${namn} ${vis(v)}`;
  });
  return deler.filter(Boolean).join(" · ");
}

export async function fetchRevisjon(opts: { tabell?: string; radId?: string; grense?: number } = {}): Promise<Revisjon[]> {
  let q = supabase.from("pipe_revisjon").select("*").order("created_at", { ascending: false }).limit(opts.grense ?? 300);
  if (opts.tabell) q = q.eq("tabell", opts.tabell);
  if (opts.radId) q = q.eq("rad_id", opts.radId);
  const { data, error } = await q;
  if (error) throw new Error(`Klarte ikke å hente endringsloggen: ${error.message}`);
  return (data ?? []) as unknown as Revisjon[];
}
