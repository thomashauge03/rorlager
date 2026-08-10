/**
 * Simple client-side rate limiter to prevent spam submissions.
 * Uses a sliding window approach per action key.
 */
const attempts: Record<string, number[]> = {};

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (!attempts[key]) attempts[key] = [];

  // Remove expired entries
  attempts[key] = attempts[key].filter((t) => now - t < windowMs);

  if (attempts[key].length >= maxAttempts) {
    const oldest = attempts[key][0];
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }

  attempts[key].push(now);
  return { allowed: true, retryAfterMs: 0 };
}
