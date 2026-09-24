// Innstillingane er éi rad (id = 1) som styrer firmainfo og kva kundeskjemaet
// krev. Dei blir lesne på nesten kvar side, difor eigen fil med eigen cache.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/orders";
import type { PipePublicOrderSettingsRow, PipePublicSettingsRow, PipeSettingsRow } from "@/lib/types";

/** Same verdiar som kolonnedefaultane i databasen, slik at appen ser lik ut
 *  anten rada er lesen eller ikkje. */
export const DEFAULT_SETTINGS: PipeSettingsRow = {
  id: 1,
  company_name: "Hauge Maskin AS",
  org_number: null,
  address: null,
  phone: null,
  email: null,
  intro_text: null,
  pickup_note: null,
  show_prices: true,
  require_phone: true,
  require_signature: false,
  vat_rate: 25,
  markup_percent: 25,
  accept_orders: false,
  order_email: null,
  payment_terms_days: 14,
  updated_at: new Date(0).toISOString(),
};

// Plukkar påslaget ut av standardane framfor å skrive lista opp att – då kan
// dei to ikkje kome i utakt når eit felt blir lagt til.
const {
  markup_percent: _påslag,
  accept_orders: _open,
  order_email: _varsel,
  payment_terms_days: _frist,
  ...OFFENTLEGE_STANDARDAR
} = DEFAULT_SETTINGS;

/** Standardane kundeflyten treng. Påslaget er ikkje mellom dei. */
export const DEFAULT_PUBLIC_SETTINGS: PipePublicSettingsRow = OFFENTLEGE_STANDARDAR;

/**
 * Kastar aldri. Ein kunde som står i lageret skal få sende inn uttaket sitt
 * sjølv om innstillingsrada manglar eller nettet slit – då gjeld standardane.
 *
 * Les VISNINGA, ikkje tabellen. pipe_settings er stengd for anon sidan
 * 20260903090200_katalog_utan_innkjopspris.sql, fordi markup_percent låg der og
 * kven som helst kunne rekne ut dekningsbidraget. Visninga har alt kundeflyten
 * treng og ingenting meir.
 */
export async function fetchSettings(): Promise<PipePublicSettingsRow> {
  try {
    const { data, error } = await supabase.from("pipe_public_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return DEFAULT_PUBLIC_SETTINGS;
    // Slår saman med standardane så eit felt som er null i basen ikkje blir undefined her
    return { ...DEFAULT_PUBLIC_SETTINGS, ...(data as PipePublicSettingsRow) };
  } catch {
    return DEFAULT_PUBLIC_SETTINGS;
  }
}

/**
 * Heile rada, påslaget inkludert. Berre for kontoret – ein prosjektbrukar får
 * null rader her, og ein anonym får ikkje spørje i det heile.
 *
 * Denne kastar heller ikkje: innstillingsfana skal kunne teiknast og vise ein
 * feil, framfor å bli ein kvit skjerm.
 */
export async function fetchOfficeSettings(): Promise<PipeSettingsRow> {
  try {
    const { data, error } = await supabase.from("pipe_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(data as PipeSettingsRow) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<PipeSettingsRow>): Promise<void> {
  const { error } = await supabase
    .from("pipe_settings")
    .upsert({ ...patch, id: 1 } as PipeSettingsRow, { onConflict: "id" });
  if (!error) return;
  // Reglane i basen har engelske meldingar. Kontoret skal få vite kva som manglar.
  if (/pipe_settings_accept_orders_check/.test(error.message)) {
    throw new Error("Fyll ut firmanavn, organisasjonsnummer, adresse og e-post før bestilling på nett slås på.");
  }
  if (/pipe_settings_payment_terms_check/.test(error.message)) {
    throw new Error("Betalingsfristen må være mellom 0 og 90 dager.");
  }
  if (/accept_orders|order_email|payment_terms_days/.test(error.message)) {
    throw new Error("Databasen mangler oppdateringen for bestilling. Kjør supabase-setup.sql på nytt.");
  }
  throw new Error(`Klarte ikke å lagre innstillingene: ${error.message}`);
}

/**
 * placeholderData og ikkje initialData: komponentane får noko å teikne med det
 * same, men spørjinga blir like fullt køyrd så ekte verdiar kjem inn etterpå.
 */
export function useSettings(): UseQueryResult<PipePublicSettingsRow> {
  return useQuery({
    queryKey: QK.settings,
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_PUBLIC_SETTINGS,
  });
}

/**
 * Som useSettings, men med påslaget. Eigen nøkkel, elles ville dei to
 * spørjingane delt cache og den eine overskrive den andre – og då ville
 * innstillingsfana vist påslaget som borte annakvar gong.
 */
export function useOfficeSettings(): UseQueryResult<PipeSettingsRow> {
  return useQuery({
    queryKey: QK.officeSettings,
    queryFn: fetchOfficeSettings,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_SETTINGS,
  });
}

/** Butikken er stengd til nokon har slått henne på. */
export const DEFAULT_ORDER_SETTINGS: PipePublicOrderSettingsRow = {
  id: 1,
  accept_orders: false,
  payment_terms_days: 14,
};

/**
 * Kastar aldri. Manglar visninga – migrasjonen er ikkje køyrd enno – er svaret
 * «stengd». Då viser /bestill «ring oss» i staden for eit skjema som ville
 * feila ved innsending.
 */
export async function fetchOrderSettings(): Promise<PipePublicOrderSettingsRow> {
  try {
    const { data, error } = await supabase.from("pipe_public_order_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return DEFAULT_ORDER_SETTINGS;
    return { ...DEFAULT_ORDER_SETTINGS, ...(data as PipePublicOrderSettingsRow) };
  } catch {
    return DEFAULT_ORDER_SETTINGS;
  }
}

export function useOrderSettings(): UseQueryResult<PipePublicOrderSettingsRow> {
  return useQuery({
    queryKey: QK.orderSettings,
    queryFn: fetchOrderSettings,
    staleTime: 60 * 1000,
    placeholderData: DEFAULT_ORDER_SETTINGS,
  });
}
