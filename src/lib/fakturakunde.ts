// Kven eit fakturagrunnlag er for. Uttaka i kiosken har berre eit namn, og blir
// gruppert på det som før. Ei bestilling frå nettet veit meir: ei bedrift blir
// fakturert på firmaet og org.nr., ein privatperson på namnet og adressa.

import { visOrgnr } from "@/lib/orgnr";
import type { PipeOrderRow } from "@/lib/types";

/** Same kunde kan vere skriven "Ola  Nordmann" og "ola nordmann". Vi grupperer
 *  på ein normalisert nøkkel, men viser namnet slik det sist blei skrive. */
export const nameKey = (n: string | null | undefined) => (n ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export type Fakturakunde = { key: string; namn: string; detaljar: string[] };

type Ordre = Pick<PipeOrderRow, "kind" | "customer_type" | "customer_name" | "company" | "org_number" | "billing_address">;

export function fakturakunde(o: Ordre): Fakturakunde {
  // Før migrasjonen er kind undefined, og då er alt uttak.
  if (o.kind !== "bestilling") return { key: nameKey(o.customer_name), namn: o.customer_name, detaljar: [] };

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
