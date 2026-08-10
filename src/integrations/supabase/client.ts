import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Sant først når begge verdiane i .env peikar på eit ekte prosjekt. */
export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL),
);

// Utan gyldig URL kastar createClient med ei kryptisk melding, og appen blir ein
// kvit skjerm. Vi gir han ei uskadeleg adresse i staden, slik at appen startar og
// kan vise ei norsk melding om kva som manglar. Kalla feilar framleis – men no
// på ein måte brukaren kan gjere noko med.
const FALLBACK_URL = "https://uoppsett.supabase.co";
const FALLBACK_KEY = "uoppsett";

// Importer klienten slik:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(
  isSupabaseConfigured ? SUPABASE_URL : FALLBACK_URL,
  isSupabaseConfigured ? SUPABASE_PUBLISHABLE_KEY : FALLBACK_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
