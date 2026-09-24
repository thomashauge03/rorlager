// Mva-regnestykket for bestillingane. Éin stad, fordi butikken, kassen, PDF-en,
// e-posten og fakturagrunnlaget må kome fram til same tal – eit øre skilnad
// mellom det kunden såg og det som blei fakturert, er ein telefon til kontoret.
//
// Ligg i supabase/functions/_shared fordi e-postfunksjonen òg reknar med det,
// og Supabase CLI berre pakkar med filer herifrå. Ingen import: fila blir lesen
// både av Vite og av Deno.
//
// Prisane i katalogen er eks. mva.

export type Summer = { eks: number; mva: number; inkl: number };

/**
 * Pris × mengde, runda i øre slik pipe_submit_pickup_order gjer: Postgres reknar
 * round(price * quantity, 2) eksakt i numeric.
 *
 * I heiltal fordi flyttal bommar på halve øre: 103,39 × 12,5 = 1292,375 skal bli
 * 1292,38 som i Postgres, men blir 1292,37 om ein reknar med desimaltal. Prisen
 * kan ha fleire enn to desimalar – til dømes ein pris som er skriven inn for
 * hand – så han blir rekna i titusendelar og ikkje runda til øre først:
 * 103,375 × 12,5 = 1292,1875 skal bli 1292,19, ikkje 1292,25. Mengda har høgst
 * to desimalar. Rundar halve øre vekk frå null, slik Postgres gjer, og passar
 * for negative beløp òg.
 */
export function linjesum(pris: number, mengde: number): number {
  // Prisen i titusendelar og mengda i hundredelar, rekna i BigInt: då blir
  // produktet eksakt som i Postgres, òg når prisen har fleire enn to desimalar.
  const x = BigInt(Math.round(pris * 10000)) * BigInt(Math.round(mengde * 100));
  const neg = x < 0n;
  const ore = ((neg ? -x : x) + 5000n) / 10000n;
  const n = Number(ore) / 100;
  return neg && n !== 0 ? -n : n;
}

/**
 * Sum eks. mva, mva og sum inkl. mva.
 *
 * Mva blir rekna av summen, ikkje per linje, og runda i øre – nøyaktig same
 * formel som invoice-pdf.ts, så bestillinga og fakturagrunnlaget seier det same.
 * Tek inn ei liste av beløp som er ikkje-negative.
 */
export function summer(linjesummer: number[], mvaSats: number): Summer {
  const øre = linjesummer.reduce((s, l) => s + Math.round(l * 100), 0);
  const eks = øre / 100;
  const mva = mvaSats > 0 ? Math.round(eks * mvaSats) / 100 : 0;
  return { eks, mva, inkl: Math.round((eks + mva) * 100) / 100 };
}

/** Pris per eining med mva, runda i øre. Det ein privatperson skal sjå. Tek inn eit ikkje-negativt beløp. */
export function prisInklMva(pris: number, mvaSats: number): number {
  return Math.round(pris * (100 + mvaSats)) / 100;
}
