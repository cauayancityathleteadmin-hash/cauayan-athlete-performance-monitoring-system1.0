import { put, list, del, get } from "@vercel/blob";

const PREFIX = "db-backups/";
const MAX_SYSTEM_BACKUPS = 20;

export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function saveBackupBlob({ kind, id, payload, prune = true }) {
  if (!blobEnabled()) return null;
  const name = `${PREFIX}${kind}-${id ? `${id}-` : ""}${stamp()}.json`;
  // CR-02 fix: backups contain password hashes, reset tokens and athlete PII.
  // Private blobs require the BLOB_READ_WRITE_TOKEN to read, so a leaked URL
  // is no longer an open download.
  const { url } = await put(name, payload, { access: "private", contentType: "application/json", addRandomSuffix: true });
  if (kind === "system" && prune) await pruneSystemBackups(MAX_SYSTEM_BACKUPS);
  return { url, name };
}

function isPrivateBlobUrl(url) {
  try {
    return new URL(url).hostname.includes(".private.");
  } catch {
    return false;
  }
}

export async function listSystemBackups() {
  if (!blobEnabled()) return [];
  try {
    const { blobs } = await list({ prefix: PREFIX, mode: "expanded", limit: 200 });
    return blobs
      .filter((b) => b.pathname.includes("/system-"))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((b) => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt }));
  } catch (error) {
    console.error("Failed to list backups:", error);
    return [];
  }
}

async function pruneSystemBackups(keep) {
  try {
    const blobs = await listSystemBackups();
    if (blobs.length <= keep) return;
    const urls = blobs.slice(keep).map((b) => b.url);
    await del(urls);
  } catch (error) {
    console.error("Failed to prune old backups:", error);
  }
}

export async function fetchBackupBlob(url) {
  // @vercel/blob v2 returns the response body as a stream and requires an
  // explicit access mode. Private blobs need the token; old snapshots may
  // still be public, so try the expected mode first and fall back once.
  const expected = isPrivateBlobUrl(url) ? "private" : "public";
  let result = null;
  try {
    result = await get(url, { access: expected });
  } catch {
    result = await get(url, { access: expected === "private" ? "public" : "private" });
  }
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("The stored backup could not be downloaded.");
  }
  return new Response(result.stream).json();
}

export async function migratePublicSystemBackups() {
  if (!blobEnabled()) return { total: 0, migrated: 0, failed: 0, failures: [] };
  const backups = await listSystemBackups();
  const legacy = backups.filter((b) => !isPrivateBlobUrl(b.url));
  const failures = [];
  let migrated = 0;

  for (const backup of legacy) {
    try {
      const snapshot = await fetchBackupBlob(backup.url);
      if (!snapshot || !snapshot.tables) throw new Error("Not a full-system backup.");
      const stored = await saveBackupBlob({
        kind: "system",
        payload: JSON.stringify(snapshot),
        prune: false,
      });
      if (!stored) throw new Error("Private backup storage is not configured.");
      const copy = await fetchBackupBlob(stored.url);
      if (!copy || copy.createdAt !== snapshot.createdAt || Object.keys(copy.tables || {}).length !== Object.keys(snapshot.tables).length) {
        throw new Error("The private copy could not be verified.");
      }
      await del(backup.url);
      migrated += 1;
    } catch (error) {
      failures.push(backup.pathname);
      console.error("Legacy backup migration failed:", backup.pathname, error);
    }
  }

  if (failures.length === 0 && migrated > 0) await pruneSystemBackups(MAX_SYSTEM_BACKUPS);
  return { total: legacy.length, migrated, failed: failures.length, failures };
}