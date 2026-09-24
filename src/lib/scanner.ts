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
