/**
 * Sendinga, steg for steg: byggje, sende, og så anten merkje som sendt eller
 * sleppe låsen. Ligg for seg sjølv av same grunn som epost.ts – index.ts kallar
 * Deno.serve() når han blir lasta – og fordi det er her feila bur.
 *
 * Kvar e-post endar i nøyaktig eitt av to: merkt som sendt, eller sleppt så ho
 * kan krevjast att. Ein feil i éi e-post stoppar aldri dei neste i same krav:
 * dei er alt krevde, og ville elles vore låste.
 */

import { byggEpost, type Epost, type EpostType, type Krav } from "./epost.ts";

export type Utsending = {
  /** Sender éi e-post. ok: false eller eit kast betyr at ho ikkje gjekk. */
  send: (e: Epost) => Promise<{ ok: boolean; id?: string | null; feil?: string }>;
  /** Merkjer e-posten som sendt. false eller eit kast betyr at det ikkje gjekk. */
  merk: (type: EpostType, id: string | null) => Promise<boolean>;
  /** Slepp låsen, så e-posten kan krevjast på nytt. */
  slepp: (type: EpostType) => Promise<boolean>;
  logg: (...deler: unknown[]) => void;
};

export async function sendKrav(
  krav: Krav,
  appUrl: string,
  u: Utsending,
): Promise<{ sendt: EpostType[]; feilet: EpostType[] }> {
  const sendt: EpostType[] = [];
  const feilet: EpostType[] = [];
  const eposter = Array.isArray(krav?.emails) ? krav.emails : [];

  for (const e of eposter) {
    let levert = false;
    let id: string | null = null;
    try {
      const melding = byggEpost(e.type, krav, appUrl, e.to);
      if (!melding) throw new Error("mangler innhold");
      const r = await u.send(melding);
      if (!r.ok) throw new Error(r.feil ?? "ikke sendt");
      levert = true;
      id = r.id ?? null;
    } catch (err) {
      // Svaret frå Resend blir logga, men går ikkje ut: det seier mellom anna om
      // domenet er verifisert, og funksjonen blir kalla frå ei heilt open side.
      u.logg("bestilling-epost", e.type, String(err));
    }

    if (levert) {
      sendt.push(e.type);
      // Gjekk e-posten, men ikkje merkinga, blir rada fri etter eit kvarter, og
      // e-posten kan gå ein gong til. Det er betre enn at ho aldri går.
      let merkt = false;
      try {
        merkt = await u.merk(e.type, id);
      } catch {
        merkt = false;
      }
      if (!merkt) u.logg("bestilling-epost", e.type, "sendt, men ikke merket som sendt");
    } else {
      feilet.push(e.type);
      // Angre-steget. Går ikkje det heller, blir rada fri etter eit kvarter.
      let sleppt = false;
      try {
        sleppt = await u.slepp(e.type);
      } catch {
        sleppt = false;
      }
      if (!sleppt) u.logg("bestilling-epost", e.type, "låsen ble ikke sluppet – fri igjen om et kvarter");
    }
  }

  return { sendt, feilet };
}
