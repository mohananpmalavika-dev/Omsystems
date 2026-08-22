import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export function hashPassword(input) {
  if (!input) throw new Error("password_required");
  const salt = randomBytes(16);
  const derived = scryptSync(input, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(input, encoded) {
  if (!input || !encoded) return false;
  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = scryptSync(input, salt, expected.length, SCRYPT_OPTIONS);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createCryptoService() {
  return { hash: hashPassword, verify: verifyPassword };
}
