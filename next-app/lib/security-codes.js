import bcrypt from "bcryptjs";

export const APPROVAL_CODE_MINUTES = 24 * 60;
export const APPROVAL_CODE_EXPIRY_MS = APPROVAL_CODE_MINUTES * 60 * 1000;

export function generateApprovalCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashApprovalCode(code) {
  return bcrypt.hashSync(String(code), 10);
}

export function verifyApprovalCode(code, hash) {
  if (!code || !hash) return false;
  return bcrypt.compareSync(String(code).trim(), hash);
}