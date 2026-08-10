// Domenetypane appen jobbar med. Ligg her og ikkje i supabase/types.ts fordi
// dei skal kunne endrast utan at databaseskjemaet blir rørt.

export type {
  PipeCategoryRow,
  PipeTypeRow,
  PipeOrderRow,
  PipeOrderLineRow,
  PipeStockLogRow,
  PipeInvoiceRow,
  PipeSettingsRow,
  SystemUserRow,
} from "@/integrations/supabase/types";

import type { PipeTypeRow, PipeOrderRow, PipeOrderLineRow } from "@/integrations/supabase/types";

/** Ei rørtype med kategorinamnet slått opp – det er slik lista blir vist. */
export type PipeType = PipeTypeRow & { category_name?: string | null };

/** Ei linje i handlekurven. Ligg i localStorage, difor berre det nødvendige. */
export type CartLine = {
  pipe_type_id: string;
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  price: number | null;
  /** Meter eller stykk, avhengig av unit */
  quantity: number;
  location: string | null;
};

export type OrderStatus = "ny" | "behandlet" | "levert" | "avvist";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ny: "Ny",
  behandlet: "Behandlet",
  levert: "Levert",
  avvist: "Avvist",
};

/** Ei bestilling slik adminpanelet ser henne: hovudrada med linjene sine. */
export type OrderWithLines = PipeOrderRow & { lines: PipeOrderLineRow[] };

/** Svaret frå pipe_submit_order – kvitteringa kunden får med seg. */
export type SubmittedOrder = {
  id: string;
  order_number: number;
  created_at: string;
  customer_name: string;
  company: string | null;
  project: string | null;
  comment: string | null;
  total: number;
  lines: {
    name: string;
    dimension: string | null;
    sku: string | null;
    unit: string;
    quantity: number;
    unit_price: number | null;
    line_total: number | null;
  }[];
};

export type StockStatus = "tomt" | "snart" | "pa_lager";
