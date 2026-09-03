// Domenetypane appen jobbar med. Ligg her og ikkje i supabase/types.ts fordi
// dei skal kunne endrast utan at databaseskjemaet blir rørt.

export type {
  PipeCategoryRow,
  PipeTypeRow,
  PipeCatalogRow,
  PipeOrderRow,
  PipeOrderLineRow,
  PipeStockLogRow,
  PipeInvoiceRow,
  PipeSettingsRow,
  PipePublicSettingsRow,
  SystemUserRow,
  ProjectRow,
  ProjectMemberRow,
  ProjectOrderRow,
  ProjectOrderLineRow,
  ProjectOrderStatus,
  ProjectReceiptRow,
  ProjectReceiptLineRow,
  ProjectReceiptPhotoRow,
  Deviation,
} from "@/integrations/supabase/types";

import type {
  ProjectReceiptPhotoRow,
  PipeTypeRow,
  PipeCatalogRow,
  PipeOrderRow,
  PipeOrderLineRow,
  ProjectOrderRow,
  ProjectOrderLineRow,
  ProjectOrderStatus,
  ProjectReceiptRow,
  ProjectReceiptLineRow,
  Deviation,
} from "@/integrations/supabase/types";

/** Ei rørtype med kategorinamnet slått opp – det er slik lista blir vist. */
export type PipeType = PipeTypeRow & { category_name?: string | null };

/**
 * Same som PipeType, men utan cost_price. Dette er typen alle sider utanfor
 * kontoret skal bruke – typesystemet stoppar då eit uhell der innkjøpsprisen
 * blir teikna på ei kundeside.
 */
export type CatalogItem = PipeCatalogRow & { category_name?: string | null };

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

// ── Prosjekt, bestilling og mottakskontroll ──

export const PROJECT_ORDER_STATUS_LABEL: Record<ProjectOrderStatus, string> = {
  meldt: "Meldt inn",
  bestilt: "Bestilt",
  delvis: "Delvis mottatt",
  mottatt: "Mottatt",
  avvist: "Avvist",
};

export const DEVIATION_LABEL: Record<Deviation, string> = {
  ingen: "Ingen avvik",
  mangler: "Mangler",
  skadet: "Skadet",
  feil_vare: "Feil vare",
  for_mye: "For mye",
};

/** Ei bestillingslinje med det som er mottatt på henne rekna ut. */
export type ProjectOrderLine = ProjectOrderLineRow & {
  /** Summen av alle mottak på linja, over alle puljer. */
  received_qty: number;
  /** Bestilt minus mottatt. Negativ når det kom for mykje. */
  remaining_qty: number;
};

/** Eit mottak med linjene og bileta sine. */
export type ProjectReceiptFull = ProjectReceiptRow & {
  lines: ProjectReceiptLineRow[];
  photos: ProjectReceiptPhotoRow[];
};

/** Ei bestilling slik ho blir vist: hovudrada, linjene og mottaka. */
export type ProjectOrderWithLines = ProjectOrderRow & {
  lines: ProjectOrderLine[];
  receipts: ProjectReceiptFull[];
};
