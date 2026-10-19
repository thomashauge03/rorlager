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

export type Kameraevne = {
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
};

/**
 * Hovudkameraet bak på ein Android-telefon. Nettlesaren vel av og til
 * vidvinkelen når han får «environment», og han har fast fokus: ein QR-kode på
 * 22 mm blir uskarp same kor nær ein held telefonen, medan kameraappen – som
 * brukar hovudkameraet – les han med ein gong. Chrome kallar kamera «camera2 N,
 * facing back», og N = 0 er hovudkameraet. Andre namn (iPhone) blir ikkje rørte.
 */
export function hovudkamera(einingar: { deviceId: string; label: string; kind: string }[]): string | null {
  const bak = einingar
    .filter((e) => e.kind === "videoinput")
    .map((e) => ({ id: e.deviceId, nr: /camera2 (\d+), facing back/i.exec(e.label)?.[1] }))
    .filter((e): e is { id: string; nr: string } => e.nr !== undefined)
    .sort((a, b) => Number(a.nr) - Number(b.nr));
  return bak[0]?.id ?? null;
}

/** 3× les dei små etikettane best, så kameraet blir låst der */
const FAST_ZOOM = 3;

/** Zoomen kameraet blir låst på, eller null når appen ikkje kan styre zoom */
export function fastZoom(evne: Kameraevne["zoom"]): number | null {
  if (!evne || evne.max <= evne.min) return null;
  return Math.max(evne.min, Math.min(FAST_ZOOM, evne.max));
}

/**
 * Punktet ein trykte på i kamerabiletet, som 0–1 i sjølve kamerabiletet.
 * Biletet er «object-cover»: skalert til å fylle ruta og skore av på
 * langsidene, så eit trykk i ruta må reknast om til punktet i originalen.
 */
export function fokuspunkt(
  trykk: { x: number; y: number },
  rute: { w: number; h: number },
  bilete: { w: number; h: number },
): { x: number; y: number } {
  if (!bilete.w || !bilete.h || !rute.w || !rute.h) return { x: 0.5, y: 0.5 };
  const skala = Math.max(rute.w / bilete.w, rute.h / bilete.h);
  const visteW = bilete.w * skala;
  const visteH = bilete.h * skala;
  const x = (trykk.x - (rute.w - visteW) / 2) / visteW;
  const y = (trykk.y - (rute.h - visteH) / 2) / visteH;
  const klem = (v: number) => Math.min(1, Math.max(0, v));
  return { x: klem(x), y: klem(y) };
}

/**
 * Stega for å fokusere på nytt når ein trykkjer, ut frå kva kameraet kan.
 *
 * Mange Android-kamera kan berre «continuous» og ikkje «single-shot». Då gjorde
 * eit trykk ingenting. Kontinuerleg fokus blir sett i gang på nytt ved å gå
 * innom «manual» – det er det som får linsa til å søkje att.
 */
/** Fokusvala frå Image Capture-utvidinga. TypeScript sine DOM-typar kjenner dei ikkje. */
export type Fokusval = { focusMode?: string; pointsOfInterest?: { x: number; y: number }[] };

export function fokussteg(
  modusar: string[] | undefined,
  punkt: { x: number; y: number } | null,
): { steg: Fokusval[]; tilbakeTilKontinuerleg: boolean } {
  const m = modusar ?? [];
  const poi: Fokusval = punkt ? { pointsOfInterest: [punkt] } : {};
  if (m.includes("single-shot")) {
    return {
      steg: [{ ...poi, focusMode: "single-shot" }],
      tilbakeTilKontinuerleg: m.includes("continuous"),
    };
  }
  if (m.includes("continuous")) {
    const steg: Fokusval[] = [];
    if (m.includes("manual")) steg.push({ focusMode: "manual" });
    steg.push({ ...poi, focusMode: "continuous" });
    return { steg, tilbakeTilKontinuerleg: false };
  }
  // Ingen fokusmodusar å styre, men punktet kan likevel hjelpe der det er støtta
  return { steg: punkt ? [poi] : [], tilbakeTilKontinuerleg: false };
}
