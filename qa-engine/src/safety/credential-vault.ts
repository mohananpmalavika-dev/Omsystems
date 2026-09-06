/**
 * Credential Vault & Secret Masking
 *
 * Implements AES-256-GCM encryption for credentials at rest,
 * and high-fidelity masking for logs, screenshots, and traces.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const DEFAULT_ENCRYPTION_KEY = process.env.QA_ENCRYPTION_SECRET || "kryptovision-qa-crawler-master-secret-key-2026!";

// Derive 32-byte key from string
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt plaintext credentials using AES-256-GCM
 */
export function encryptCredential(plaintext: string, secret: string = DEFAULT_ENCRYPTION_KEY): string {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const key = deriveKey(secret);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt AES-256-GCM encrypted credentials
 */
export function decryptCredential(ciphertext: string, secret: string = DEFAULT_ENCRYPTION_KEY): string {
  if (!ciphertext) return "";
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return ciphertext; // Return as is if not encrypted format
    const [ivHex, authTagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = deriveKey(secret);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[CredentialVault] Decryption failed:", error);
    return "";
  }
}

/**
 * Mask sensitive values in strings (passwords, tokens, authorization headers)
 */
export function maskSensitiveData(input: string): string {
  if (!input) return input;
  let masked = input;

  // Mask bearer tokens
  masked = masked.replace(/Bearer\s+[A-Za-z0-9-_=.]+/gi, "Bearer [REDACTED_TOKEN]");

  // Mask authorization headers
  masked = masked.replace(/("?authorization"?\s*:\s*)"[^"]+"/gi, '$1"[REDACTED_AUTH]"');

  // Mask password fields in JSON or query params
  masked = masked.replace(/(password|passwd|pwd|secret|api[-_]?key|refresh[-_]?token|access[-_]?token)\s*([=:])\s*["']?[^&"'\s]+["']?/gi, "$1$2[REDACTED]");

  // Mask cookies
  masked = masked.replace(/("?cookie"?\s*:\s*)"[^"]+"/gi, '$1"[REDACTED_COOKIE]"');
  masked = masked.replace(/(sentinel_access|session|token)=[^;&\s]+/gi, "$1=[REDACTED]");

  return masked;
}

/**
 * Mask sensitive fields in an object (recursively)
 */
export function maskSensitiveObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;

  const sensitiveKeys = new Set([
    "password",
    "passwd",
    "pwd",
    "token",
    "authorization",
    "cookie",
    "session",
    "apikey",
    "api-key",
    "api_key",
    "secret",
    "refreshtoken",
    "refresh-token",
    "refresh_token",
    "accesstoken",
    "access-token",
    "access_token",
  ]);

  const result: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.has(lowerKey)) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      result[key] = maskSensitiveObject(value);
    } else if (typeof value === "string") {
      result[key] = maskSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
