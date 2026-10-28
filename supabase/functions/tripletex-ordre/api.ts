/**
 * Samtalen med Tripletex: byte nøkkelen mot eit sesjonstoken, slå opp kunde og
 * produkt, opprette ein ordre, og leggje grunnlaget sin PDF ved ordren.
 *
 * Teken frå grus-appen (hauge-maskin-grus/supabase/functions/tripletex-ordre/
 * api.ts), der kvar felle i API-et er funnen ved å prøve. Rein TypeScript utan
 * Deno, og fetch kjem inn som argument, så alt her kan prøvast i
 * src/test/tripletex-api.test.ts utan at noko forlèt maskina. Det finst ikkje
 * noko testselskap hos Tripletex: kvart ekte kall skriv i det levande rekneskapen.
 *
 * TRE REGLAR BLIR HALDNE HER, og ingen andre stader:
 *
 *   1. INGENTING BLIR FAKTURERT ELLER SENDT. Fila kallar tokenbytet, oppslag på
 *      /customer og /product (GET), /order (POST) og /order/{id}/:attach (PUT).
 *      Vedlegget følgjer NESTE faktura frå ordren (addToInvoiceMode=NEXT) og står
 *      ikkje på ordrestadfestinga (addToOrderMode=NONE). Prøvane har ei
 *      tillatingsliste over adressene, så eit nytt endepunkt må nokon ha bestemt.
 *
 *   2. SVARTEKSTEN FRÅ TRIPLETEX BLIR ALDRI LAGRA. Valideringsfeil gjentek verdiane
 *      dei avviste: kundenamn, adresser, beløp. Utviklarvilkåra (punkt 2.2.4)
 *      forbyr oss å samle dei. TripletexFeil har difor to sider: `sisteFeil`
 *      (status, feilkode og vår eiga melding) kan lagrast, `tripletexTekst` kan
 *      berre visast for kontoret medan feilen skjer.
 *
 *   3. PRISANE ER UTAN MVA, OG BERRE ÉIN PRIS PER LINJE. Ordren seier sjølv at
 *      beløpa er eks. mva, og linja brukar unitPriceExcludingVatCurrency. Begge
 *      prisfelta, eller feil felt, og Tripletex avviser ordren.
 */

/** Ordren slik handter.ts byggjer han */
export type Ordre = {
  kundeId: number;
  produktId: number;
  ordredato: string;
  leveringsdato: string;
  forfallDagar: number;
  internkommentar: string;
  fakturakommentar: string;
  beskrivelse: string;
  belopEksMva: number;
};

const BASE = "https://tripletex.no/v2";

/* Tripletex tek imot 300 til 28800 sekund, og svarar 422 på alt under 300 */
const TTL_SEKUNDER = 3600;

/* Lengre enn Tripletex treng, kort nok til at kalla på rad går innanfor tida ein kantfunksjon har */
const TIDSGRENSE_MS = 20_000;

/* Oppslaga blar seg gjennom heile registeret. Tripletex hadde 1656 kundar i oktober 2026 */
const SIDE = 1000;
const MAKS_SIDER = 20;

/** Tripletex sin mva-type 3: utgåande mva, høg sats (25 %) */
const MVA_HOY = 3;

type Steg = "token" | "oppslag" | "ordre" | "vedlegg";

type Vurdering = {
  /** Vår eiga melding. Det einaste i feilen som kan lagrast */
  melding: string;
  /** Går over av seg sjølv, og ingenting er oppretta */
  forbigaaende: boolean;
  /** Tripletex kan ha oppretta ordren (eller lagt ved PDF-en) utan at vi fekk vite det */
  kanVaereOpprettet: boolean;
};

/**
 * Ein feil i samtalen med Tripletex.
 *
 * `message` og `sisteFeil` er ALDRI avleidde av det Tripletex svarte, bortsett frå
 * statuskoden og feilkoden, som er tal. Teksten frå Tripletex ligg i
 * `tripletexTekst`, og han er ikkje-enumerabel med vilje: ein feilhandterar som
 * stringifiserer alt han fangar, skal ikkje kunne ta han med seg.
 */
export class TripletexFeil extends Error {
  /** HTTP-status, eller 0 når Tripletex ikkje svarte */
  readonly status: number;
  /** Feilkoden frå Tripletex. Berre når han er eit tal: ein tekst kunne innehalde eit kundenamn */
  readonly kode: number | null;
  readonly forbigaaende: boolean;
  readonly kanVaereOpprettet: boolean;
  declare readonly tripletexTekst: string;

  constructor(
    egen: { melding: string; status: number; kode: number | null; forbigaaende: boolean; kanVaereOpprettet: boolean },
    tripletexTekst = "",
  ) {
    super(egen.melding);
    this.name = "TripletexFeil";
    this.status = egen.status;
    this.kode = egen.kode;
    this.forbigaaende = egen.forbigaaende;
    this.kanVaereOpprettet = egen.kanVaereOpprettet;
    Object.defineProperty(this, "tripletexTekst", { value: tripletexTekst, enumerable: false });
  }

  /** Det som kan skrivast til pipe_tripletex_ko.siste_feil: status, kode og vår eiga melding */
  get sisteFeil(): string {
    if (this.status === 0) return this.message;
    const kode = this.kode === null ? "" : `, Tripletex-kode ${this.kode}`;
    return `HTTP ${this.status}${kode}: ${this.message}`;
  }
}

/** Kva ein feil tyder, og vår eiga melding om han. Vald av steg og status åleine, aldri av svarteksten */
function vurder(steg: Steg, status: number): Vurdering {
  const nei = (melding: string, forbigaaende = false): Vurdering => ({ melding, forbigaaende, kanVaereOpprettet: false });
  const kanskje = (melding: string): Vurdering => ({ melding, forbigaaende: false, kanVaereOpprettet: true });

  if (steg === "token") {
    // Ingen ordre er forsøkt oppretta enno, så alt her er trygt å prøve på nytt
    if (status === 0) return nei("Fikk ikke kontakt med Tripletex. Ingenting er opprettet. Prøv igjen.", true);
    if (status === 429 || status >= 500) return nei("Tripletex kunne ikke gi et sesjonstoken akkurat nå. Ingenting er opprettet. Prøv igjen om litt.", true);
    if (status === 400 || status === 401 || status === 403 || status === 422) {
      return nei("Tripletex godtok ikke API-nøkkelen. Lag en ny under API-nøkler i Tripletex og legg den i hemmeligheten TRIPLETEX_NOKKEL. Ingenting er opprettet.");
    }
    return nei("Tripletex ga ikke noe sesjonstoken. Ingenting er opprettet.");
  }

  if (steg === "oppslag") {
    // Ein GET opprettar ingenting
    if (status === 0) return nei("Fikk ikke kontakt med Tripletex. Ingenting er opprettet. Prøv igjen.", true);
    if (status === 429 || status >= 500) return nei("Tripletex svarte ikke på oppslaget akkurat nå. Ingenting er opprettet. Prøv igjen om litt.", true);
    if (status === 403) return nei("API-nøkkelen har ikke tilgang til kunder og produkter i Tripletex. Ingenting er opprettet.");
    return nei("Oppslaget i Tripletex feilet. Ingenting er opprettet.");
  }

  if (steg === "vedlegg") {
    if (status === 0) return kanskje("Fikk ikke svar fra Tripletex. PDF-en kan være lagt ved ordren: se på ordren i Tripletex før du legger den ved på nytt.");
    if (status === 401) return nei("Tripletex avviste sesjonstokenet. Ingenting er lagt ved.");
    if (status === 403) return nei("API-nøkkelen har ikke tilgang til å legge ved filer på ordre i Tripletex. Ingenting er lagt ved.");
    if (status === 404) return nei("Fant ikke ordren i Tripletex. Ingenting er lagt ved.");
    if (status === 413) return nei("Tripletex tok ikke imot så stor PDF. Ingenting er lagt ved: legg den ved for hånd i Tripletex.");
    if (status === 429) return nei("For mange kall mot Tripletex. Ingenting er lagt ved. Vent litt og prøv igjen.");
    if (status >= 400 && status < 500) return nei("Tripletex avviste vedlegget. Ingenting er lagt ved.");
    if (status >= 500) return kanskje("Tripletex svarte med en serverfeil. PDF-en kan være lagt ved ordren: se på ordren i Tripletex før du legger den ved på nytt.");
    return kanskje("Tripletex svarte noe vi ikke forventet. PDF-en kan være lagt ved ordren: se på ordren i Tripletex før du legger den ved på nytt.");
  }

  // Ordren: frå her kan førespurnaden ha nådd Tripletex, og då kan ordren finnast
  if (status === 0) return kanskje("Fikk ikke svar fra Tripletex. Ordren kan være opprettet: kontroller i Tripletex før du sender på nytt.");
  if (status === 401) return nei("Tripletex avviste sesjonstokenet. Ingenting er opprettet.");
  if (status === 403) return nei("API-nøkkelen har ikke tilgang til å opprette ordre i Tripletex. Ingenting er opprettet.");
  if (status === 429) return nei("For mange kall mot Tripletex. Ingenting er opprettet. Vent litt og send på nytt.", true);
  if (status === 400 || status === 422) return nei("Tripletex avviste ordren. Ingenting er opprettet.");
  if (status >= 400 && status < 500) return nei("Tripletex avviste ordren. Ingenting er opprettet.");
  if (status >= 500) return kanskje("Tripletex svarte med en serverfeil. Ordren kan være opprettet: kontroller i Tripletex før du sender på nytt.");
  return kanskje("Tripletex svarte uten å gi en ordre-id. Ordren kan være opprettet: kontroller i Tripletex før du sender på nytt.");
}

type Json = Record<string, unknown>;

/** Verdien på ein sti inn i JSON utanfrå, eller undefined. Kastar aldri */
const sti = (x: unknown, ...nokler: string[]): unknown =>
  nokler.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Json)[k] : undefined), x);

/** JSON.parse utan å ta vare på feilen: han siterer teksten, og det er svaret frå Tripletex */
function lesJson(tekst: string): Json | null {
  try {
    const j: unknown = JSON.parse(tekst);
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Json) : null;
  } catch {
    return null;
  }
}

/** Teksten kontoret får sjå: meldinga og kvar valideringsmelding. Berre til visning */
function visningstekst(j: Json | null): string {
  if (!j) return "";
  const deler: string[] = [];
  if (typeof j.message === "string") deler.push(j.message);
  if (typeof j.developerMessage === "string" && j.developerMessage !== j.message) deler.push(j.developerMessage);
  if (Array.isArray(j.validationMessages)) {
    for (const v of j.validationMessages as unknown[]) {
      const felt = sti(v, "field");
      const melding = sti(v, "message");
      if (typeof melding !== "string") continue;
      deler.push(typeof felt === "string" && felt ? `${felt}: ${melding}` : melding);
    }
  }
  return deler.join("; ").slice(0, 1500);
}

/**
 * Teksten frå Tripletex blir berre vist når det er ORDREN eller VEDLEGGET som blir
 * avvist (4xx utanom 401, 403 og 429). Svaret på tokenbytet høyrer til nøkkelen,
 * og kan ekko han.
 */
const visesForKontoret = (steg: Steg, status: number) =>
  (steg === "ordre" || steg === "vedlegg") && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429;

function lagFeil(steg: Steg, status: number, tekst: string): TripletexFeil {
  const json = lesJson(tekst);
  const funnen = sti(json, "code");
  const kode = typeof funnen === "number" && Number.isSafeInteger(funnen) ? funnen : null;
  return new TripletexFeil({ ...vurder(steg, status), status, kode }, visesForKontoret(steg, status) ? visningstekst(json) : "");
}

const erOk = (status: number) => status >= 200 && status < 300;

/** Eitt kall, med tidsgrense. Kroppen blir lesen her, så grensa òg dekkjer ein kropp som aldri blir ferdig */
async function kall(hent: typeof fetch, steg: Steg, url: string, init: RequestInit): Promise<{ status: number; tekst: string }> {
  const styring = new AbortController();
  const tidsgrense = setTimeout(() => styring.abort(), TIDSGRENSE_MS);
  let status = 0;
  try {
    const r = await hent(url, { ...init, signal: styring.signal });
    status = r.status;
    return { status, tekst: await r.text() };
  } catch {
    if (status !== 0) return { status, tekst: "" };
    throw lagFeil(steg, 0, "");
  } finally {
    clearTimeout(tidsgrense);
  }
}

const basic = (token: string) => `Basic ${btoa(`0:${token}`)}`;

/**
 * Byter nøkkelen mot eit kortlevd sesjonstoken. Nøkkelen går i kroppen og ingen
 * andre stader: ei adresse hamnar i loggane til alle på vegen.
 */
export async function sesjonstoken(nokkel: string, hent: typeof fetch): Promise<string> {
  const r = await kall(hent, "token", `${BASE}/token/session/:createFromRefreshToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken: nokkel, ttlSeconds: TTL_SEKUNDER }),
  });
  if (!erOk(r.status)) throw lagFeil("token", r.status, r.tekst);
  const token = sti(lesJson(r.tekst), "value", "token");
  if (typeof token !== "string" || token === "") throw lagFeil("token", r.status, "");
  return token;
}

/**
 * Heile lista frå eit register, side for side. Filtera i Tripletex blir ikkje
 * brukte: grus-appen fann at `?name=` og `?customerNumber=` på /customer blir
 * ignorerte, og ei liste som ser filtrert ut men ikkje er det, ville gitt feil
 * kunde. Vi hentar alt og filtrerer sjølv.
 */
async function hentAlle(
  token: string,
  sti_: string,
  felt: string,
  hent: typeof fetch,
  forny?: () => Promise<string>,
): Promise<Json[]> {
  let t = token;
  const ut: Json[] = [];
  for (let side = 0; side < MAKS_SIDER; side++) {
    const url = `${BASE}/${sti_}?fields=${felt}&from=${side * SIDE}&count=${SIDE}`;
    const send = (tok: string) => kall(hent, "oppslag", url, { method: "GET", headers: { Authorization: basic(tok), Accept: "application/json" } });
    let r = await send(t);
    if (r.status === 401 && forny) {
      t = await forny();
      r = await send(t);
    }
    if (!erOk(r.status)) throw lagFeil("oppslag", r.status, r.tekst);
    const verdiar = sti(lesJson(r.tekst), "values");
    if (!Array.isArray(verdiar)) throw lagFeil("oppslag", r.status, "");
    for (const v of verdiar) if (v && typeof v === "object") ut.push(v as Json);
    if (verdiar.length < SIDE) return ut;
  }
  return ut;
}

const heiltal = (x: unknown): number | null => (typeof x === "number" && Number.isSafeInteger(x) && x > 0 ? x : null);
const siffer = (x: unknown) => (typeof x === "string" ? x.replace(/\D/g, "") : "");

/** Kundane som passar, med intern id. Inaktive kundar er ikkje med */
export async function finnKunde(
  token: string,
  sok: { kundenr: number } | { orgnr: string },
  hent: typeof fetch,
  forny?: () => Promise<string>,
): Promise<number[]> {
  const alle = await hentAlle(token, "customer", "id,customerNumber,organizationNumber,isInactive", hent, forny);
  return alle
    .filter((k) => k.isInactive !== true)
    .filter((k) => ("kundenr" in sok ? k.customerNumber === sok.kundenr : siffer(k.organizationNumber) === sok.orgnr))
    .map((k) => heiltal(k.id))
    .filter((id): id is number => id !== null);
}

/** Den interne id-en til produktet med dette nummeret, eller null */
export async function finnProdukt(token: string, nummer: string, hent: typeof fetch, forny?: () => Promise<string>): Promise<number | null> {
  const alle = await hentAlle(token, "product", "id,number,isInactive", hent, forny);
  const treff = alle.filter((p) => p.isInactive !== true && String(p.number ?? "").trim() === nummer.trim());
  return treff.length === 1 ? heiltal(treff[0].id) : null;
}

/** Ordren slik Tripletex vil ha han (Order og OrderLine i OpenAPI-fila). Her blir ingenting rekna */
export function tilTripletex(o: Ordre) {
  return {
    customer: { id: o.kundeId },
    orderDate: o.ordredato,
    deliveryDate: o.leveringsdato,
    invoicesDueIn: o.forfallDagar,
    invoicesDueInType: "DAYS",
    internalComment: o.internkommentar,
    invoiceComment: o.fakturakommentar,
    // Utan denne ventar Tripletex prisar MED mva, og avviser ordren
    isPrioritizeAmountsIncludingVat: false,
    orderLines: [
      {
        product: { id: o.produktId },
        description: o.beskrivelse,
        count: 1,
        // Berre dette prisfeltet. Tripletex reknar ut det andre sjølv
        unitPriceExcludingVatCurrency: o.belopEksMva,
        vatType: { id: MVA_HOY },
      },
    ],
  };
}

/**
 * Opprettar ordren og gir tilbake den interne id-en.
 *
 * Svarar Tripletex 401, blir eitt nytt token henta og ordren send éin gong til:
 * 401 tyder at ingenting er handsama. Alle andre feil blir IKKJE prøvde på nytt,
 * heller ikkje 5xx: Tripletex kan ha oppretta ordren før han fall, og eit nytt
 * forsøk ville gitt ordre nummer to. Den avgjerda tek eit menneske.
 */
export async function opprettOrdre(token: string, ordre: Ordre, hent: typeof fetch, forny?: () => Promise<string>): Promise<number> {
  const kropp = JSON.stringify(tilTripletex(ordre));
  const send = (t: string) =>
    kall(hent, "ordre", `${BASE}/order`, {
      method: "POST",
      headers: { Authorization: basic(t), "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
      body: kropp,
    });

  let r = await send(token);
  if (r.status === 401 && forny) r = await send(await forny());
  if (!erOk(r.status)) throw lagFeil("ordre", r.status, r.tekst);

  // Ein ok-status utan ei ordentleg id er ikkje ein ordre vi kan hugse. Han finst nok likevel
  const id = heiltal(sti(lesJson(r.tekst), "value", "id"));
  if (id === null) throw lagFeil("ordre", r.status, "");
  return id;
}

/**
 * Legg PDF-en ved ordren: PUT order/{id}/:attach, multipart med feltet `file`.
 *
 *   addToInvoiceMode=NEXT  vedlegget følgjer NESTE faktura frå ordren, som eit menneske lagar
 *   addToOrderMode=NONE    vedlegget står ikkje på ordrestadfestingar
 *
 * 401 gir eitt nytt forsøk. Alt anna blir ikkje prøvd på nytt: ein 5xx kan ha lagt
 * PDF-en ved før han fall.
 */
export async function leggVedOrdre(
  token: string,
  ordreId: number,
  fil: Uint8Array,
  filnamn: string,
  hent: typeof fetch,
  forny?: () => Promise<string>,
): Promise<void> {
  if (heiltal(ordreId) === null) {
    throw new TripletexFeil({ melding: "Ordre-id-en er ikke et gyldig tall. Ingenting er lagt ved.", status: 0, kode: null, forbigaaende: false, kanVaereOpprettet: false });
  }
  const url = `${BASE}/order/${ordreId}/:attach?addToInvoiceMode=NEXT&addToOrderMode=NONE`;
  const send = (t: string) => {
    // Nytt skjema for kvart forsøk. Content-Type blir ikkje sett: fetch skriv han sjølv, med grensa
    const skjema = new FormData();
    // Kasta fordi nyare TypeScript skil på ArrayBuffer og SharedArrayBuffer. lesPdf lagar alltid ein vanleg
    skjema.append("file", new Blob([fil as BlobPart], { type: "application/pdf" }), filnamn);
    return kall(hent, "vedlegg", url, { method: "PUT", headers: { Authorization: basic(t), Accept: "application/json" }, body: skjema });
  };

  let r = await send(token);
  if (r.status === 401 && forny) r = await send(await forny());
  if (!erOk(r.status)) throw lagFeil("vedlegg", r.status, r.tekst);
}
