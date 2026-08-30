import { prisma } from "./prisma";

function hashKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

export async function checkRateLimitDb({ scope, key, limit, windowMs }) {
  try {
    const now = new Date();
    const bucketKey = hashKey(key);
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitBucket.findUnique({
        where: { scope_bucketKey: { scope, bucketKey } },
      });

      if (!existing) {
        await tx.rateLimitBucket.create({
          data: {
            scope,
            bucketKey,
            hits: 1,
            expiresAt: new Date(now.getTime() + windowMs),
          },
        });
        return { allowed: true, hits: 1, expiry: new Date(now.getTime() + windowMs) };
      }

      if (existing.expiresAt <= now) {
        await tx.rateLimitBucket.update({
          where: { id: existing.id },
          data: { hits: 1, expiresAt: new Date(now.getTime() + windowMs), updatedAt: now },
        });
        return { allowed: true, hits: 1, expiry: new Date(now.getTime() + windowMs) };
      }

      const hits = existing.hits + 1;
      await tx.rateLimitBucket.update({
        where: { id: existing.id },
        data: { hits, updatedAt: now },
      });
      return { allowed: hits <= limit, hits, expiry: existing.expiresAt };
    });

    if (!result.allowed && result.expiry) {
      const retryAfter = Math.max(1, Math.ceil((result.expiry.getTime() - Date.now()) / 1000));
      return { allowed: false, retryAfter, hits: result.hits, degraded: false };
    }
    return { allowed: true, retryAfter: 0, hits: result.hits, degraded: false };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("DB rate limiter unavailable, falling back to fail-open:", error.message);
    }
    return { allowed: true, retryAfter: 0, hits: 0, degraded: true };
  }
}
