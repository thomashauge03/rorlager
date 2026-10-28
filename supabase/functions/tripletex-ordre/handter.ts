/**
 * Alt som avgjer noko i tripletex-ordre. Utan Deno, så det kan prøvast i
 * src/test/tripletex-handter.test.ts med falsk base og falsk Tripletex.
 *
 * LÅSINGA LIGG I BASEN, ikkje her (20261028100000_tripletex.sql). pipe_tripletex_ta
 * tek rada i éi transaksjon og seier frå med eit ord når ho ikkje kan takast.
 * Denne fila gjer berre tre ting: finn kunden og produktet i Tripletex, opprettar
 * ordren, og skriv utfallet tilbake med pipe_tripletex_utfall. Kvar veg ut etter at
 * rada er teken, skriv eit utfall – elles står ho som under_sending, og etter fem
 * minutt blir ho «ukjent»: trygt, men eit menneske må sjå i Tripletex.
 *
 * FØRESPURNAD (POST, med kallaren si innlogging, berre kontoret):
 *   { invoice_id, pdf: <base64>, filnavn,
 *     kunde_nokkel?,      fakturakunde().key, for å finne ei kopling kontoret har gjort
 *     kundenr?,           kundenummeret kontoret skreiv inn. Blir hugsa når det finst i Tripletex
 *     intern?: true,      admin har sagt at dette er internt: ordren går på felleskontoen
 *     overlappBekreftet?: true }
 *   { handling: "vedlegg", invoice_id, pdf, filnavn, overta?: true }
 *
 * SVAR, 200 om ikkje anna er sagt. Ein maskin les orda, aldri meldinga:
 *   { sendt: true, ordreId, vedlegg: { status, melding? } }
 *   { sendt: true, ordreId, lagret: false, melding }   ordren finst, men køen fekk ikkje vite det
 *   { sendt: false, grunn: "ikke satt opp" | "av" | "ikke i koen" | "alt sendt" | "opptatt" | "ukjent" | "overlapp", ... }
 *   { sendt: false, grunn: "mangler_kunde", melding }  fann ingen eintydig kunde. Ingenting er oppretta
 *   { sendt: false, grunn: "feil", koStatus, melding, tripletexTekst? }
 *       koStatus: "venter" (går over), "feilet" (avvist), "ukjent_utfall" (ordren KAN finnast)
 *   400/401/403/405/500/502 med { feil }
 */

import { finnKunde, finnProdukt, leggVedOrdre, opprettOrdre, sesjonstoken, TripletexFeil } from "./api.ts";

export type TokenBuffer = { nokkel: string | null; token: string | null };

type Json = Record<string, unknown>;

export type Avhengigheiter = {
  hent: typeof fetch;
  token: TokenBuffer;
  vent?: (ms: number) => Promise<void>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const svar = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Linja på ordren. Beløpet står i PDF-en som ligg ved */
export const LINJETEKST = "Pris ihht vedlegg";

/** Over dette legg kontoret PDF-en ved for hand. Supabase oppgir inga grense for kroppen */
export const VEDLEGG_MAKS_BYTE = 8 * 1024 * 1024;

const FOR_STOR = "PDF-en er større enn 8 MB, og appen legger den ikke ved. Ingenting er lagt ved: legg den ved for hånd i Tripletex.";

const erObjekt = (x: unknown): x is Json => !!x && typeof x === "object" && !Array.isArray(x);

/* ------------------------------------------------------------------ */
/* PDF-en og filnamnet                                                  */
/* ------------------------------------------------------------------ */

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** PDF-en frå kroppen. Ugyldig når han ikkje er base64 eller ikkje byrjar med %PDF-. For stor: byte null */
export function lesPdf(x: unknown): { ok: true; byte: Uint8Array | null } | { ok: false } {
  if (typeof x !== "string" || x.length === 0 || x.length % 4 !== 0 || !BASE64.test(x)) return { ok: false };
  try {
    if (!atob(x.slice(0, 8)).startsWith("%PDF-")) return { ok: false };
    const fyll = x.endsWith("==") ? 2 : x.endsWith("=") ? 1 : 0;
    if ((x.length / 4) * 3 - fyll > VEDLEGG_MAKS_BYTE) return { ok: true, byte: null };
    const tekst = atob(x);
    const byte = new Uint8Array(tekst.length);
    for (let i = 0; i < tekst.length; i++) byte[i] = tekst.charCodeAt(i);
    return { ok: true, byte };
  } catch {
    return { ok: false };
  }
}

/** Eit filnamn alle på vegen tek imot: ASCII, og alltid .pdf til slutt. Æ, ø og å blir a, o og a eller borte */
export function rensFilnavn(x: unknown): string {
  const raa = typeof x === "string" ? x.slice(0, 500) : "";
  const namn = raa
    .replace(/æ/g, "ae").replace(/Æ/g, "Ae").replace(/ø/g, "o").replace(/Ø/g, "O")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 96)
    .replace(/[._-]+$/g, "");
  return `${namn || "fakturagrunnlag"}.pdf`;
}

/** 2026-10-28 → 28.10.2026 */
const visDato = (d: unknown) => {
  const m = typeof d === "string" ? d.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

/* ------------------------------------------------------------------ */

export async function handter(req: Request, env: (namn: string) => string | undefined, dep: Avhengigheiter): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return svar({ feil: "Bare POST." }, 405);

  const URL_ = env("SUPABASE_URL");
  const ANON = env("SUPABASE_ANON_KEY");
  const TENESTE = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!URL_ || !ANON || !TENESTE) return svar({ feil: "Funksjonen mangler oppsett." }, 500);

  /* --- Kven ringjer? Med kallaren sitt eige token, så det er basen sine reglar som avgjer --- */

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return svar({ feil: "Mangler innlogging." }, 401);
  const somKallar = { apikey: ANON, Authorization: auth, "Content-Type": "application/json" };

  let kontor: unknown;
  try {
    const r = await dep.hent(`${URL_}/rest/v1/rpc/hm_er_kontor`, { method: "POST", headers: somKallar, body: "{}" });
    if (!r.ok) return svar({ feil: "Innloggingen er ikke gyldig. Logg inn på nytt." }, 401);
    kontor = await r.json();
  } catch {
    return svar({ feil: "Fikk ikke sjekket innloggingen. Ingenting er sendt." }, 502);
  }
  if (kontor !== true) return svar({ feil: "Bare kontoret kan sende til Tripletex." }, 403);

  /* --- Kroppen --- */

  let kropp: unknown;
  try {
    kropp = await req.json();
  } catch {
    return svar({ feil: "Ugyldig forespørsel." }, 400);
  }
  if (!erObjekt(kropp)) return svar({ feil: "Ugyldig forespørsel." }, 400);
  const handling = kropp.handling ?? "ordre";
  if (handling !== "ordre" && handling !== "vedlegg") return svar({ feil: "Ugyldig forespørsel.", felt: "handling" }, 400);
  const invoiceId = kropp.invoice_id;
  if (typeof invoiceId !== "string" || !UUID.test(invoiceId)) return svar({ feil: "Ugyldig forespørsel.", felt: "invoice_id" }, 400);
  const pdf = lesPdf(kropp.pdf);
  if (pdf.ok === false) return svar({ feil: "Ugyldig forespørsel.", felt: "pdf" }, 400);
  const filnamn = rensFilnavn(kropp.filnavn);

  const kundenrInn = kropp.kundenr;
  if (kundenrInn !== undefined && kundenrInn !== null && !(typeof kundenrInn === "number" && Number.isSafeInteger(kundenrInn) && kundenrInn > 0)) {
    return svar({ feil: "Kundenummeret må være et helt tall.", felt: "kundenr" }, 400);
  }
  const nokkelInn = typeof kropp.kunde_nokkel === "string" ? kropp.kunde_nokkel.slice(0, 500) : null;

  /* --- Nøkkelen. Manglar han, er ingenting sett opp, og ingenting blir merka --- */

  const NOKKEL = env("TRIPLETEX_NOKKEL");
  if (!NOKKEL) return svar({ sendt: false, grunn: "ikke satt opp", melding: "Tripletex-nøkkelen er ikke lagt inn i Supabase. Ingenting er sendt." });

  const hovud = { apikey: TENESTE, Authorization: `Bearer ${TENESTE}`, "Content-Type": "application/json" };
  const vent = dep.vent ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  /** Eitt rpc-kall som service_role. null når det feila: då veit vi ikkje kva som skjedde */
  const rpc = async (namn: string, args: Json): Promise<{ data: unknown } | null> => {
    try {
      const r = await dep.hent(`${URL_}/rest/v1/rpc/${namn}`, { method: "POST", headers: hovud, body: JSON.stringify(args) });
      if (!r.ok) {
        console.error(`tripletex-ordre: ${namn} svarte ${r.status}`);
        return null;
      }
      return { data: await r.json() };
    } catch {
      console.error(`tripletex-ordre: ${namn} feilet`);
      return null;
    }
  };

  /** Det same, tre gonger, for skrivingane som MÅ kome fram */
  const rpcSikker = async (namn: string, args: Json): Promise<unknown | null> => {
    for (let i = 0; i < 3; i++) {
      if (i > 0) await vent(250 * i);
      const r = await rpc(namn, args);
      if (r) return r.data;
    }
    return null;
  };

  const forny = async () => {
    const t = await sesjonstoken(NOKKEL, dep.hent);
    dep.token.nokkel = NOKKEL;
    dep.token.token = t;
    return t;
  };
  const token = async () => (dep.token.token && dep.token.nokkel === NOKKEL ? dep.token.token : await forny());

  /** Legg PDF-en ved ordren. Rada er alt teken (laster_opp) */
  const vedlegg = async (koId: string, ordreId: number, arva: boolean): Promise<{ status: string; melding?: string; tripletexTekst?: string }> => {
    if (pdf.byte === null) {
      await rpcSikker("pipe_tripletex_vedlegg_utfall", { p_ko_id: koId, p_status: "feilet", p_feil: FOR_STOR });
      return { status: "feilet", melding: FOR_STOR };
    }
    try {
      await leggVedOrdre(await token(), ordreId, pdf.byte, filnamn, dep.hent, forny);
    } catch (e) {
      // Aldri e.message frå noko anna enn TripletexFeil: ho kan sitere svaret frå Tripletex
      const feil = e instanceof TripletexFeil ? e : null;
      const status = arva || !feil || feil.kanVaereOpprettet ? "ukjent" : "feilet";
      const melding = feil?.sisteFeil ?? "Uventet feil. PDF-en kan være lagt ved ordren: se i Tripletex.";
      await rpcSikker("pipe_tripletex_vedlegg_utfall", { p_ko_id: koId, p_status: status, p_feil: melding });
      console.error(`tripletex-ordre: vedlegget for ${koId} ble ${status}, status ${feil?.status ?? "?"}`);
      return { status, melding, ...(feil?.tripletexTekst ? { tripletexTekst: feil.tripletexTekst } : {}) };
    }
    const lagra = await rpcSikker("pipe_tripletex_vedlegg_utfall", { p_ko_id: koId, p_status: "lagt_ved" });
    if (lagra !== true) {
      return { status: "lagt_ved", melding: "PDF-en er lagt ved ordren i Tripletex, men appen fikk ikke lagret det. Ikke legg den ved på nytt." };
    }
    return { status: "lagt_ved", ...(arva ? { melding: "Et tidligere forsøk kan også ha lagt ved PDF-en. Se etter to på ordren i Tripletex." } : {}) };
  };

  /* ================================================================== */
  /* Berre vedlegget                                                      */
  /* ================================================================== */

  if (handling === "vedlegg") {
    const t = await rpc("pipe_tripletex_vedlegg_ta", { p_invoice_id: invoiceId, p_overta: kropp.overta === true });
    if (!t || !erObjekt(t.data)) return svar({ feil: "Fikk ikke lest køen. Ingenting er lagt ved." }, 502);
    if (typeof t.data.grunn === "string") return svar({ sendt: false, grunn: t.data.grunn });
    const koId = String(t.data.ko_id);
    const ordreId = Number(t.data.ordre_id);
    const v = await vedlegg(koId, ordreId, t.data.arva === true);
    return svar({ sendt: v.status === "lagt_ved", ordreId, vedlegg: v });
  }

  /* ================================================================== */
  /* Ordren                                                               */
  /* ================================================================== */

  const intern = kropp.intern === true;
  const t = await rpc("pipe_tripletex_ta", {
    p_invoice_id: invoiceId,
    p_intern: intern,
    p_kunde_nokkel: nokkelInn,
    p_overlapp_ok: kropp.overlappBekreftet === true,
  });
  if (!t || !erObjekt(t.data)) return svar({ feil: "Fikk ikke lest køen. Ingenting er sendt." }, 502);
  const rad = t.data;
  if (typeof rad.grunn === "string") {
    const { grunn, ...resten } = rad;
    return svar({ sendt: false, grunn, ...resten });
  }

  // Frå her står rada som under_sending. Kvar veg ut skriv eit utfall.
  const koId = String(rad.ko_id);

  const avslutt = async (status: string, feil: string | null, ekstra: Json = {}) => {
    const lagra = await rpcSikker("pipe_tripletex_utfall", { p_ko_id: koId, p_status: status, p_ordre_id: null, p_feil: feil });
    if (lagra !== true) console.error(`tripletex-ordre: utfallet ${status} for ${koId} ble ikke lagret`);
    if (status === "mangler_kunde") return svar({ sendt: false, grunn: "mangler_kunde", melding: feil, ...ekstra });
    return svar({ sendt: false, grunn: "feil", koStatus: status, melding: feil, ...ekstra });
  };

  const fraFeil = (e: unknown) => {
    if (e instanceof TripletexFeil) {
      const status = e.kanVaereOpprettet ? "ukjent_utfall" : e.forbigaaende ? "venter" : "feilet";
      return avslutt(status, e.sisteFeil, e.tripletexTekst ? { tripletexTekst: e.tripletexTekst } : {});
    }
    console.error("tripletex-ordre: uventet feil, av typen", e instanceof Error ? e.name : typeof e);
    return avslutt("ukjent_utfall", "Uventet feil i funksjonen. Ordren kan være opprettet: kontroller i Tripletex før du sender på nytt.");
  };

  const total = Math.round(Number(rad.total) * 100) / 100;
  if (!Number.isFinite(total) || total === 0) {
    return avslutt("feilet", "Grunnlaget er på 0 kr og blir ikke ordre i Tripletex.");
  }
  const produktNr = typeof rad.produkt_nr === "string" ? rad.produkt_nr : "";

  /* --- Kunden og produktet. Berre GET: ingenting er oppretta enno --- */

  let kundeId: number;
  let produktId: number | null;
  let hugsKundenr: number | null = null;
  try {
    const tok = await token();
    // Eit kundenummer kontoret skreiv inn no, går føre ei gammal kopling, som går føre org.nr.
    const kundenr = !intern && typeof kundenrInn === "number" ? kundenrInn : typeof rad.kundenr === "number" ? rad.kundenr : null;
    if (kundenr !== null) {
      const treff = await finnKunde(tok, { kundenr }, dep.hent, forny);
      if (treff.length !== 1) {
        return avslutt(
          "mangler_kunde",
          intern
            ? `Fant ikke felleskontoen (kundenummer ${kundenr}) i Tripletex. Rett den under Innstillinger. Ingenting er opprettet.`
            : `Fant ingen aktiv kunde med kundenummer ${kundenr} i Tripletex. Ingenting er opprettet.`,
        );
      }
      kundeId = treff[0];
      if (!intern && typeof kundenrInn === "number" && nokkelInn) hugsKundenr = kundenrInn;
    } else {
      const orgnr = Array.isArray(rad.orgnr) ? rad.orgnr.filter((n): n is string => typeof n === "string") : [];
      if (orgnr.length !== 1) {
        return avslutt(
          "mangler_kunde",
          orgnr.length === 0
            ? "Kunden har ikke org.nr. i appen. Skriv inn kundenummeret fra Tripletex. Ingenting er opprettet."
            : "Bestillingene har ulike org.nr. Skriv inn kundenummeret fra Tripletex. Ingenting er opprettet.",
        );
      }
      const treff = await finnKunde(tok, { orgnr: orgnr[0] }, dep.hent, forny);
      if (treff.length !== 1) {
        return avslutt(
          "mangler_kunde",
          treff.length === 0
            ? `Fant ingen aktiv kunde med org.nr. ${orgnr[0]} i Tripletex. Skriv inn kundenummeret. Ingenting er opprettet.`
            : `Flere kunder i Tripletex har org.nr. ${orgnr[0]}. Skriv inn kundenummeret. Ingenting er opprettet.`,
        );
      }
      kundeId = treff[0];
    }
    produktId = await finnProdukt(tok, produktNr, dep.hent, forny);
  } catch (e) {
    return fraFeil(e);
  }
  if (produktId === null) {
    return avslutt("feilet", `Fant ikke produkt nr. ${produktNr} i Tripletex. Rett produktnummeret under Innstillinger. Ingenting er opprettet.`);
  }

  /* --- Ordren --- */

  const nr = String(rad.grunnlag_nr);
  const periode = `${visDato(rad.periode_fra)}–${visDato(rad.periode_til)}`;
  const notat = typeof rad.notat === "string" && rad.notat.trim() ? ` ${rad.notat.trim().slice(0, 200)}` : "";

  let ordreId: number;
  try {
    ordreId = await opprettOrdre(
      await token(),
      {
        kundeId,
        produktId,
        ordredato: String(rad.laget),
        leveringsdato: String(rad.periode_til),
        forfallDagar: Number(rad.forfall_dagar) || 14,
        internkommentar: `Fra rørlageret: fakturagrunnlag nr. ${nr}, ${periode}${intern ? ", internt uttak" : ""}.${notat}`,
        fakturakommentar: `Fakturagrunnlag nr. ${nr}, ${periode}. Se vedlegg.`,
        beskrivelse: LINJETEKST,
        belopEksMva: total,
      },
      dep.hent,
      forny,
    );
  } catch (e) {
    return fraFeil(e);
  }

  const lagra = await rpcSikker("pipe_tripletex_utfall", { p_ko_id: koId, p_status: "sendt", p_ordre_id: ordreId, p_feil: null });
  if (lagra !== true) {
    // Ordren finst. Rada blir «ukjent» etter fem minutt, og då ser eit menneske i Tripletex
    console.error(`tripletex-ordre: ordre ${ordreId} er opprettet for ${koId}, men det ble ikke lagret`);
    return svar({
      sendt: true,
      ordreId,
      lagret: false,
      melding: `Ordren er opprettet i Tripletex (id ${ordreId}), men appen fikk ikke lagret det. Ikke send på nytt.`,
    });
  }
  if (hugsKundenr !== null && nokkelInn) {
    let av = "ukjent";
    try {
      const u = await dep.hent(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
      if (u.ok) av = String(((await u.json()) as Json).email ?? "ukjent");
    } catch {
      /* kven som kopla er fint å ha, ikkje naudsynt */
    }
    if (!(await rpc("pipe_tripletex_hugs_kunde", { p_nokkel: nokkelInn, p_kundenr: hugsKundenr, p_av: av }))) {
      console.error("tripletex-ordre: koplinga ble ikke lagret");
    }
  }

  /* --- Vedlegget, i same kall --- */

  const v = await rpc("pipe_tripletex_vedlegg_ta", { p_invoice_id: invoiceId, p_overta: false });
  if (!v || !erObjekt(v.data) || typeof v.data.grunn === "string") {
    return svar({ sendt: true, ordreId, vedlegg: { status: "ikke_forsokt", melding: "PDF-en ble ikke lagt ved. Prøv «Legg ved PDF» på grunnlaget." } });
  }
  return svar({ sendt: true, ordreId, vedlegg: await vedlegg(String(v.data.ko_id), ordreId, v.data.arva === true) });
}
