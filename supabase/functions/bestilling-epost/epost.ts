/**
 * E-postane for bestillingane: reine funksjonar av det pipe_email_claim gir.
 *
 * Ligg for seg sjølv fordi index.ts kallar Deno.serve() i det han blir lasta,
 * og då kan han ikkje importerast av ein test. Her er ingen Deno, ikkje nettverk
 * og ingen tilstand – berre data inn og tekst ut.
 *
 * Tabellar og innebygde stilar, ikkje flexbox og ikkje stilark: e-postklientar er
 * tjue år bak nettlesarane, og Outlook teiknar med Word.
 */

import { angreskjema, angrerettAvsnitt, angrerettSomTekst, type Selger } from "../_shared/angrerett.ts";
import { prisInklMva, summer } from "../_shared/mva.ts";
import { visOrgnr } from "../_shared/orgnr.ts";

export type EpostType = "kvittering" | "kontor" | "klar" | "avvist";

export type Linje = {
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  /** Beholdninga no. Berre kontoret sin e-post viser henne. */
  stock: number | null;
};

export type Bestilling = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  pickup_date: string;
  pickup_now: boolean;
  customer_type: "privat" | "bedrift";
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company: string | null;
  org_number: string | null;
  billing_address: string | null;
  comment: string | null;
  customer_message: string | null;
  total: number;
};

export type Firma = {
  name: string;
  org_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  pickup_note: string | null;
  vat_rate: number;
  payment_terms_days: number;
};

/** Det pipe_email_claim svarar. order, lines og company manglar når ingenting skal sendast. */
export type Krav = { emails: { type: EpostType; to: string }[]; order?: Bestilling; lines?: Linje[]; company?: Firma };

export type Epost = { to: string; subject: string; html: string; text: string; replyTo?: string };

/*
 * Namn, firma, adresse, kommentar og meldinga frå kontoret er fritekst. Dei skal
 * visast som tekst og aldri tolkast som markering.
 */
export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Fritekst som HTML: koda, med linjeskift som <br>. */
const fritekst = (v: unknown) => esc(v).replace(/\r?\n/g, "<br>");

/** Emnefeltet kan ikkje ha linjeskift – det er vegen inn til eigne e-posthovud. */
const einLinje = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

const kr = (n: number) => Number(n).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tal = (n: number) => Number(n).toLocaleString("nb-NO", { maximumFractionDigits: 2 });

/** «2026-10-02» -> «fredag 2. oktober». */
export function dag(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

const selger = (f: Firma): Selger => ({
  navn: f.name,
  orgnr: f.org_number,
  adresse: f.address,
  epost: f.email,
  telefon: f.phone,
  betalingsfrist: f.payment_terms_days,
  henteinfo: f.pickup_note,
});

const namnPaVare = (l: Linje) => (l.dimension ? `${l.name} ${l.dimension}` : l.name);
const hentes = (o: Bestilling) => (o.pickup_now ? `Henter nå – ${dag(o.pickup_date)}` : dag(o.pickup_date));

/* ---------------------------------------------------------------- byggjeklossar */

/** verdiHtml må vere koda av den som kallar. Tom verdi gir inga rad. */
const rad = (merke: string, verdiHtml: string) =>
  verdiHtml
    ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top">${esc(
        merke,
      )}</td><td style="padding:4px 0;font-size:14px">${verdiHtml}</td></tr>`
    : "";

const knapp = (url: string, tekst: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td style="background:#d3121c;border-radius:8px"><a href="${esc(
    url,
  )}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${esc(
    tekst,
  )}</a></td></tr></table>`;

const boks = (tittel: string, innhaldHtml: string) =>
  `<div style="margin:0 0 16px;padding:12px 14px;background:#f3f4f6;border-radius:8px;font-size:14px"><div style="color:#6b7280;font-size:13px;margin-bottom:2px">${esc(
    tittel,
  )}</div>${innhaldHtml}</div>`;

function varetabell(o: Bestilling, linjer: Linje[], f: Firma, visLager: boolean): string {
  const medMva = o.customer_type === "privat";
  const rader = linjer
    .map((l) => {
      const pris = l.unit_price === null ? null : medMva ? prisInklMva(l.unit_price, f.vat_rate) : l.unit_price;
      const belop = l.line_total === null ? null : medMva ? summer([l.line_total], f.vat_rate).inkl : l.line_total;
      const kort = visLager && l.stock !== null && l.quantity > l.stock;
      const lager =
        visLager && l.stock !== null
          ? `<div style="font-size:12px;color:${kort ? "#b45309" : "#6b7280"};margin-top:2px">${
              kort ? "For lite på lager: " : "På lager: "
            }${esc(tal(l.stock))} ${esc(l.unit)}</div>`
          : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb"><div style="font-weight:600">${esc(namnPaVare(l))}</div>${
          pris === null ? "" : `<div style="font-size:12px;color:#6b7280">${esc(kr(pris))} kr/${esc(l.unit)}</div>`
        }${lager}</td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;vertical-align:top">${esc(
          tal(l.quantity),
        )} ${esc(l.unit)}</td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;vertical-align:top">${
          belop === null ? "–" : `${esc(kr(belop))} kr`
        }</td>
      </tr>`;
    })
    .join("");

  const s = summer([o.total], f.vat_rate);
  const sumRad = (merke: string, verdi: number, sterk = false) =>
    `<tr><td colspan="2" style="padding:4px 0;font-size:14px;${sterk ? "font-weight:700" : "color:#6b7280"}">${esc(
      merke,
    )}</td><td style="padding:4px 0;text-align:right;white-space:nowrap;font-size:14px;${
      sterk ? "font-weight:700" : "color:#6b7280"
    }">${esc(kr(verdi))} kr</td></tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding-bottom:6px;font-size:13px;color:#6b7280;border-bottom:2px solid #111827">Vare (${
        medMva ? "inkl. mva" : "eks. mva"
      })</td>
      <td style="padding-bottom:6px;font-size:13px;color:#6b7280;border-bottom:2px solid #111827;text-align:right">Mengde</td>
      <td style="padding-bottom:6px;font-size:13px;color:#6b7280;border-bottom:2px solid #111827;text-align:right">Beløp</td>
    </tr>
    ${rader}
    <tr><td colspan="3" style="padding-top:8px"></td></tr>
    ${sumRad("Sum eks. mva", s.eks)}
    ${sumRad(`Mva ${tal(f.vat_rate)} %`, s.mva)}
    ${sumRad("Sum inkl. mva", s.inkl, true)}
  </table>`;
}

function varelinjerTekst(o: Bestilling, linjer: Linje[], f: Firma, visLager = false): string[] {
  const medMva = o.customer_type === "privat";
  const s = summer([o.total], f.vat_rate);
  return [
    `Varer (${medMva ? "inkl. mva" : "eks. mva"}):`,
    ...linjer.map((l) => {
      const belop = l.line_total === null ? null : medMva ? summer([l.line_total], f.vat_rate).inkl : l.line_total;
      const lager = visLager && l.stock !== null ? ` (på lager: ${tal(l.stock)} ${l.unit})` : "";
      return `- ${namnPaVare(l)}: ${tal(l.quantity)} ${l.unit}${belop === null ? "" : ` – ${kr(belop)} kr`}${lager}`;
    }),
    "",
    `Sum eks. mva: ${kr(s.eks)} kr`,
    `Mva ${tal(f.vat_rate)} %: ${kr(s.mva)} kr`,
    `Sum inkl. mva: ${kr(s.inkl)} kr`,
  ];
}

/**
 * Angreretten og skjemaet i sjølve e-posten. Ein forbrukar skal ha dei på eit
 * varig medium, og ei lenkje til ei nettside er ikkje det – sida kan endrast.
 */
function angrerettHtml(f: Firma): string {
  const s = selger(f);
  const a = angrerettAvsnitt(s);
  const k = angreskjema(s);
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151;line-height:1.5">
    <div style="font-weight:700;font-size:15px;margin-bottom:6px">${esc(a.tittel)}</div>
    ${a.tekst.map((t) => `<p style="margin:0 0 8px">${esc(t)}</p>`).join("")}
    <div style="font-weight:700;font-size:15px;margin:16px 0 6px">${esc(k.tittel)}</div>
    <p style="margin:0 0 8px">${esc(k.ingress)}</p>
    ${k.felt
      .map((felt) => `<p style="margin:0 0 14px">${esc(felt)}<br><span style="color:#9ca3af">____________________________________</span></p>`)
      .join("")}
    <p style="margin:0;font-size:12px;color:#6b7280">${esc(k.fotnote)}</p>
  </div>`;
}

const henting = (f: Firma) =>
  `${f.address ? `Varene hentes på lageret, ${esc(f.address)}.` : "Varene hentes på lageret."}${
    f.pickup_note ? ` ${fritekst(f.pickup_note)}` : ""
  }`;

const hentingTekst = (f: Firma) =>
  `${f.address ? `Varene hentes på lageret, ${f.address}.` : "Varene hentes på lageret."}${f.pickup_note ? ` ${f.pickup_note}` : ""}`;

function firmaFot(f: Firma): string {
  const kontakt = [f.phone ? `telefon ${esc(f.phone)}` : "", f.email ? `e-post ${esc(f.email)}` : ""].filter(Boolean).join(", ");
  return `${esc(f.name)}${f.org_number ? ` · org.nr. ${esc(visOrgnr(f.org_number))}` : ""}${f.address ? ` · ${esc(f.address)}` : ""}${
    kontakt ? `<br>Du når oss på ${kontakt}.` : ""
  }`;
}

function ramme(f: Firma, tittel: string, innhaldHtml: string, fotHtml: string): string {
  return `<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <tr><td style="padding-bottom:4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">${esc(f.name)}</td></tr>
  <tr><td style="padding-bottom:18px;font-size:22px;font-weight:700">${esc(tittel)}</td></tr>
  <tr><td>${innhaldHtml}</td></tr>
  <tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">${fotHtml}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ---------------------------------------------------------------- e-postane */

function kvittering(o: Bestilling, linjer: Linje[], f: Firma, app: string, til: string): Epost {
  const url = `${app}/bestilling/${o.id}`;
  const privat = o.customer_type === "privat";
  const neste = o.pickup_now
    ? "Kontoret har fått beskjed om at du henter nå."
    : "Kontoret går gjennom den, og du får en ny e-post når varene er klare til henting.";
  const grunn = `Du får denne e-posten fordi adressen ble oppgitt i en bestilling hos ${f.name}. Var det ikke deg, kan du se bort fra den.`;

  const innhald = `
    <p style="margin:0 0 16px;font-size:15px">Hei ${esc(o.customer_name)}. Takk for bestillingen. ${esc(neste)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      ${rad("Bestilling", `nr. ${esc(o.order_number)}`)}
      ${rad("Status", "Venter på godkjenning")}
      ${rad("Hentes", esc(hentes(o)))}
      ${rad("Betaling", `Faktura, ${esc(f.payment_terms_days)} dager`)}
    </table>
    ${varetabell(o, linjer, f, false)}
    <div style="margin-top:20px">${knapp(url, "Se bestillingen og last ned PDF")}</div>
    <p style="margin:12px 0 0;font-size:14px;color:#374151">${henting(f)}</p>
    ${privat ? angrerettHtml(f) : ""}`;

  return {
    to: til,
    subject: einLinje(`Bestilling nr. ${o.order_number} er mottatt – ${f.name}`),
    html: ramme(f, "Vi har mottatt bestillingen din", innhald, `${firmaFot(f)}<br><br>${esc(grunn)}`),
    text: [
      `Vi har mottatt bestillingen din – ${f.name}`,
      "",
      `Hei ${o.customer_name}. Takk for bestillingen. ${neste}`,
      "",
      `Bestilling nr. ${o.order_number}`,
      "Status: Venter på godkjenning",
      `Hentes: ${hentes(o)}`,
      `Betaling: Faktura, ${f.payment_terms_days} dager`,
      "",
      ...varelinjerTekst(o, linjer, f),
      "",
      `Se bestillingen og last ned PDF: ${url}`,
      hentingTekst(f),
      "",
      ...(privat ? [angrerettSomTekst(selger(f)), ""] : []),
      grunn,
    ].join("\n"),
    replyTo: f.email ?? undefined,
  };
}

function kontor(o: Bestilling, linjer: Linje[], f: Firma, app: string, til: string): Epost {
  const privat = o.customer_type === "privat";
  const kunde = o.company ?? o.customer_name;
  const url = `${app}/admin?fane=bestillinger`;
  const telefon = o.customer_phone
    ? `<a href="tel:${esc(o.customer_phone.replace(/\s/g, ""))}" style="color:#111827">${esc(o.customer_phone)}</a>`
    : "";

  const innhald = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      ${rad("Bestilling", `nr. ${esc(o.order_number)}`)}
      ${rad("Hentes", esc(hentes(o)))}
      ${rad("Bestiller", privat ? "Privatperson" : "Bedrift")}
      ${
        privat
          ? rad("Navn", esc(o.customer_name)) + rad("Fakturaadresse", esc(o.billing_address))
          : rad("Firma", esc(o.company)) +
            rad("Org.nr.", esc(o.org_number ? visOrgnr(o.org_number) : "")) +
            rad("Kontaktperson", esc(o.customer_name))
      }
      ${rad("Telefon", telefon)}
      ${rad("E-post", `<a href="mailto:${esc(o.customer_email)}" style="color:#111827">${esc(o.customer_email)}</a>`)}
    </table>
    ${varetabell(o, linjer, f, true)}
    ${o.comment ? `<div style="margin-top:16px">${boks("Kommentar fra kunden", fritekst(o.comment))}</div>` : ""}
    <div style="margin-top:20px">${knapp(url, "Åpne adminpanelet")}</div>`;

  return {
    to: til,
    subject: einLinje(
      o.pickup_now
        ? `Henter nå: bestilling nr. ${o.order_number} – ${kunde}`
        : `Ny bestilling nr. ${o.order_number} – hentes ${dag(o.pickup_date)}`,
    ),
    html: ramme(
      f,
      o.pickup_now ? "Henter nå" : "Ny bestilling",
      innhald,
      "Sendt automatisk fra rørlageret. Svarer du på denne e-posten, går svaret til kunden.",
    ),
    text: [
      `${o.pickup_now ? "HENTER NÅ" : "Ny bestilling"} – nr. ${o.order_number}`,
      "",
      `Hentes: ${hentes(o)}`,
      `Bestiller: ${privat ? "Privatperson" : "Bedrift"}`,
      ...(privat
        ? [`Navn: ${o.customer_name}`, `Fakturaadresse: ${o.billing_address ?? ""}`]
        : [`Firma: ${o.company ?? ""}`, `Org.nr.: ${o.org_number ? visOrgnr(o.org_number) : ""}`, `Kontaktperson: ${o.customer_name}`]),
      `Telefon: ${o.customer_phone ?? ""}`,
      `E-post: ${o.customer_email}`,
      "",
      ...varelinjerTekst(o, linjer, f, true),
      ...(o.comment ? ["", `Kommentar fra kunden: ${o.comment}`] : []),
      "",
      `Adminpanelet: ${url}`,
    ].join("\n"),
    replyTo: o.customer_email,
  };
}

function klar(o: Bestilling, linjer: Linje[], f: Firma, app: string, til: string): Epost {
  const url = `${app}/bestilling/${o.id}`;
  const privat = o.customer_type === "privat";
  const naar = o.pickup_now ? "nå" : dag(o.pickup_date);
  const stadfesting = `Dette er ordrebekreftelsen din. Du får faktura med ${f.payment_terms_days} dagers betalingsfrist.`;

  const innhald = `
    <p style="margin:0 0 16px;font-size:15px">Hei ${esc(o.customer_name)}. Varene i bestilling nr. ${esc(
      o.order_number,
    )} er klare. Du kan hente ${esc(naar)}.</p>
    ${o.customer_message ? boks("Melding fra oss", fritekst(o.customer_message)) : ""}
    <p style="margin:0 0 16px;font-size:14px;color:#374151">${henting(f)}</p>
    ${varetabell(o, linjer, f, false)}
    <div style="margin-top:20px">${knapp(url, "Se bestillingen og last ned PDF")}</div>
    <p style="margin:12px 0 0;font-size:13px;color:#6b7280">${esc(stadfesting)}</p>
    ${privat ? angrerettHtml(f) : ""}`;

  return {
    to: til,
    subject: einLinje(`Bestilling nr. ${o.order_number} er klar til henting – ${f.name}`),
    html: ramme(f, "Klar til henting", innhald, firmaFot(f)),
    text: [
      `Klar til henting – bestilling nr. ${o.order_number}`,
      "",
      `Hei ${o.customer_name}. Varene er klare. Du kan hente ${naar}.`,
      ...(o.customer_message ? ["", `Melding fra oss: ${o.customer_message}`] : []),
      "",
      hentingTekst(f),
      "",
      ...varelinjerTekst(o, linjer, f),
      "",
      `Se bestillingen og last ned PDF: ${url}`,
      stadfesting,
      ...(privat ? ["", angrerettSomTekst(selger(f))] : []),
    ].join("\n"),
    replyTo: f.email ?? undefined,
  };
}

function avvist(o: Bestilling, f: Firma, til: string): Epost {
  const innhald = `
    <p style="margin:0 0 16px;font-size:15px">Hei ${esc(o.customer_name)}. Vi kan dessverre ikke levere bestilling nr. ${esc(
      o.order_number,
    )}, og du blir ikke fakturert for den.</p>
    ${o.customer_message ? boks("Begrunnelse", fritekst(o.customer_message)) : ""}
    <p style="margin:0;font-size:14px;color:#374151">Ta gjerne kontakt, så finner vi en løsning.</p>`;

  return {
    to: til,
    subject: einLinje(`Bestilling nr. ${o.order_number} – vi kan dessverre ikke levere`),
    html: ramme(f, "Vi kan ikke levere bestillingen", innhald, firmaFot(f)),
    text: [
      `Bestilling nr. ${o.order_number} – vi kan dessverre ikke levere`,
      "",
      `Hei ${o.customer_name}. Vi kan dessverre ikke levere bestillingen, og du blir ikke fakturert for den.`,
      ...(o.customer_message ? ["", `Begrunnelse: ${o.customer_message}`] : []),
      "",
      "Ta gjerne kontakt, så finner vi en løsning.",
      `${f.name}${f.phone ? `, telefon ${f.phone}` : ""}${f.email ? `, e-post ${f.email}` : ""}`,
    ].join("\n"),
    replyTo: f.email ?? undefined,
  };
}

/** Éi e-post av typen. Null når kravet manglar bestillinga eller firmaet. */
export function byggEpost(type: EpostType, krav: Krav, appUrl: string, til: string): Epost | null {
  const o = krav.order;
  const f = krav.company;
  if (!o || !f) return null;
  const app = appUrl.trim().replace(/\/+$/, "");
  const linjer = krav.lines ?? [];
  switch (type) {
    case "kvittering":
      return kvittering(o, linjer, f, app, til);
    case "kontor":
      return kontor(o, linjer, f, app, til);
    case "klar":
      return klar(o, linjer, f, app, til);
    case "avvist":
      return avvist(o, f, til);
    default:
      return null;
  }
}
