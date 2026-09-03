// Oppretting av brukarar med mellombels passord.
//
// Sjølve jobben skjer i serverfunksjonen supabase/functions/opprett-bruker,
// fordi ho krev service_role-nøkkelen. Den nøkkelen omgår all RLS og kan aldri
// ligge i nettlesaren – alt som blir sendt til klienten kan lesast av den som
// får det. Her ligg berre kallet.

import { supabase } from "@/integrations/supabase/client";

export type NyBruker = {
  email: string;
  full_name: string | null;
  role: string;
  note: string | null;
  projectIds: string[];
  /**
   * Sant når berre passordet skal bytast.
   *
   * Då rører funksjonen verken system_users eller project_members. Utan flagget
   * ville eit passordbyte skrive namn, rolle og notat med dei verdiane klienten
   * tilfeldigvis hadde – og dermed kunne rulle tilbake ei rolleendring nokon
   * annan nettopp gjorde.
   */
  barePassord?: boolean;
};

export type OpprettSvar = {
  /** Vist éin gong. Blir ikkje lagra nokon stad og kan ikkje hentast fram att. */
  password: string;
  /** Sant når innlogginga fanst frå før og passordet blei sett på nytt. */
  existed: boolean;
  /** Brukaren blei laga, men noko etterpå gjekk ikkje. */
  warning?: string;
};

/**
 * Lagar innlogging, register-rad og prosjekttilgang i eitt.
 *
 * invoke sender økta til den innlogga med automatisk, og funksjonen sjekker
 * sjølv at det er ein superadmin som ringer – med kallarens eige token, ikkje
 * med service_role. Ein sjekk gjord på tenaren er den einaste som tel.
 */
export async function opprettBruker(input: NyBruker): Promise<OpprettSvar> {
  const { data, error } = await supabase.functions.invoke<OpprettSvar>("opprett-bruker", {
    body: {
      email: input.email,
      full_name: input.full_name,
      role: input.role,
      note: input.note,
      project_ids: input.projectIds,
      bare_passord: input.barePassord === true,
    },
  });

  if (error) {
    /*
     * Feilmeldinga frå funksjonen ligg i kroppen, ikkje i error.message.
     *
     * supabase-js gir berre «Edge Function returned a non-2xx status code» på
     * alt som ikkje er 2xx, og det fortel brukaren ingenting om kva som var
     * gale. Den ekte teksten må hentast ut av svaret.
     */
    let detalj = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const kropp = await ctx.json();
        detalj = typeof kropp?.error === "string" ? kropp.error : "";
      } catch {
        /* då står vi att med den generiske teksten */
      }
    }
    if (/Failed to (send|fetch)|NetworkError/i.test(error.message)) {
      throw new Error(
        "Nådde ikke serverfunksjonen. Er «opprett-bruker» rullet ut i Supabase? Se README.",
      );
    }
    throw new Error(detalj || error.message || "Klarte ikke å opprette brukeren");
  }

  if (!data?.password) throw new Error("Serverfunksjonen svarte uten passord");
  return data;
}
