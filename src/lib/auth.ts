// Innloggingsvakta, delt mellom adminpanelet og prosjektsidene.
//
// Låg tidlegare berre inne i AdminDashboard. Prosjektsidene treng nøyaktig det
// same – økt, e-post og rolle – og fire kopiar av same useEffect er fire stader
// ei utlogging i ei anna fane kan gli forbi.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
   * NAMNET OG MOTTAKSUTKASTET – IKKJE BEHOVSUTKASTET.
   *
   * Eit sveip over heile «rorlager.prosjekt.*» tok med
   * «rorlager.prosjekt.utkast.<id>» – lista over varer plassen har tasta inn.
   * Ho blir med vilje bevart når ei innsending feilar («feilar innsendinga,
   * skal lista framleis liggje der brukaren la ho»), og då er feila innsending
   * pluss utlogging tolv varelinjer borte. Ho blir difor verande.
   *
   * Mottaksutkastet er ei anna sak: det inneheld signaturen, teikna for hand,
   * som ein data-URL. Det er ei personopplysning, og ho skal ikkje bli
   * liggjande på eit delt nettbrett etter at han som skreiv henne har logga ut.
   */
  const RYDD = ["rorlager.prosjekt.navn.", "rorlager.prosjekt.mottak."];
  try {
    for (const n of Object.keys(localStorage)) {
      if (RYDD.some((p) => n.startsWith(p))) localStorage.removeItem(n);
    }
  } catch {
    /* privat modus – då finst det ingenting å rydde */
  }
  await supabase.auth.signOut();
  queryClient.clear();
}

/** Den innlogga, slik uttakskassen viser han: «Registreres på deg: Leif Lager». */
export type Meg = { epost: string; navn: string | null };

/**
 * Kven er logga inn – namn frå system_users, som berre ein superadmin kan lese
 * sjølv. Null utan innlogging, og før 20260928100000 er køyrd: då finst ikkje
 * hm_meg, og kassen viser berre e-posten frå innlogginga.
 */
export async function fetchMeg(): Promise<Meg | null> {
  const { data, error } = await supabase.rpc("hm_meg");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const { epost, navn } = data as { epost?: unknown; navn?: unknown };
  return typeof epost === "string" ? { epost, navn: typeof navn === "string" ? navn : null } : null;
}

export function useMeg(email: string | null) {
  return useQuery({ queryKey: ["hm_meg", email], queryFn: fetchMeg, enabled: Boolean(email), staleTime: Infinity });
}

/** Sida ein ny brukar blir halden på til han har valt sitt eige passord. */
export const NYTT_PASSORD = "/nytt-passord";

/**
 * Må den innlogga velje sitt eige passord før han kjem vidare?
 *
 * Eit feila kall blir false. Før 20261013100000 er køyrd finst ikkje
 * funksjonen, og då skal ingen bli stengde ute av eit krav basen ikkje kjenner.
 */
export async function fetchMåByttePassord(): Promise<boolean> {
  const { data, error } = await supabase.rpc("hm_ma_bytte_passord");
  return !error && data === true;
}

export const måByttePassordKey = (email: string | null) => ["hm_ma_bytte_passord", email] as const;

/**
 * Sender brukaren dit han faktisk høyrer heime.
 *
 * Begge stadene gjekk til /admin uansett rolle. Ein prosjektbrukar hamna då i
 * adminpanelet, såg ein spinnar, og blei kasta vidare av AdminDashboard. Det
 * virka – men berre så lenge rollekallet lukkast. Feila det, sat han fast på
 * ein spinnar i eit panel han ikkje har tilgang til.
 *
 * Ein som har fått eit mellombels passord, høyrer heime på NYTT_PASSORD først.
 */
export async function heimeside({ sjekkPassord = true } = {}): Promise<string> {
  /*
   * .rpc() KASTAR ALDRI.
   *
   * Han resolverer med { data: null, error }, så ein try/catch her hadde vore
   * daud kode – og kvar einaste feil ville gitt data === null, altså «/admin»,
   * som er nøyaktig det ein prosjektbrukar ikkje skal.
   *
   * Og han har inga tidsavgrensing. Utan Promise.race ville ein tenar som ikkje
   * svarar late brukaren stå på ein spinnar utan veg vidare.
   */
  if (sjekkPassord) {
    const måBytte = await Promise.race([
      fetchMåByttePassord(),
      new Promise<false>((r) => setTimeout(() => r(false), 8000)),
    ]);
    if (måBytte) return NYTT_PASSORD;
  }

  const svar = await Promise.race([
    supabase.rpc("hm_rolle"),
    new Promise<{ data: null; error: true }>((r) => setTimeout(() => r({ data: null, error: true }), 8000)),
  ]);

  if (svar.error || svar.data == null) {
    // Vi VEIT ikkje kven han er. Prosjektsida er den trygge gissinga: kjem ein
    // kontorbrukar dit, ser han prosjekta sine og kan gå vidare sjølv. Kjem ein
    // prosjektbrukar til /admin, møter han eit panel han ikkje har tilgang til.
    return "/prosjekt";
  }
  return heimFor(svar.data);
}

/**
 * Rollene som ser adminpanelet. Same kvitliste som hm_er_kontor() i basen.
 *
 * Her stod det `role !== "prosjekt"`, altså «alt som ikkje er prosjekt er
 * kontor». Basen gjekk over til kvitliste 3. september; appen gjorde ikkje, og
 * med rolla «ansatt» ville ein tilsett blitt sleppt inn i eit panel der kvar
 * spørjing svarar med null rader. Ingen lekkasje – basen nektar – men eit tomt
 * panel er ei dårleg forklaring.
 */
export const KONTORROLLER = ["super_admin", "admin", "kontor", "lager"] as const;

export const erKontorRolle = (role: string | null | undefined): boolean =>
  !!role && (KONTORROLLER as readonly string[]).includes(role);

/**
 * Kvar ei rolle høyrer heime.
 *
 * Ein vanleg tilsett («ansatt») tek ut frå lageret som ein kunde, så han høyrer
 * heime på framsida. Ei rolle ingen har tenkt på, hamnar same stad: framsida
 * viser ingenting som ikkje alle andre òg ser.
 */
export function heimFor(role: string): string {
  if (erKontorRolle(role)) return "/admin";
  if (role === "prosjekt") return "/prosjekt";
  return "/";
}

/**
 * Held ein brukar med mellombels passord på NYTT_PASSORD.
 *
 * Ligg i useAuth og ikkje berre i innlogginga: ein som har ei gamal økt, eller
 * skriv /admin rett i adresselinja, skal ikkje kunne gå rundt kravet.
 */
export function useKravOmNyttPassord(email: string | null) {
  const navigate = useNavigate();
  const { data: måBytte } = useQuery({
    queryKey: måByttePassordKey(email),
    queryFn: fetchMåByttePassord,
    enabled: !!email,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (måBytte) navigate(NYTT_PASSORD, { replace: true });
  }, [måBytte, navigate]);
}

export type Auth = {
  /** Sant til første sesjonssjekk er ferdig. Hindrar at sida blinkar fram. */
  checking: boolean;
  email: string | null;
  /** 'super_admin' | 'admin' | 'kontor' | 'lager' | 'prosjekt' | 'ansatt', eller null utan tilgang. */
  role: string | null;
  /** undefined betyr «ikkje svart enno» – ikkje det same som eit nei. */
  roleKnown: boolean;
  /** Oppslaget gav opp. Skil «ventar» frå «kom aldri». */
  roleFailed: boolean;
  prøvRolleIgjen: () => void;
  isProsjekt: boolean;
  isKontor: boolean;
  /** Vanleg tilsett: tek ut på seg sjølv, ser ikkje adminpanelet. */
  isAnsatt: boolean;
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

  useKravOmNyttPassord(checking ? null : email);

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
    isKontor: isSuccess && erKontorRolle(role),
    isAnsatt: role === "ansatt",
  };
}
