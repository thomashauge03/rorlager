// Vilkåra og angreretten for bestilling på nett – éin kjelde for alle stadene
// teksten står: /vilkar, kassen, PDF-en og e-postane. Fire kopiar av ein
// lovpålagd tekst ville gli frå kvarandre.
//
// HER, OG IKKJE I src/: Supabase CLI pakkar berre med filer under
// supabase/functions når e-postfunksjonen blir rulla ut. Appen importerer fila
// gjennom src/lib/vilkar.ts; den motsette vegen går ikkje.
//
// Reine funksjonar utan import. Fila blir lesen både av Vite og av Deno, og dei
// er ikkje samde om korleis ein importerer.
//
// UTKAST bygd på det angrerettlova, forbrukarkjøpslova og kjøpslova krev. Ikkje
// juridisk rådgiving. Eigar les det før bestilling på nett blir slått på, og
// unntaket for kappa rør bør stadfestast av advokat.

export type Selger = {
  navn: string;
  orgnr?: string | null;
  adresse?: string | null;
  epost?: string | null;
  telefon?: string | null;
  /** Dagar frå faktura til forfall */
  betalingsfrist: number;
  /** Hentemeldinga frå innstillingane: opningstid, port, kven ein spør etter */
  henteinfo?: string | null;
};

export type Avsnitt = { tittel: string; tekst: string[] };

export type Skjema = { tittel: string; ingress: string; felt: string[]; fotnote: string };

const rein = (v: string | null | undefined) => (v ?? "").trim();

function selgerLinje(s: Selger): string {
  const hvem = [s.navn, rein(s.orgnr) ? `org.nr. ${rein(s.orgnr)}` : "", rein(s.adresse)].filter(Boolean);
  const kontakt = [rein(s.epost) ? `e-post ${rein(s.epost)}` : "", rein(s.telefon) ? `telefon ${rein(s.telefon)}` : ""].filter(
    Boolean,
  );
  return `${hvem.join(", ")}.${kontakt.length ? ` Du når oss på ${kontakt.join(" og ")}.` : ""}`;
}

/** To setningar til kassen. Heile teksten står på /vilkar. */
export const ANGRERETT_KORT = [
  "Som privatperson har du 14 dagers angrerett fra du har hentet varene.",
  "Rør vi kapper til lengden du har bestilt, er laget etter dine mål og kan ikke leveres tilbake.",
];

export function angrerettAvsnitt(s: Selger): Avsnitt {
  return {
    tittel: "Angrerett",
    tekst: [
      "Kjøper du som privatperson, har du 14 dagers angrerett. Fristen løper fra dagen du henter varene.",
      `Vil du bruke angreretten, gir du oss beskjed innen fristen. Bruk gjerne angreskjemaet, eller skriv til oss${
        rein(s.epost) ? ` på ${rein(s.epost)}` : ""
      }. Det holder at beskjeden er sendt før fristen går ut.`,
      "Du bringer varene tilbake til lageret selv og dekker kostnaden ved det. Varene må leveres innen 14 dager etter at du ga beskjed.",
      "Vi betaler tilbake det du har betalt innen 14 dager etter at vi fikk beskjeden, og kan vente til varene er kommet tilbake. Har du ikke betalt ennå, krediterer vi fakturaen.",
      "Du kan undersøke varene slik du ville gjort i en butikk. Har de tapt verdi fordi de er behandlet ut over det, kan vi trekke fra verdifallet.",
      "Rør vi kapper til lengden du har bestilt, er laget etter dine mål og har ikke angrerett (angrerettloven § 22). Hele lengder har vanlig angrerett.",
    ],
  };
}

export function vilkarAvsnitt(s: Selger): Avsnitt[] {
  return [
    { tittel: "Selger", tekst: [selgerLinje(s)] },
    {
      tittel: "Bestillingen",
      tekst: [
        "Når du sender bestillingen, gir du oss et tilbud om å kjøpe varene til prisene som står i den.",
        "Avtalen er bindende når vi har bekreftet den («Klar til henting»). Kan vi ikke levere, gir vi deg beskjed med begrunnelse, og da er det ingen avtale.",
      ],
    },
    {
      tittel: "Priser",
      tekst: [
        "Prisene er i norske kroner. Kjøper du som privatperson, er prisene og totalprisen oppgitt med merverdiavgift, og totalprisen vises før du sender bestillingen. For bedrifter vises prisene også uten mva.",
        "Det er prisen som gjaldt da du sendte bestillingen, som gjelder.",
      ],
    },
    {
      tittel: "Betaling",
      tekst: [
        `Du betaler med faktura. Betalingsfristen er ${s.betalingsfrist} dager.`,
        "Privatpersoner får fakturaen til adressen i bestillingen. Bedrifter faktureres på organisasjonsnummeret.",
      ],
    },
    {
      tittel: "Henting",
      tekst: [
        `Varene hentes på lageret${rein(s.adresse) ? `, ${rein(s.adresse)}` : ""}. Du velger hentedag i bestillingen, og vi gir beskjed når varene er klare.`,
        ...(rein(s.henteinfo) ? [rein(s.henteinfo)] : []),
        "Risikoen for varene går over på deg når du har hentet dem.",
      ],
    },
    angrerettAvsnitt(s),
    {
      tittel: "Reklamasjon",
      tekst: [
        "Er det feil ved varene, må du si fra innen rimelig tid etter at du oppdaget det.",
        "For privatpersoner gjelder forbrukerkjøpsloven. Fristen er to år fra du hentet varene, og fem år for varer som er ment å vare vesentlig lenger – slik rør som legges i bakken er.",
        "For bedrifter gjelder kjøpsloven.",
      ],
    },
    {
      tittel: "Personopplysninger",
      tekst: ["Vi bruker opplysningene i bestillingen for å gjennomføre og fakturere den. Personvernerklæringen forteller hvordan."],
    },
    {
      tittel: "Tvister",
      tekst: [
        "Vi prøver å løse uenighet i minnelighet. Privatpersoner kan også klage til Forbrukertilsynet, som mekler, og saken kan deretter bringes inn for Forbrukerklageutvalget.",
      ],
    },
  ];
}

/** Standardskjemaet for angrerett, med seljaren fylt inn. */
export function angreskjema(s: Selger): Skjema {
  const til = [s.navn, rein(s.adresse), rein(s.epost)].filter(Boolean).join(", ");
  return {
    tittel: "Angreskjema",
    ingress: "Fyll ut og returner dette skjemaet bare dersom du vil gå fra avtalen.",
    felt: [
      `Til: ${til}`,
      "Jeg underretter herved om at jeg ønsker å gå fra min avtale om kjøp av følgende varer:",
      "Bestillingsnummer:",
      "Avtalen ble inngått den (*) / Varene ble mottatt den (*):",
      "Forbrukerens navn:",
      "Forbrukerens adresse:",
      "Forbrukerens underskrift (bare dersom skjemaet sendes på papir):",
      "Dato:",
    ],
    fotnote: "(*) Stryk det som ikke gjelder.",
  };
}

/** Skjemaet som rein tekst, med ein strek å skrive på etter kvart felt. */
function angreskjemaSomTekst(s: Selger): string[] {
  const k = angreskjema(s);
  return [k.tittel.toUpperCase(), k.ingress, ...k.felt.map((f) => `${f} ____________________`), k.fotnote];
}

/** Angreretten og skjemaet som rein tekst – til tekstversjonen av e-posten. */
export function angrerettSomTekst(s: Selger): string {
  const a = angrerettAvsnitt(s);
  return [a.tittel.toUpperCase(), ...a.tekst, "", ...angreskjemaSomTekst(s)].join("\n");
}

/** Heile vilkåra og skjemaet som rein tekst – til tekstversjonen av ordrestadfestinga. */
export function vilkarSomTekst(s: Selger): string {
  return [...vilkarAvsnitt(s).flatMap((a) => [a.tittel.toUpperCase(), ...a.tekst, ""]), ...angreskjemaSomTekst(s)].join(
    "\n",
  );
}
