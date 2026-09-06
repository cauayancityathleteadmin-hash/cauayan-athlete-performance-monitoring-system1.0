const attempts = new Map();

export function checkRateLimit(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return { allowed: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  recent.push(now);
  attempts.set(key, recent);
  return { allowed: true, retryAfter: 0 };
}