// Kven eit fakturagrunnlag er for. Uttaka i kiosken har berre eit namn, og blir
// gruppert på det som før. Ei bestilling frå nettet veit meir: ei bedrift blir
// fakturert på firmaet og org.nr., ein privatperson på namnet og adressa.

import { visOrgnr } from "@/lib/orgnr";
import type { PipeOrderRow } from "@/lib/types";

/** Same kunde kan vere skriven "Ola  Nordmann" og "ola nordmann". Vi grupperer
 *  på ein normalisert nøkkel, men viser namnet slik det sist blei skrive. */
export const nameKey = (n: string | null | undefined) => (n ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export type Fakturakunde = { key: string; namn: string; detaljar: string[] };

type Ordre = Pick<
  PipeOrderRow,
  "kind" | "customer_type" | "customer_name" | "company" | "org_number" | "billing_address" | "project" | "created_by"
> &
  Partial<Pick<PipeOrderRow, "project_id">>;

/** Eit uttak frå ein tilsett som var logga inn. Før migrasjonen finst ikkje created_by, og då er det ingen. */
export const erAnsattUttak = (o: Pick<PipeOrderRow, "kind" | "created_by">): boolean =>
  o.kind !== "bestilling" && Boolean(o.created_by);

export function fakturakunde(o: Ordre): Fakturakunde {
  // Ein tilsett tek ut til ein jobb, og det er jobben som blir fakturert – ikkje
  // han. Fleire tilsette på same jobb havnar på same grunnlag, og «jobb:» i
  // nøkkelen held jobben skild frå ein kiosk-kunde som tilfeldigvis heiter det same.
  if (erAnsattUttak(o)) {
    const jobb = o.project?.trim() || o.customer_name;
    // Eit prosjekt frå lista blir samla på prosjektet, ikkje på teksten: får
    // prosjektet nytt namn i SmartDok, skal jobben framleis vere éin.
    if (o.project_id) return { key: `prosjekt:${o.project_id}`, namn: jobb, detaljar: [`Tatt ut av ${o.customer_name}`] };
    return { key: `jobb:${nameKey(jobb)}`, namn: jobb, detaljar: [`Tatt ut av ${o.customer_name}`] };
  }

  // Før migrasjonen er kind undefined, og då er alt uttak.
  if (o.kind !== "bestilling") {
    // Står det eit firma, er det firmaet som skal ha fakturaen – ikkje den som
    // henta. To frå same firma blir då éin kunde, og møter bestillingane frå
    // nettet til same firma (same nøkkel som bedrift under).
    const firma = o.company?.trim();
    if (firma) return { key: nameKey(firma), namn: firma, detaljar: [`Hentet av ${o.customer_name}`] };
    return { key: nameKey(o.customer_name), namn: o.customer_name, detaljar: [] };
  }

  if (o.customer_type === "bedrift") {
    // Firmaet, ikkje kontaktpersonen: då møtest bestillingar frå nettet og uttak
    // i kiosken frå same firma i éin kunde.
    const namn = o.company?.trim() || o.customer_name;
    return { key: nameKey(namn), namn, detaljar: o.org_number ? [`Org.nr. ${visOrgnr(o.org_number)}`] : [] };
  }

  // Adressa er med i nøkkelen: to privatpersonar med same namn skal aldri få
  // éin faktura saman, og heller ikkje dele han med ein kiosk-kunde med same namn.
  return {
    key: `privat:${nameKey(o.customer_name)}|${nameKey(o.billing_address ?? "")}`,
    namn: o.customer_name,
    detaljar: o.billing_address ? [`Fakturaadresse: ${o.billing_address}`] : [],
  };
}

/** Detaljane frå alle bestillingane på eit grunnlag, kvar éin gong. */
export const fakturadetaljar = (ordrar: Ordre[]): string[] => [
  ...new Set(ordrar.flatMap((o) => fakturakunde(o).detaljar)),
];
