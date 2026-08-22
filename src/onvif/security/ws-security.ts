import { createHash, randomBytes } from "node:crypto";

export interface WsSecurityCredentials {
  username: string;
  password?: string;
  passwordType?: "PasswordDigest" | "PasswordText";
  clockOffsetMs?: number; // Device time - Local time offset in ms
}

export interface WsSecurityHeaderResult {
  username: string;
  passwordDigestOrText: string;
  nonceBase64: string;
  createdUtc: string;
  passwordTypeUri: string;
  headerXml: string;
}

export const PASSWORD_DIGEST_URI =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest";
export const PASSWORD_TEXT_URI =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
export const BASE64_ENCODING_URI =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";

export class WsSecurityManager {
  /**
   * Generates a standards-compliant ONVIF WS-Security UsernameToken header XML.
   * Standard ONVIF formula:
   *   Password_Digest = Base64(SHA-1(raw_nonce_bytes + created_timestamp_utf8 + password_utf8))
   */
  static generateHeader(credentials: WsSecurityCredentials): WsSecurityHeaderResult {
    const {
      username,
      password = "",
      passwordType = "PasswordDigest",
      clockOffsetMs = 0,
    } = credentials;

    // Calculate created timestamp adjusted for camera clock drift
    const adjustedTime = new Date(Date.now() + clockOffsetMs);
    const createdUtc = adjustedTime.toISOString();

    // 16 cryptographically random bytes for nonce
    const rawNonceBytes = randomBytes(16);
    const nonceBase64 = rawNonceBytes.toString("base64");

    if (passwordType === "PasswordText") {
      const headerXml = `
  <wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>${this.escapeXml(username)}</wsse:Username>
      <wsse:Password Type="${PASSWORD_TEXT_URI}">${this.escapeXml(password)}</wsse:Password>
      <wsse:Nonce EncodingType="${BASE64_ENCODING_URI}">${nonceBase64}</wsse:Nonce>
      <wsu:Created>${createdUtc}</wsu:Created>
    </wsse:UsernameToken>
  </wsse:Security>`.trim();

      return {
        username,
        passwordDigestOrText: password,
        nonceBase64,
        createdUtc,
        passwordTypeUri: PASSWORD_TEXT_URI,
        headerXml,
      };
    }

    // PasswordDigest calculation:
    // sha1(raw_nonce + created_string + password_string)
    const createdBytes = Buffer.from(createdUtc, "utf8");
    const passwordBytes = Buffer.from(password, "utf8");
    const combinedBuffer = Buffer.concat([rawNonceBytes, createdBytes, passwordBytes]);

    const passwordDigest = createHash("sha1").update(combinedBuffer).digest("base64");

    const headerXml = `
  <wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>${this.escapeXml(username)}</wsse:Username>
      <wsse:Password Type="${PASSWORD_DIGEST_URI}">${passwordDigest}</wsse:Password>
      <wsse:Nonce EncodingType="${BASE64_ENCODING_URI}">${nonceBase64}</wsse:Nonce>
      <wsu:Created>${createdUtc}</wsu:Created>
    </wsse:UsernameToken>
  </wsse:Security>`.trim();

    return {
      username,
      passwordDigestOrText: passwordDigest,
      nonceBase64,
      createdUtc,
      passwordTypeUri: PASSWORD_DIGEST_URI,
      headerXml,
    };
  }

  /**
   * Helper to verify a PasswordDigest given the raw nonce, timestamp, and cleartext password
   */
  static verifyPasswordDigest(
    expectedCleartextPassword: string,
    receivedDigest: string,
    nonceBase64: string,
    createdUtc: string,
  ): boolean {
    const rawNonceBytes = Buffer.from(nonceBase64, "base64");
    const createdBytes = Buffer.from(createdUtc, "utf8");
    const passwordBytes = Buffer.from(expectedCleartextPassword, "utf8");

    const combinedBuffer = Buffer.concat([rawNonceBytes, createdBytes, passwordBytes]);
    const computedDigest = createHash("sha1").update(combinedBuffer).digest("base64");

    return computedDigest === receivedDigest;
  }

  private static escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
