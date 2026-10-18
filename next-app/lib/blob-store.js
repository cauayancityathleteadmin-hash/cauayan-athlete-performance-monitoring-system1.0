import { put, list, del, get } from "@vercel/blob";

const PREFIX = "db-backups/";
const MAX_SYSTEM_BACKUPS = 20;

export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function saveBackupBlob({ kind, id, payload }) {
  if (!blobEnabled()) return null;
  const name = `${PREFIX}${kind}-${id ? `${id}-` : ""}${stamp()}.json`;
  // CR-02 fix: backups contain password hashes, reset tokens and athlete PII.
  // Private blobs require the BLOB_READ_WRITE_TOKEN to read, so a leaked URL
  // is no longer an open download.
  const { url } = await put(name, payload, { access: "private", contentType: "application/json", addRandomSuffix: true });
  if (kind === "system") await pruneSystemBackups(MAX_SYSTEM_BACKUPS);
  return { url, name };
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
  // Private blobs require the token; @vercel/blob's get() attaches it.
  const blob = await get(url);
  if (!blob) throw new Error("The stored backup could not be downloaded.");
  const response = await fetch(blob.downloadUrl);
  if (!response.ok) throw new Error("The stored backup could not be downloaded.");
  return response.json();
}