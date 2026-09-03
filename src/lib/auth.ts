// Innloggingsvakta, delt mellom adminpanelet og prosjektsidene.
//
// Låg tidlegare berre inne i AdminDashboard. Prosjektsidene treng nøyaktig det
// same – økt, e-post og rolle – og fire kopiar av same useEffect er fire stader
// ei utlogging i ei anna fane kan gli forbi.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchRole } from "@/lib/projects";

export type Auth = {
  /** Sant til første sesjonssjekk er ferdig. Hindrar at sida blinkar fram. */
  checking: boolean;
  email: string | null;
  /** 'super_admin' | 'admin' | 'prosjekt' | … eller null utan tilgang. */
  role: string | null;
  /** undefined betyr «ikkje svart enno» – ikkje det same som eit nei. */
  roleKnown: boolean;
  isProsjekt: boolean;
  isKontor: boolean;
};

/**
 * Passar på økta og slår opp rolla.
 *
 * onAuthStateChange blir sett opp FØR getSession, slik at ei utlogging i ei
 * anna fane ikkje kan gli forbi medan den første sjekken går.
 */
export function useAuth(onSignedOut?: () => void): Auth {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const handle = (session: Session | null) => {
      if (!alive) return;
      setEmail(session?.user?.email ?? null);
      if (!session) onSignedOut?.();
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => handle(session));

    supabase.auth.getSession().then(({ data }) => {
      handle(data.session);
      if (alive) setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // onSignedOut er ein navigate-wrapper som byter identitet kvar render;
    // å ha han i lista ville rive ned og setje opp lyttaren i eit kjør.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Rolla endrar seg ikkje i ei økt, difor eitt kall som blir liggjande.
   *
   * Eit feila kall er ikkje det same som eit nei. Svelgjer vi feilen, blir
   * «ingen rolle» liggjande i cachen resten av økta. Databasen håndhevar
   * tilgangen uansett, så vi vinn ingenting på å nekte i tvil.
   */
  const { data: role, isSuccess } = useQuery({
    queryKey: ["hm_rolle"],
    queryFn: fetchRole,
    enabled: !checking && !!email,
    staleTime: Infinity,
  });

  return {
    checking,
    email,
    role: role ?? null,
    roleKnown: isSuccess,
    isProsjekt: role === "prosjekt",
    isKontor: isSuccess && role !== null && role !== "prosjekt",
  };
}
