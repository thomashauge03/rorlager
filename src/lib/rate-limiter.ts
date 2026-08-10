/**
 * Grensa finst fordi eit skjema som ikkje svarar med det same, blir trykt på
 * fleire gonger – og då hamnar same bestillinga i basen i fleire eksemplar.
 * Ho ligg i nettlesaren og er difor inga vakt mot misbruk, berre mot utolmod.
 * Glidande vindauge per handling, slik at ei treg innsending ikkje låser andre.
 */
const attempts: Record<string, number[]> = {};

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (!attempts[key]) attempts[key] = [];

  // Forsøk som har falle ut av vindauget skal ikkje telje med lenger
  attempts[key] = attempts[key].filter((t) => now - t < windowMs);

  if (attempts[key].length >= maxAttempts) {
    const oldest = attempts[key][0];
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }

  attempts[key].push(now);
  return { allowed: true, retryAfterMs: 0 };
}
