const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map();

function now() {
  return Date.now();
}

export function isLocked(identifier) {
  const entry = attempts.get(identifier);
  if (!entry) return { locked: false, retryAfter: 0 };
  if (entry.lockedUntil && now() < entry.lockedUntil) {
    return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - now()) / 1000) };
  }
  if (entry.lockedUntil) {
    attempts.delete(identifier);
    return { locked: false, retryAfter: 0 };
  }
  return { locked: false, retryAfter: 0 };
}

export function recordFailure(identifier) {
  const entry = attempts.get(identifier) || { count: 0, firstFailureAt: 0, lockedUntil: 0 };
  if (entry.lockedUntil && now() < entry.lockedUntil) return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - now()) / 1000) };
  if (entry.lockedUntil) {
    attempts.delete(identifier);
    attempts.set(identifier, { count: 1, firstFailureAt: now(), lockedUntil: 0 });
    return { locked: false, retryAfter: 0 };
  }
  entry.count += 1;
  if (now() - entry.firstFailureAt > LOCK_WINDOW_MS) {
    entry.count = 1;
    entry.firstFailureAt = now();
  } else if (entry.firstFailureAt === 0) {
    entry.firstFailureAt = now();
  }
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now() + LOCK_WINDOW_MS;
    entry.count = 0;
    return { locked: true, retryAfter: LOCK_WINDOW_MS / 1000 };
  }
  attempts.set(identifier, entry);
  return { locked: false, retryAfter: 0, remaining: MAX_ATTEMPTS - entry.count };
}

export function recordSuccess(identifier) {
  attempts.delete(identifier);
}

export function isWithinWindow(entry, nowMs) {
  return entry.firstFailureAt && nowMs - entry.firstFailureAt < LOCK_WINDOW_MS;
}
