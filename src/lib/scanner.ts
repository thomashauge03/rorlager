// Tolkinga av det kameraet les. Reine funksjonar, så dei kan prøvast utan
// kamera. Sjølve lesaren ligg i components/Scanner.tsx.

/**
 * Plukkar ut koden frå det som blei lese. Stien /r/<kode> eller /vare/<kode>
 * blir kjend att uansett vertsnamn – etikettar trykte før appen fekk sitt
 * endelege domene skal framleis virke. Ein naken kode (det som står under
 * QR-en, eller talet i ein strekkode) er òg god nok.
 */
export function kodeFraSkann(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const path = text.match(/\/(?:r|vare)\/([^/?#\s]+)/i);
  if (path) {
    try {
      return decodeURIComponent(path[1]).toLowerCase();
    } catch {
      // Ei øydelagd %-koding skal gi koden som han står, ikkje ein krasj
      return path[1].toLowerCase();
    }
  }

  if (/^[a-z0-9._-]{2,64}$/i.test(text)) return text.toLowerCase();
  return null;
}

/** Vara ein kode peikar på: QR-koden først, så varenummeret. */
export function finnVare<T extends { qr_slug: string; sku: string | null }>(kode: string, varer: T[]): T | null {
  const k = (kode ?? "").trim().toLowerCase();
  if (!k) return null;
  return (
    varer.find((v) => (v.qr_slug ?? "").toLowerCase() === k) ??
    varer.find((v) => (v.sku ?? "").trim().toLowerCase() === k) ??
    null
  );
}

/*
 * QR Admin sine etikettar er dynamiske: koden inneheld ikkje lenkja hit, men
 * QR Admin si eiga adresse med id-en til rada (…/q?k=<id>). Den sida slår opp
 * lenkja ved kvar skanning og sender vidare, så lenkja kan bytast utan at noko
 * blir trykt på nytt. Kameraappen følgjer omdirigeringa; skannaren vår les
 * berre teksten i koden, og kalla kvar einaste av dei framand.
 *
 * Vi gjer same oppslaget som QR Admin og les koden lenkja peikar på.
 *
 * Nøkkelen er anon-nøkkelen til QR Admin. Han er offentleg – han ligg i
 * nettlesarkoden til QR Admin – og gir berre lesetilgang til katalogen, som
 * QR-kodane uansett viser fram. Adressa er hardkoda: ein etikett skal ikkje
 * kunne styre kvar oppslaget går.
 */
const QR_ADMIN_VERTAR = new Set(["qr-admin-fawn.vercel.app", "qr.techauge.no"]);
const QR_ADMIN_BASE = "https://thypecauthhleewecgfu.supabase.co";
const QR_ADMIN_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeXBlY2F1dGhobGVld2VjZ2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTczNTUsImV4cCI6MjA5NjQ5MzM1NX0.L84EjBUxsRyVFAga1L-IZJ3krlcej4f2WmP03-rwXnI";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Id-en i ein QR Admin-etikett, eller null når koden ikkje er ein. */
function qrAdminId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL((raw ?? "").trim());
  } catch {
    return null;
  }
  // Her avgjer vertsnamnet, ikkje stien: «/q» åleine er for vanleg til å bety noko
  if (!QR_ADMIN_VERTAR.has(url.hostname) || url.pathname.replace(/\/$/, "") !== "/q") return null;
  const id = url.searchParams.get("k")?.trim().toLowerCase() ?? "";
  return UUID.test(id) ? id : null;
}

/** Lenkja koden peikar på no. null = finst ikkje, eller er ikkje ei lenkje. Kastar ved nettfeil. */
export async function hentQrAdminLenke(id: string): Promise<string | null> {
  const svar = await fetch(`${QR_ADMIN_BASE}/rest/v1/categories?id=eq.${id}&select=qr_type,qr_data`, {
    headers: { apikey: QR_ADMIN_ANON, authorization: `Bearer ${QR_ADMIN_ANON}` },
    // I eit lager med dårleg dekning er eit svar etter 8 s like godt som ingen
    signal: AbortSignal.timeout(8000),
    credentials: "omit",
    redirect: "error",
  });
  if (!svar.ok) throw new Error(`QR Admin svarte ${svar.status}`);
  const rader = (await svar.json()) as { qr_type: string | null; qr_data: { url?: string } | null }[];
  const lenke = rader[0]?.qr_type === "url" ? rader[0].qr_data?.url?.trim() : null;
  return lenke || null;
}

export type Skannsvar = { kode: string | null; grunn?: string };

/**
 * kodeFraSkann, pluss oppslaget for QR Admin-etikettar. Kastar aldri – skannaren
 * held fram med neste bilete uansett kva som skjer her.
 */
export async function kodeFraSkannMedOppslag(
  raw: string,
  hent: (id: string) => Promise<string | null> = hentQrAdminLenke,
): Promise<Skannsvar> {
  const id = qrAdminId(raw);
  if (!id) return { kode: kodeFraSkann(raw) };

  let lenke: string | null;
  try {
    lenke = await hent(id);
  } catch {
    return { kode: null, grunn: "Fikk ikke slått opp QR Admin-koden. Sjekk nettet og prøv igjen." };
  }
  // Éitt hopp, og berre til ei rørside: ein naken tekst i QR Admin er ikkje ein kode her
  if (!lenke || qrAdminId(lenke) || !/^https?:\/\//i.test(lenke)) return { kode: null };
  const kode = kodeFraSkann(lenke);
  return { kode: /\/(?:r|vare)\//i.test(lenke) ? kode : null };
}
