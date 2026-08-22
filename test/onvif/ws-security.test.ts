import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  WsSecurityManager,
  PASSWORD_DIGEST_URI,
  PASSWORD_TEXT_URI,
  BASE64_ENCODING_URI,
} from "../../src/onvif/security/ws-security.js";

describe("ONVIF WS-Security UsernameToken Cryptographic Suite", () => {
  it("computes mathematically correct PasswordDigest matching ONVIF specification", () => {
    const username = "admin";
    const password = "supervisorPassword123!";

    const result = WsSecurityManager.generateHeader({
      username,
      password,
      passwordType: "PasswordDigest",
    });

    expect(result.username).toBe(username);
    expect(result.passwordTypeUri).toBe(PASSWORD_DIGEST_URI);

    // Verify mathematical formula: Base64(SHA1(rawNonce + created + password))
    const rawNonceBytes = Buffer.from(result.nonceBase64, "base64");
    const createdBytes = Buffer.from(result.createdUtc, "utf8");
    const passwordBytes = Buffer.from(password, "utf8");

    const expectedDigest = createHash("sha1")
      .update(Buffer.concat([rawNonceBytes, createdBytes, passwordBytes]))
      .digest("base64");

    expect(result.passwordDigestOrText).toBe(expectedDigest);

    // Verify self-verification utility
    const isValid = WsSecurityManager.verifyPasswordDigest(
      password,
      result.passwordDigestOrText,
      result.nonceBase64,
      result.createdUtc,
    );
    expect(isValid).toBe(true);
  });

  it("generates standards-compliant XML security header structure", () => {
    const result = WsSecurityManager.generateHeader({
      username: "operator_user",
      password: "pass",
    });

    const xml = result.headerXml;
    expect(xml).toContain('<wsse:Security s:mustUnderstand="1"');
    expect(xml).toContain("<wsse:UsernameToken>");
    expect(xml).toContain("<wsse:Username>operator_user</wsse:Username>");
    expect(xml).toContain(`Type="${PASSWORD_DIGEST_URI}"`);
    expect(xml).toContain(`EncodingType="${BASE64_ENCODING_URI}"`);
    expect(xml).toContain(`<wsu:Created>${result.createdUtc}</wsu:Created>`);
  });

  it("applies camera clock offset compensation to prevent timestamp rejection", () => {
    const hostNow = Date.now();
    const cameraDriftMs = 120_000; // Camera clock is 2 minutes ahead

    const result = WsSecurityManager.generateHeader({
      username: "admin",
      password: "pass",
      clockOffsetMs: cameraDriftMs,
    });

    const createdTime = new Date(result.createdUtc).getTime();
    expect(createdTime).toBeGreaterThanOrEqual(hostNow + 119_000);
    expect(createdTime).toBeLessThanOrEqual(hostNow + 121_000);
  });

  it("supports PasswordText when cameras require plain text tokens", () => {
    const result = WsSecurityManager.generateHeader({
      username: "admin",
      password: "myPlainPassword",
      passwordType: "PasswordText",
    });

    expect(result.passwordTypeUri).toBe(PASSWORD_TEXT_URI);
    expect(result.passwordDigestOrText).toBe("myPlainPassword");
    expect(result.headerXml).toContain(`Type="${PASSWORD_TEXT_URI}">myPlainPassword</wsse:Password>`);
  });
});
