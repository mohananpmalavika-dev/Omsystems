import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string | null | undefined,
) {
  if (!encoded) return false;
  if (isLegacyBcryptHash(encoded)) {
    try {
      // bcryptjs recognizes $2a$/$2b$. Normalize $2y$ records produced by
      // some older password tools before comparing them.
      return await bcrypt.compare(password, encoded.replace(/^\$2y\$/, "$2b$"));
    } catch {
      return false;
    }
  }

  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function passwordHashAlgorithm(encoded: string | null | undefined) {
  if (!encoded) return "missing" as const;
  if (encoded.startsWith("scrypt$")) return "scrypt" as const;
  if (isLegacyBcryptHash(encoded)) return "bcrypt" as const;
  return "unsupported" as const;
}

export function passwordNeedsRehash(encoded: string | null | undefined) {
  return passwordHashAlgorithm(encoded) === "bcrypt";
}

function isLegacyBcryptHash(encoded: string) {
  return /^\$2[aby]\$\d{2}\$/.test(encoded);
}
