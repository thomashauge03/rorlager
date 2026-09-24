// Skjemaet i kassen, som reine funksjonar. Same reglar og same ordlyd som
// pipe_submit_pickup_order: skjemaet seier frå med ein gong, basen avgjer.

import { gyldigOrgnr, vaskOrgnr } from "@/lib/orgnr";
import type { CustomerType, PickupOrderInput } from "@/lib/types";

export type KasseSkjema = {
  kundetype: CustomerType | null;
  /** Namnet til privatpersonen, eller kontaktpersonen i bedrifta */
  navn: string;
  epost: string;
  telefon: string;
  firma: string;
  orgnr: string;
  gate: string;
  postnr: string;
  sted: string;
  /** null til kunden har valt */
  henterNaa: boolean | null;
  /** YYYY-MM-DD, eller tom */
  hentedag: string;
  kommentar: string;
};

export const TOMT_SKJEMA: KasseSkjema = {
  kundetype: null,
  navn: "",
  epost: "",
  telefon: "",
  firma: "",
  orgnr: "",
  gate: "",
  postnr: "",
  sted: "",
  henterNaa: null,
  hentedag: "",
  kommentar: "",
};

export type Feltfeil = { felt: keyof KasseSkjema; melding: string };

const EPOST = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Dagens dato i Noreg som YYYY-MM-DD. Ikkje toISOString(), som gir UTC og bommar
 * på datoen mellom midnatt og klokka to om natta.
 */
export const osloIDag = (naa: Date = new Date()): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(naa);

/** Reine datoar rekna i UTC, så sommartid aldri flyttar dagen. */
export function leggTilDager(iDag: string, dagar: number): string {
  const d = new Date(`${iDag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagar);
  return d.toISOString().slice(0, 10);
}

export function fakturaadresse(s: Pick<KasseSkjema, "gate" | "postnr" | "sted">): string {
  const sted = [s.postnr.trim(), s.sted.trim()].filter(Boolean).join(" ");
  return [s.gate.trim(), sted].filter(Boolean).join(", ");
}

/** Første feil i skjemaet, i same rekkjefølgje som feltene står. Null = klart. */
export function sjekkSkjema(s: KasseSkjema, o: { kreverTelefon: boolean; iDag: string }): Feltfeil | null {
  if (s.henterNaa === null) return { felt: "henterNaa", melding: "Velg når du henter" };
  if (!s.henterNaa) {
    if (!s.hentedag) return { felt: "hentedag", melding: "Velg hvilken dag du vil hente" };
    if (s.hentedag < o.iDag) return { felt: "hentedag", melding: "Hentedagen kan ikke være tilbake i tid" };
    if (s.hentedag > leggTilDager(o.iDag, 90)) {
      return { felt: "hentedag", melding: "Hentedagen kan være høyst 90 dager fram" };
    }
  }

  if (!s.kundetype) return { felt: "kundetype", melding: "Velg om du bestiller som privatperson eller bedrift" };

  if (s.kundetype === "bedrift") {
    if (!s.firma.trim()) return { felt: "firma", melding: "Firmanavn må fylles ut" };
    if (s.firma.trim().length > 120) return { felt: "firma", melding: "Firmanavnet er for langt (høyst 120 tegn)" };
    if (!gyldigOrgnr(s.orgnr)) return { felt: "orgnr", melding: "Organisasjonsnummeret er ikke gyldig" };
  }

  if (!s.navn.trim()) {
    return { felt: "navn", melding: s.kundetype === "bedrift" ? "Kontaktperson må fylles ut" : "Navn må fylles ut" };
  }
  if (s.navn.trim().length > 100) return { felt: "navn", melding: "Navnet er for langt (høyst 100 tegn)" };

  if (s.kundetype === "privat") {
    if (!s.gate.trim()) return { felt: "gate", melding: "Gateadresse må fylles ut" };
    if (!/^\d{4}$/.test(s.postnr.trim())) return { felt: "postnr", melding: "Postnummeret skal ha fire siffer" };
    if (!s.sted.trim()) return { felt: "sted", melding: "Poststed må fylles ut" };
    if (fakturaadresse(s).length > 200) return { felt: "gate", melding: "Adressen er for lang (høyst 200 tegn)" };
  }

  if (o.kreverTelefon && !s.telefon.trim()) return { felt: "telefon", melding: "Telefonnummer må fylles ut" };
  if (s.telefon.trim().length > 30) return { felt: "telefon", melding: "Telefonnummeret er for langt" };

  const epost = s.epost.trim();
  if (!epost) return { felt: "epost", melding: "E-post må fylles ut" };
  if (epost.length > 254 || !EPOST.test(epost)) return { felt: "epost", melding: "E-postadressen ser ikke riktig ut" };

  if (s.kommentar.trim().length > 1000) return { felt: "kommentar", melding: "Kommentaren er for lang (høyst 1000 tegn)" };
  return null;
}

/** Det som blir sendt til basen. Felt som ikkje høyrer til kundetypen, blir null. */
export function tilInnsending(
  s: KasseSkjema,
  linjer: { pipe_type_id: string; quantity: number }[],
  iDag: string,
): PickupOrderInput {
  const bedrift = s.kundetype === "bedrift";
  return {
    customer_type: bedrift ? "bedrift" : "privat",
    customer_name: s.navn.trim(),
    customer_email: s.epost.trim(),
    customer_phone: s.telefon.trim() || null,
    company: bedrift ? s.firma.trim() : null,
    org_number: bedrift ? vaskOrgnr(s.orgnr) : null,
    billing_address: bedrift ? null : fakturaadresse(s),
    pickup_now: s.henterNaa === true,
    pickup_date: s.henterNaa ? iDag : s.hentedag || null,
    comment: s.kommentar.trim() || null,
    lines: linjer.map((l) => ({ pipe_type_id: l.pipe_type_id, quantity: l.quantity })),
  };
}
