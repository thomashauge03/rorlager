// Innstillingane er éi rad (id = 1) som styrer firmainfo og kva kundeskjemaet
// krev. Dei blir lesne på nesten kvar side, difor eigen fil med eigen cache.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/orders";
import type { PipeSettingsRow } from "@/lib/types";

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
  updated_at: new Date(0).toISOString(),
};

/**
 * Kastar aldri. Ein kunde som står i lageret skal få sende inn uttaket sitt
 * sjølv om innstillingsrada manglar eller nettet slit – då gjeld standardane.
 */
export async function fetchSettings(): Promise<PipeSettingsRow> {
  try {
    const { data, error } = await supabase.from("pipe_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    // Slår saman med standardane så eit felt som er null i basen ikkje blir undefined her
    return { ...DEFAULT_SETTINGS, ...(data as PipeSettingsRow) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<PipeSettingsRow>): Promise<void> {
  const { error } = await supabase
    .from("pipe_settings")
    .upsert({ ...patch, id: 1 } as PipeSettingsRow, { onConflict: "id" });
  if (error) throw new Error(`Klarte ikke å lagre innstillingene: ${error.message}`);
}

/**
 * placeholderData og ikkje initialData: komponentane får noko å teikne med det
 * same, men spørjinga blir like fullt køyrd så ekte verdiar kjem inn etterpå.
 */
export function useSettings(): UseQueryResult<PipeSettingsRow> {
  return useQuery({
    queryKey: QK.settings,
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_SETTINGS,
  });
}
