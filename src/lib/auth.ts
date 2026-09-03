// Innloggingsvakta, delt mellom adminpanelet og prosjektsidene.
//
// Låg tidlegare berre inne i AdminDashboard. Prosjektsidene treng nøyaktig det
// same – økt, e-post og rolle – og fire kopiar av same useEffect er fire stader
// ei utlogging i ei anna fane kan gli forbi.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchRole } from "@/lib/projects";

/**
 * Loggar ut, og tømmer alt som høyrer den forrige brukaren til.
 *
 * TO TING SOM BEIT:
 *
 * Rolla ligg i cachen med staleTime: Infinity. Utan queryClient.clear() ville
 * ein prosjektbrukar som logga inn i same fane arva «super_admin» frå den
 * førre – og bli ståande i adminpanelet han aldri skulle sett. RLS gir han
 * tomme tabellar, så det lek ingenting, men han kjem seg ikkje vidare.
 *
 * Namnet i mottakskontrollen låg under ein GLOBAL nøkkel. På eit delt nettbrett
 * på plassen stod feltet ferdig utfylt med førre manns namn, og det er feltet
 * som seier kven som tok imot leveransen – på eit dokument som blir signert og
 * sendt leverandøren ved reklamasjon. Nøklane er no per e-post, men vi ryddar
 * likevel her.
 */
export async function loggUt(queryClient: QueryClient): Promise<void> {
  /*
   * BERRE NAMNET, ikkje utkastet.
   *
   * Eit sveip over «rorlager.prosjekt.*» tok med
   * «rorlager.prosjekt.utkast.<id>» – lista over varer plassen har tasta inn.
   * Ho blir med vilje bevart når ei innsending feilar («feilar innsendinga,
   * skal lista framleis liggje der brukaren la ho»), og då er feila innsending
   * pluss utlogging tolv varelinjer borte.
   *
   * Namnenøklane er alt per e-post, så dette er belte og bukseseler – men det
   * er òg det einaste som SKAL vekk her.
   */
  try {
    for (const n of Object.keys(localStorage)) {
      if (n.startsWith("rorlager.prosjekt.navn.")) localStorage.removeItem(n);
    }
  } catch {
    /* privat modus – då finst det ingenting å rydde */
  }
  await supabase.auth.signOut();
  queryClient.clear();
}

export type Auth = {
  /** Sant til første sesjonssjekk er ferdig. Hindrar at sida blinkar fram. */
  checking: boolean;
  email: string | null;
  /** 'super_admin' | 'admin' | 'prosjekt' | … eller null utan tilgang. */
  role: string | null;
  /** undefined betyr «ikkje svart enno» – ikkje det same som eit nei. */
  roleKnown: boolean;
  /** Oppslaget gav opp. Skil «ventar» frå «kom aldri». */
  roleFailed: boolean;
  prøvRolleIgjen: () => void;
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
  const { data: role, isSuccess, isError, refetch } = useQuery({
    // Nøkla på e-post: loggar nokon andre inn i same fane, skal ikkje rolla
    // hans arvast frå den førre.
    queryKey: ["hm_rolle", email],
    queryFn: fetchRole,
    enabled: !checking && !!email,
    staleTime: Infinity,
  });

  return {
    checking,
    email,
    role: role ?? null,
    roleKnown: isSuccess,
    /** Sann når oppslaget gav opp. Utan denne blir sida ståande på ein spinnar for alltid. */
    roleFailed: isError,
    prøvRolleIgjen: () => void refetch(),
    isProsjekt: role === "prosjekt",
    isKontor: isSuccess && role !== null && role !== "prosjekt",
  };
}
