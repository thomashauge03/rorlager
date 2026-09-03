// Handskriven skjematype for rørlageret. Held berre pipe_*-tabellane og dei
// felles brukartabellane – resten av prosjektet høyrer andre appar til.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PipeCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
};

export type PipeTypeRow = {
  id: string;
  category_id: string | null;
  name: string;
  dimension: string | null;
  sku: string | null;
  qr_slug: string;
  unit: string;
  price: number | null;
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  location: string | null;
  color: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PipeOrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  company: string | null;
  project: string | null;
  comment: string | null;
  signature: string | null;
  status: "ny" | "behandlet" | "levert" | "avvist";
  total: number;
  handled_by: string | null;
  handled_at: string | null;
  admin_note: string | null;
  invoice_id: string | null;
};

export type PipeOrderLineRow = {
  id: string;
  order_id: string;
  pipe_type_id: string | null;
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number;
};

export type PipeStockLogRow = {
  id: string;
  created_at: string;
  pipe_type_id: string | null;
  pipe_name: string | null;
  change: number;
  balance_after: number | null;
  reason: string;
  order_id: string | null;
  note: string | null;
  created_by: string | null;
};

export type PipeInvoiceRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  invoice_number: number;
  customer_name: string;
  period_from: string;
  period_to: string;
  total: number;
  note: string | null;
};

export type PipeSettingsRow = {
  id: number;
  company_name: string;
  org_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  intro_text: string | null;
  pickup_note: string | null;
  show_prices: boolean;
  require_phone: boolean;
  require_signature: boolean;
  vat_rate: number;
  /** Påslag i prosent frå cost_price til price. Brukt av prisjusteringa. */
  markup_percent: number;
  updated_at: string;
};

export type SystemUserRow = {
  id: string;
  created_at: string;
  email: string;
  full_name: string | null;
  role: string;
  note: string | null;
  created_by: string | null;
};

// ── Prosjekt, bestilling og mottakskontroll ──
//
// Ein heilt annan kjede enn pipe_*: her blir varer kjøpte INN til eit prosjekt
// og køyrde rett frå leverandøren ut på byggjeplassen. Eige lager er ikkje
// involvert, og difor er det ingen kopling til pipe_orders eller pipe_stock_log.

export type ProjectRow = {
  id: string;
  project_number: number;
  name: string;
  client: string | null;
  /** Leveringsadressa. Kontoret treng henne når han tingar. */
  address: string | null;
  status: "aktiv" | "avsluttet";
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ProjectMemberRow = {
  id: string;
  project_id: string;
  email: string;
  created_at: string;
  created_by: string | null;
};

export type ProjectOrderStatus = "meldt" | "bestilt" | "delvis" | "mottatt" | "avvist";

export type ProjectOrderRow = {
  id: string;
  order_number: number;
  project_id: string;
  status: ProjectOrderStatus;
  needed_by: string | null;
  note: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  supplier: string | null;
  supplier_ref: string | null;
  expected_at: string | null;
  ordered_by: string | null;
  ordered_at: string | null;
  office_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectOrderLineRow = {
  id: string;
  order_id: string;
  /** Null for fritekstlinje – noko katalogen ikkje har. */
  pipe_type_id: string | null;
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  /** Det plassen bad om */
  requested_qty: number;
  /** Det kontoret faktisk tinga. Null til han har bestemt seg, 0 = stroken. */
  ordered_qty: number | null;
  line_note: string | null;
  sort_order: number;
};

export type ProjectReceiptRow = {
  id: string;
  receipt_number: number;
  order_id: string;
  received_at: string;
  received_by: string | null;
  received_by_name: string;
  signature: string | null;
  note: string | null;
  /** Nøkkel klienten lagar før innsending, så eit nytt forsøk ikkje gir ei ny pulje. */
  client_ref: string | null;
  /** Sett når mottaket blei registrert utan bilete. Anten denne eller minst eitt bilete. */
  no_photo_reason: string | null;
  created_at: string;
};

export type ProjectReceiptPhotoRow = {
  id: string;
  receipt_id: string;
  /** Sti i den private bøtta: <project_id>/<client_ref>/<filnamn> */
  path: string;
  created_at: string;
};

export type Deviation = "ingen" | "mangler" | "skadet" | "feil_vare" | "for_mye";

export type ProjectReceiptLineRow = {
  id: string;
  receipt_id: string;
  order_line_id: string;
  received_qty: number;
  deviation: Deviation;
  note: string | null;
};

/**
 * Katalogen slik kundar og prosjektbrukarar ser henne.
 *
 * Same som PipeTypeRow, men UTAN cost_price. Det er heile poenget med
 * visninga: innkjøpsprisen låg open for kven som helst på nettet fram til
 * 20260903090200_katalog_utan_innkjopspris.sql.
 */
export type PipeCatalogRow = Omit<PipeTypeRow, "cost_price">;

/** Innstillingane kundeflyten treng. Utan markup_percent. */
export type PipePublicSettingsRow = Omit<PipeSettingsRow, "markup_percent">;

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/** Visningar kan berre lesast, difor ingen Insert eller Update. */
type View<Row> = {
  Row: Row;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      pipe_categories: Table<PipeCategoryRow>;
      pipe_types: Table<PipeTypeRow>;
      pipe_orders: Table<PipeOrderRow>;
      pipe_order_lines: Table<PipeOrderLineRow>;
      pipe_stock_log: Table<PipeStockLogRow>;
      pipe_invoices: Table<PipeInvoiceRow>;
      pipe_settings: Table<PipeSettingsRow>;
      system_users: Table<SystemUserRow>;
      projects: Table<ProjectRow>;
      project_members: Table<ProjectMemberRow>;
      project_orders: Table<ProjectOrderRow>;
      project_order_lines: Table<ProjectOrderLineRow>;
      project_receipts: Table<ProjectReceiptRow>;
      project_receipt_lines: Table<ProjectReceiptLineRow>;
      project_receipt_photos: Table<ProjectReceiptPhotoRow>;
    };
    Views: {
      pipe_catalog: View<PipeCatalogRow>;
      pipe_public_settings: View<PipePublicSettingsRow>;
    };
    Functions: {
      pipe_submit_order: {
        Args: {
          p_customer_name: string;
          p_lines: Json;
          p_customer_phone?: string | null;
          p_customer_email?: string | null;
          p_company?: string | null;
          p_project?: string | null;
          p_comment?: string | null;
          p_signature?: string | null;
        };
        Returns: Json;
      };
      pipe_adjust_stock: {
        Args: { p_pipe_type_id: string; p_change: number; p_reason?: string; p_note?: string | null };
        Returns: number;
      };
      pipe_set_stock: {
        Args: { p_pipe_type_id: string; p_stock: number; p_note?: string | null };
        Returns: number;
      };
      pipe_delete_order: { Args: { p_order_id: string }; Returns: void };
      pipe_apply_markup: {
        Args: {
          p_percent: number;
          p_category_id?: string | null;
          p_pipe_type_ids?: string[] | null;
          p_round_to?: number;
        };
        Returns: number;
      };
      pipe_missing_cost_count: { Args: Record<string, never>; Returns: number };
      pipe_import_costs: {
        Args: { p_rows: Json; p_percent: number; p_round_to?: number };
        Returns: Json;
      };
      pipe_create_invoice: {
        Args: {
          p_customer_name: string;
          p_period_from: string;
          p_period_to: string;
          p_order_ids: string[];
          p_total: number;
          p_note?: string | null;
        };
        Returns: PipeInvoiceRow;
      };
      pipe_delete_invoice: { Args: { p_id: string }; Returns: void };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };

      // Vaktene. hm_har_tilgang er eit alias for hm_er_kontor – sjå
      // 20260903090000_prosjekt_tilgang.sql for kvifor begge finst.
      hm_har_tilgang: { Args: Record<string, never>; Returns: boolean };
      hm_er_kontor: { Args: Record<string, never>; Returns: boolean };
      hm_rolle: { Args: Record<string, never>; Returns: string | null };
      hm_er_prosjektmedlem: { Args: { p_project_id: string }; Returns: boolean };

      project_mark_ordered: {
        Args: {
          p_order_id: string;
          p_supplier?: string | null;
          p_supplier_ref?: string | null;
          p_expected_at?: string | null;
          p_lines?: Json;
          p_office_note?: string | null;
        };
        Returns: ProjectOrderRow;
      };
      project_submit_receipt: {
        Args: {
          p_order_id: string;
          p_received_by_name: string;
          p_lines: Json;
          p_signature?: string | null;
          p_note?: string | null;
          p_client_ref?: string | null;
          p_photos?: string[] | null;
          p_no_photo_reason?: string | null;
        };
        Returns: ProjectReceiptRow;
      };
      project_submit_request: {
        Args: {
          p_project_id: string;
          p_requested_by_name: string;
          p_lines: Json;
          p_needed_by?: string | null;
          p_note?: string | null;
        };
        Returns: ProjectOrderRow;
      };
      project_recompute_status: { Args: { p_order_id: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
