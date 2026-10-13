// Reglane for passord, delte mellom «Velg ditt eget passord», «Bytt passord»
// og superadmin som set eit mellombels passord på ein annan.
//
// Supabase sjekkar det same på tenaren. Her er det for at feilen skal kome på
// norsk og med ein gong, ikkje etter ein tur over nettet.

export const MIN_LENGDE = 8;

/** bcrypt kuttar etter 72 byte utan å seie frå. Æ, ø og å er to byte kvar. */
export const MAKS_BYTE = 72;

/** Feilmeldinga for eit mellombels passord superadmin har skrive, eller null. */
export function sjekkPassord(passord: string): string | null {
  if (passord.length < MIN_LENGDE) return `Passordet må ha minst ${MIN_LENGDE} tegn.`;
  if (new TextEncoder().encode(passord).length > MAKS_BYTE) return "Passordet er for langt.";
  return null;
}

/** Feilmeldinga for eit nytt passord skrive to gonger, eller null. */
export function sjekkNyttPassord(nytt: string, gjenta: string): string | null {
  const feil = sjekkPassord(nytt);
  if (feil) return feil.replace("Passordet", "Det nye passordet");
  if (nytt !== gjenta) return "De to passordene er ikke like.";
  return null;
}

/**
 * Supabase svarar på engelsk. Koden er stabil, teksten er det ikkje, så koden
 * blir sjekka først.
 */
export function norskPassordFeil(feil: { code?: string; message?: string } | null | undefined): string {
  const kode = feil?.code ?? "";
  const tekst = (feil?.message ?? "").toLowerCase();
  if (kode === "same_password" || tekst.includes("different from the old"))
    return "Velg et annet passord enn det du fikk tildelt.";
  if (kode === "weak_password" || tekst.includes("weak") || tekst.includes("at least"))
    return "Passordet er for svakt. Velg et lengre passord.";
  if (tekst.includes("failed to fetch") || tekst.includes("network"))
    return "Fikk ikke kontakt med serveren. Sjekk nettet.";
  return "Klarte ikke å endre passordet. Prøv igjen.";
}

/**
 * Eit passord som kan lesast opp over telefon – same slag som serverfunksjonen
 * lagar når klienten ikkje sender noko.
 *
 * Utan I, O, 0 og 1: dei blir høyrde og skrivne feil. Alfabetet MÅ ha 32 teikn:
 * `b % 32` er berre jamt fordelt fordi 256 går opp i 32. Eitt teikn til, og
 * nokre teikn kjem 14 % oftare utan at noko klagar.
 */
export function lagPassord(): string {
  const tegn = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  const ut = Array.from(bytes, (b) => tegn[b % tegn.length]);
  return `${ut.slice(0, 5).join("")}-${ut.slice(5, 10).join("")}-${ut.slice(10).join("")}`;
}
