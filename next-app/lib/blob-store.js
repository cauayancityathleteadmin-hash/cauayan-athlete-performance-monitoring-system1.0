import { put, list, del, get } from "@vercel/blob";
import { decodeBackupPayload, encodeBackupPayload } from "./backup-crypto";

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
  const name = `${PREFIX}${kind}-${id ? `${id}-` : ""}${stamp()}.json.enc`;
  // Backups contain password hashes, reset tokens and athlete PII. Encrypt the
  // payload first, then prefer private blob storage. If this store does not
  // support private access, an encrypted public blob is still safe to expose:
  // only ciphertext and a random URL are visible without the server key.
  const encrypted = encodeBackupPayload(payload);
  let stored;
  try {
    stored = await put(name, encrypted, { access: "private", contentType: "application/octet-stream", addRandomSuffix: true });
  } catch (error) {
    console.warn("Private blob storage is unavailable; storing an encrypted backup in public blob storage.", error?.message);
    stored = await put(name, encrypted, { access: "public", contentType: "application/octet-stream", addRandomSuffix: true });
  }
  if (kind === "system" && prune) await pruneSystemBackups(MAX_SYSTEM_BACKUPS);
  return { url: stored.url, name };
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

export async function deleteBackupBlob(url) {
  await del(url);
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
  const text = await new Response(result.stream).text();
  return decodeBackupPayload(text);
}

export async function migratePublicSystemBackups() {
  if (!blobEnabled()) return { total: 0, migrated: 0, failed: 0, failures: [] };
  const backups = await listSystemBackups();
  // Public snapshots ending in .enc are already encrypted; only old public
  // plaintext snapshots need migration.
  const legacy = backups.filter((b) => !isPrivateBlobUrl(b.url) && !b.pathname.endsWith(".enc"));
  const failures = [];
  let migrated = 0;

  for (const backup of legacy) {
    let stage = "read";
    try {
      const snapshot = await fetchBackupBlob(backup.url);
      if (!snapshot || !snapshot.tables) throw new Error("Not a full-system backup.");
      stage = "save";
      const stored = await saveBackupBlob({
        kind: "system",
        payload: JSON.stringify(snapshot),
        prune: false,
      });
      if (!stored) throw new Error("Backup storage is not configured.");
      stage = "verify";
      const copy = await fetchBackupBlob(stored.url);
      if (!copy || copy.createdAt !== snapshot.createdAt || Object.keys(copy.tables || {}).length !== Object.keys(snapshot.tables).length) {
        throw new Error("The encrypted copy could not be verified.");
      }
      stage = "delete";
      await del(backup.url);
      migrated += 1;
    } catch (error) {
      failures.push(`${backup.pathname} (${stage})`);
      console.error("Legacy backup migration failed:", backup.pathname, error);
    }
  }

  if (failures.length === 0 && migrated > 0) await pruneSystemBackups(MAX_SYSTEM_BACKUPS);
  return { total: legacy.length, migrated, failed: failures.length, failures };
}