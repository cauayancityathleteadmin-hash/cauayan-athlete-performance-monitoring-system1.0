import crypto from "crypto";

const FORMAT = "cauayan-backup-v1";
const KEY_CONTEXT = "cauayan-athlete-backup-encryption-v1";
const IV_BYTES = 12;

function keyFor(secret) {
  return crypto.createHash("sha256").update(`${KEY_CONTEXT}:${secret}`).digest();
}

function encryptionKeys() {
  const secrets = [process.env.BACKUP_ENCRYPTION_KEY, process.env.NEXTAUTH_SECRET]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const unique = [...new Set(secrets)];
  if (!unique.length) throw new Error("Backup encryption is not configured.");
  return unique.map(keyFor);
}

function encryptionKey() {
  return encryptionKeys()[0];
}

export function encodeBackupPayload(payload) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(FORMAT, "utf8"));
  const data = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return JSON.stringify({
    format: FORMAT,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

export function decodeBackupPayload(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error("The stored backup is not valid JSON.");
  }

  // Snapshots created before encryption was introduced are plaintext JSON.
  if (envelope?.format !== FORMAT) return envelope;

  if (typeof envelope.iv !== "string" || typeof envelope.tag !== "string" || typeof envelope.data !== "string") {
    throw new Error("The stored backup is not a valid encrypted snapshot.");
  }

  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const data = Buffer.from(envelope.data, "base64");
  if (iv.length !== IV_BYTES || tag.length !== 16 || !data.length) {
    throw new Error("The stored backup is not a valid encrypted snapshot.");
  }

  let lastError;
  for (const key of encryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(FORMAT, "utf8"));
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
      return JSON.parse(plain);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error("The stored backup could not be decrypted.", { cause: lastError });
}
