/**
 * Tasting i et felt: hvor mye av teksten som står der på bilde `f`, og
 * hvilken tast som er nede akkurat nå (tasten lyser i tre bilder).
 */
export const skriving = (tekst: string, fra: number, til: number, f: number) => {
  const n = tekst.length;
  const per = (til - fra) / n;
  const i = Math.floor((f - fra) / per);
  const skrevet = f < fra ? "" : tekst.slice(0, Math.min(n, i + 1));
  const nede = f >= fra && i < n && f - fra - i * per < Math.min(3, per * 0.8) ? tekst[i] : undefined;
  return { skrevet, nede };
};

/** Bildene hvert tegn kommer på — til tastelydene. */
export const tastetider = (tekst: string, fra: number, til: number) =>
  Array.from(tekst, (_, i) => fra + (i * (til - fra)) / tekst.length).filter((_, i) => tekst[i] !== " ");
