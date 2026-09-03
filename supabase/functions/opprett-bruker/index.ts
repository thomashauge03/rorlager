// Oppretter en bruker med et midlertidig passord, og setter ham på prosjekter.
//
// HVORFOR DETTE MÅ LIGGE PÅ SERVEREN
//
// Å opprette en innlogging, eller å sette passordet til noen andre, krever
// service_role-nøkkelen. Den omgår ALL RLS — har noen den, har de alt. Den kan
// derfor aldri ligge i nettleseren, uansett hvor godt den er gjemt: alt som
// sendes til klienten kan leses av den som får det.
//
// Her ligger den som en hemmelighet i Supabase, og forlater aldri serveren.
// Funksjonen sjekker først at den som ringer faktisk er superadmin, med
// KALLERENS egen økt — ikke med service_role. Så gjør den jobben.
//
// Passordet blir vist én gang, i svaret. Det blir ikke lagret noe sted, og kan
// ikke hentes fram igjen. Mister du det, lager du et nytt.

// npm: og ikke esm.sh. Dette er den ene prosessen som holder
// service_role-nøkkelen, og en tredjeparts-CDN uten integritetssikring er en
// vei inn til den. Deno henter npm-pakken direkte fra registeret.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const svar = (kropp: unknown, status = 200) =>
  new Response(JSON.stringify(kropp), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * Et passord som kan leses opp over telefon.
 *
 * Uten I, O, 0 og 1: de blir hørt og skrevet feil, og et passord ingen klarer å
 * taske inn er verdiløst uansett hvor sterkt det er. 15 tegn fra 32 mulige gir
 * rundt 75 bits, som er rikelig for noe som skal byttes ved første innlogging.
 */
function lagPassord(): string {
  /*
   * ALFABETET MÅ VÆRE EN TOERPOTENS.
   *
   * `b % tegn.length` er bare uniform når 256 går opp i lengden. Med 32 tegn
   * treffes hvert tegn av nøyaktig 8 av de 256 byteverdiene — ingen skjevhet,
   * og nøyaktig 15 × log2(32) = 75 bits entropi.
   *
   * Legger noen til ett tegn her, blir 33 igjen, og fordelingen blir skjev med
   * 14 % uten at noe klager. Skal alfabetet endres, må det bli 16 eller 64.
   */
  const tegn = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  const ut = Array.from(bytes, (b) => tegn[b % tegn.length]);
  return `${ut.slice(0, 5).join("")}-${ut.slice(5, 10).join("")}-${ut.slice(10).join("")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return svar({ error: "Bare POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── 1. Hvem ringer? ──
  //
  // Med kallerens eget token, ikke service_role. Da er det databasens egne
  // regler som avgjør, og svaret kan ikke bli mer sjenerøst enn de er.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return svar({ error: "Mangler innlogging" }, 401);

  const somKaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });

  const { data: erSuper, error: sjekkFeil } = await somKaller.rpc("is_super_admin");
  // 401 og ikke 500: et forfalsket, utløpt eller feil token er ikke en
  // serverfeil, og et 500 her gjør feilsøking unødig vanskelig.
  if (sjekkFeil) return svar({ error: "Innloggingen er ikke gyldig. Logg inn på nytt." }, 401);
  if (!erSuper) return svar({ error: "Bare superadmin kan opprette brukere" }, 403);

  // Hvem som gjorde det skal stå i radene. Funksjonen vet det — den
  // autentiserte ham nettopp — men service_role gjør auth.uid() til NULL, så
  // defaulten på created_by ville gitt et tomt spor for prosjektets farligste
  // operasjon.
  const { data: kallerData } = await somKaller.auth.getUser();
  const kallerId = kallerData?.user?.id ?? null;
  const kallerEpost = kallerData?.user?.email ?? "ukjent";

  // ── 2. Hva ble bedt om? ──
  let kropp: {
    email?: string;
    full_name?: string;
    role?: string;
    note?: string;
    project_ids?: string[];
    /** Sant når bare passordet skal byttes. Da røres verken register eller prosjekter. */
    bare_passord?: boolean;
  };
  try {
    kropp = await req.json();
  } catch {
    return svar({ error: "Ugyldig forespørsel" }, 400);
  }

  const epost = (kropp.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) return svar({ error: "Ugyldig e-postadresse" }, 400);
  if (epost.length > 254) return svar({ error: "E-postadressen er urimelig lang" }, 400);

  /*
   * MERK at det NORMALISERTE navnet er det som lagres lenger nede, ikke
   * rådataene.
   *
   * Det er ikke tilfeldig. JS `.trim()` fjerner tab og NBSP, mens Postgres
   * `btrim()` bare fjerner ASCII-mellomrom — så «prosjekt\t» ville passert
   * denne hvitelisten og deretter blitt regnet som KONTOR av
   * hm_er_kontor(), som spør `btrim(lower(role)) <> 'prosjekt'`. Fordi vi
   * skriver `rolle` og ikke `kropp.role`, kan den asymmetrien ikke nås.
   */
  const rolle = (kropp.role ?? "admin").trim().toLowerCase();
  if (!["admin", "kontor", "lager", "prosjekt"].includes(rolle)) {
    return svar({ error: "Ukjent rolle" }, 400);
  }

  const navn = (kropp.full_name ?? "").trim().slice(0, 200) || null;
  const notat = (kropp.note ?? "").trim().slice(0, 500) || null;

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const passord = lagPassord();

  // ── 3. Innloggingen ──
  //
  // email_confirm: personen skal kunne logge inn med det samme, uten å vente på
  // en e-post som kanskje havner i spam. Det er superadmin som har bekreftet at
  // adressen stemmer, ved å skrive den inn.
  const { error: nyFeil } = await admin.auth.admin.createUser({
    email: epost,
    password: passord,
    email_confirm: true,
  });

  let fantesFra = false;

  if (nyFeil) {
    const kode = (nyFeil as { code?: string }).code ?? "";
    const alt = kode === "email_exists" || /already|registered|exists/i.test(nyFeil.message);
    if (!alt) {
      console.error("createUser feilet", { epost, av: kallerEpost, feil: nyFeil.message });
      return svar({ error: "Klarte ikke å opprette innloggingen" }, 400);
    }

    /*
     * KONTOEN FINNES FRA FØR.
     *
     * Å sette et nytt passord her ville vært en stille overtakelse: den
     * rammedes gamle passord slutter å virke, han får ingen beskjed, og den som
     * skrev inn adressen får en innlogging til en konto han kanskje ikke mente
     * å røre. En tastefeil holder. Deler prosjektet auth.users med en annen app,
     * gjelder det også kontoer som ikke hører rørlageret til.
     *
     * Derfor 409, og ikke noe mer. Vil superadmin faktisk bytte passordet, gjør
     * han det fra nøkkelikonet i brukerlista — der står bekreftelsen som sier
     * hva som skjer.
     */
    if (!kropp.bare_passord) {
      return svar(
        {
          error:
            "Det finnes allerede en innlogging på denne adressen. Vil du gi personen et nytt passord, bruk nøkkelikonet i brukerlisten.",
          exists: true,
        },
        409,
      );
    }

    // Finner kontoen. GoTrue filtrerer på e-post, så vi slipper å bla gjennom
    // alle brukerne — og slipper å bomme på dem som ligger forbi første side.
    const { data: liste, error: søkFeil } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
      // @ts-expect-error GoTrue tar imot filteret, men typen har det ikke ennå
      filter: `email.eq.${epost}`,
    });
    if (søkFeil) {
      console.error("listUsers feilet", { epost, av: kallerEpost, feil: søkFeil.message });
      return svar({ error: "Klarte ikke å finne den eksisterende kontoen" }, 500);
    }

    const funnet = liste.users.find((u) => (u.email ?? "").toLowerCase() === epost);
    if (!funnet) return svar({ error: "Kontoen finnes, men ble ikke funnet. Prøv fra Supabase-dashbordet." }, 500);

    const { error: byttFeil } = await admin.auth.admin.updateUserById(funnet.id, {
      password: passord,
      email_confirm: true,
    });
    if (byttFeil) {
      console.error("updateUserById feilet", { epost, av: kallerEpost, feil: byttFeil.message });
      return svar({ error: "Klarte ikke å sette nytt passord" }, 400);
    }
    fantesFra = true;
  }

  console.log(fantesFra ? "nytt passord satt" : "bruker opprettet", { epost, rolle, av: kallerEpost });

  // ── 4. Tilgangen ──
  //
  // Innlogging er ikke det samme som tilgang: raden i system_users er det som
  // slipper personen inn, og rollen avgjør hvor mye.
  /*
   * bare_passord rører ikke registerraden.
   *
   * Uten dette skrev en ren passordbytte også navn, rolle og notat — med de
   * verdiene klienten tilfeldigvis hadde i lista si. Hadde en annen superadmin
   * nettopp satt personen fra 'lager' til 'prosjekt', rullet et trykk på
   * nøkkelikonet den tilgangsendringen tilbake. En passordknapp skal ikke kunne
   * endre hvem som ser hva.
   */
  if (!kropp.bare_passord) {
    const { error: regFeil } = await admin
      .from("system_users")
      .upsert(
        {
          email: epost,
          full_name: navn,
          role: rolle,
          note: notat,
          created_by: kallerId,
        },
        { onConflict: "email" },
      );
    if (regFeil) {
      console.error("system_users-upsert feilet", { epost, av: kallerEpost, feil: regFeil.message });
      return svar({ error: "Innloggingen ble laget, men registeret feilet. Prøv igjen." }, 500);
    }
  }

  // ── 5. Prosjektene ──
  const prosjekt = (kropp.bare_passord || !Array.isArray(kropp.project_ids) ? [] : kropp.project_ids.filter(Boolean))
    // Tak: superadmin kan ikke sette i gang en ubegrenset masseinnsetting
    .slice(0, 500);
  if (prosjekt.length > 0) {
    /*
     * Leser først, skriver så bare det som mangler.
     *
     * Ikke upsert: den unike indeksen er på (project_id, lower(email)), altså
     * et UTTRYKK, og PostgREST kan ikke peke på en slik indeks i onConflict.
     * Å be den om (project_id, email) ville truffet ingenting og gitt en feil
     * som ser ut som noe helt annet.
     */
    const { data: alt, error: lesFeil } = await admin
      .from("project_members")
      .select("project_id")
      .eq("email", epost);

    if (lesFeil) {
      console.error("project_members-lesing feilet", { epost, av: kallerEpost, feil: lesFeil.message });
      return svar({
        password: passord,
        existed: fantesFra,
        warning: "Brukeren er opprettet, men prosjekttilgangen ble ikke satt. Sett den under Rediger.",
      });
    }

    const har = new Set((alt ?? []).map((r) => r.project_id));
    const nye = prosjekt.filter((id) => !har.has(id));

    if (nye.length > 0) {
      const { error: medFeil } = await admin
        .from("project_members")
        .insert(nye.map((id) => ({ project_id: id, email: epost, created_by: kallerId })));

      // Prosjekttilgang kan settes i ettertid fra brukersiden, så dette skal
      // ikke velte hele operasjonen — men det skal sies fra om.
      if (medFeil) {
        console.error("project_members-skriving feilet", { epost, av: kallerEpost, feil: medFeil.message });
        return svar({
          password: passord,
          existed: fantesFra,
          warning: "Brukeren er opprettet, men prosjekttilgangen ble ikke satt. Sett den under Rediger.",
        });
      }
    }
  }

  return svar({ password: passord, existed: fantesFra });
});
