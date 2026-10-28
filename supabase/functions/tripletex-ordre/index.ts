/**
 * Opprettar ein ordre i Tripletex av eit fakturagrunnlag, med éi linje
 * («Pris ihht vedlegg») og grunnlaget sin PDF ved.
 *
 * DENNE FUNKSJONEN FINST AV ÉIN GRUNN: Tripletex-nøkkelen kan ikkje liggje i
 * nettlesaren. Han er ein JWT for heile selskapet. Han ligg som hemmelegheita
 * TRIPLETEX_NOKKEL i Supabase, aldri i .env.
 *
 * SLÅR SEG AV SJØLV. Manglar nøkkelen, svarar funksjonen «ikke satt opp», og
 * grunnlaga blir ståande som «venter». Og sjølv med nøkkelen blir ingenting sendt
 * før pipe_tripletex_innstilling.fra_dato er sett.
 *
 * ORDRE, ALDRI FAKTURA. Ingenting blir sletta i Tripletex.
 *
 * Alt som avgjer noko ligg i handter.ts og api.ts, og låsinga i basen. Denne fila
 * hentar berre hemmelegheitene og startar tenaren.
 */

import { handter, type TokenBuffer } from "./handter.ts";

// Held seg i minnet mellom kall så lenge funksjonen er varm. Eit passord: aldri i basen
const token: TokenBuffer = { nokkel: null, token: null };

Deno.serve((req: Request) =>
  handter(req, (namn) => Deno.env.get(namn), {
    hent: (inn, init) => fetch(inn, init),
    token,
  }),
);
