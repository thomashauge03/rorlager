// Organisasjonsnummer med kontrollsiffer. Same regel som hm_orgnr_gyldig i
// basen: skjemaet seier frå med ein gong, basen er den som avgjer.
//
// Ligg i _shared fordi e-postfunksjonen viser nummeret òg. Ingen import.

const VEKTER = [3, 2, 7, 6, 5, 4, 3, 2];

/** Tek bort mellomrom: «974 760 673» og «974760673» er same nummer. */
export const vaskOrgnr = (s: string): string => (s ?? "").replace(/\s/g, "");

/**
 * Modulus 11. Norske organisasjonsnummer har ni siffer og startar på 8 eller 9.
 * Rest 0 gir kontrollsiffer 0, og kontrollsiffer 10 finst ikkje – då er
 * nummeret ugyldig uansett kva som står sist.
 */
export function gyldigOrgnr(s: string): boolean {
  const v = vaskOrgnr(s);
  if (!/^[89]\d{8}$/.test(v)) return false;
  const sum = VEKTER.reduce((acc, w, i) => acc + w * Number(v[i]), 0);
  const rest = sum % 11;
  const kontroll = rest === 0 ? 0 : 11 - rest;
  return kontroll !== 10 && kontroll === Number(v[8]);
}

/** «974760673» -> «974 760 673». Alt anna blir ståande som det er. */
export function visOrgnr(s: string | null | undefined): string {
  const v = vaskOrgnr(s ?? "");
  return /^\d{9}$/.test(v) ? `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}` : (s ?? "");
}
