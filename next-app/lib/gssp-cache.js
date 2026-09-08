// TTL cache for read-heavy getServerSideProps payloads. Values are stored as
// JSON strings so every hit returns a brand-new object (no shared references
// between requests and no stale-mutation hazards). Loader errors and
// non-serializable results fall back to a fresh, uncached computation.

const cache = new Map();
const inflight = new Map();
const MAX_ENTRIES = 100;

export async function gsspData(key, ttlMs, loader) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.time < ttlMs) {
    return JSON.parse(hit.json);
  }

  const pending = inflight.get(key);
  if (pending) {
    const json = await pending;
    return json != null ? JSON.parse(json) : loader();
  }

  const promise = (async () => {
    try {
      return JSON.stringify(await loader());
    } catch (error) {
      return null;
    }
  })();
  inflight.set(key, promise);
  try {
    const json = await promise;
    if (json == null) return loader();
    cache.set(key, { time: Date.now(), json });
    if (cache.size > MAX_ENTRIES) {
      for (const [k, v] of cache) {
        if (Date.now() - v.time >= ttlMs) cache.delete(k);
      }
      if (cache.size > MAX_ENTRIES) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1].time)[0]?.[0];
        if (oldest) cache.delete(oldest);
      }
    }
    return JSON.parse(json);
  } finally {
    inflight.delete(key);
  }
}