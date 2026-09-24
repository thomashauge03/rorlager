// Vilkårsteksten bur i supabase/functions/_shared, fordi e-postfunksjonen òg
// treng henne. Appen hentar henne her, så ingen komponent treng å kjenne stien.

import type { Selger } from "../../supabase/functions/_shared/angrerett";

export * from "../../supabase/functions/_shared/angrerett";

type FirmaFelt = {
  company_name?: string | null;
  org_number?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  pickup_note?: string | null;
};

/** Seljaren slik innstillingane beskriv han. Tomt blir standardane. */
export function selgerFra(s?: FirmaFelt | null, o?: { payment_terms_days?: number | null } | null): Selger {
  return {
    navn: s?.company_name?.trim() || "Hauge Maskin AS",
    orgnr: s?.org_number ?? null,
    adresse: s?.address ?? null,
    epost: s?.email ?? null,
    telefon: s?.phone ?? null,
    betalingsfrist: o?.payment_terms_days ?? 14,
    henteinfo: s?.pickup_note ?? null,
  };
}
