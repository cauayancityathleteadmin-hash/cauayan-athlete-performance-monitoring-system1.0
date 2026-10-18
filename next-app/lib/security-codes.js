import bcrypt from "bcryptjs";
import crypto from "crypto";

export const APPROVAL_CODE_MINUTES = 24 * 60;
export const APPROVAL_CODE_EXPIRY_MS = APPROVAL_CODE_MINUTES * 60 * 1000;

export function generateApprovalCode() {
  // Use a CSPRNG instead of Math.random for security-sensitive codes.
  return String(crypto.randomInt(100000, 1000000));
}

export function hashApprovalCode(code) {
  return bcrypt.hashSync(String(code), 10);
}

export function verifyApprovalCode(code, hash) {
  if (!code || !hash) return false;
  return bcrypt.compareSync(String(code).trim(), hash);
}