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

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
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
    };
    Views: Record<string, never>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
