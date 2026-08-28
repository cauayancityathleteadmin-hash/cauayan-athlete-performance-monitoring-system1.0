const attempts = new Map();
let sweepCounter = 0;

export function checkRateLimit(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return { allowed: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  recent.push(now);
  attempts.set(key, recent);

  // Occasionally prune expired buckets to avoid unbounded memory growth.
  sweepCounter += 1;
  if (sweepCounter % 1000 === 0) {
    for (const [bucketKey, times] of attempts) {
      const active = times.filter((time) => now - time < windowMs);
      if (active.length === 0) attempts.delete(bucketKey);
      else attempts.set(bucketKey, active);
    }
  }

  return { allowed: true, retryAfter: 0 };
}

export function createRateLimiter(limit, windowMs) {
  return (key) => checkRateLimit(key, limit, windowMs);
}

export const rateLimiters = {
  login: createRateLimiter(5, 15 * 60 * 1000),
  register: createRateLimiter(3, 60 * 60 * 1000),
  api: createRateLimiter(100, 60 * 1000),
  passwordReset: createRateLimiter(3, 60 * 60 * 1000),
};