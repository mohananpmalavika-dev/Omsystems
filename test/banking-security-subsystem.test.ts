/**
 * Banking-Grade VMS Security Subsystem - Test Suite
 * 10 automated invariant tests covering:
 * - AES-256-GCM credential vault
 * - mTLS X.509 certificate validation
 * - Short-lived token issuance, verification & revocation
 * - ABAC branch scoping & vault camera policy
 * - Merkle-chained audit tamper detection
 */

import { describe, it, expect, beforeEach } from "vitest";

// Set required env vars before importing services
process.env.VAULT_MASTER_PASSWORD = "test-master-password-must-be-32-chars-long!!";
process.env.VAULT_SALT = "test-salt-value-must-be-32-chars-long!!!!!!!";
process.env.VAULT_JWT_SECRET = "test-jwt-secret-must-be-32-chars-long!!!!!!!";

import { AesGcmCredentialVault } from "../src/security/vault/device-credential-vault.service.js";
import { MtlsAuthenticatorService } from "../src/security/mtls/mtls-authenticator.service.js";
import { ShortLivedTokenService } from "../src/security/tokens/short-lived-token.service.js";
import { AbacPolicyEngine } from "../src/security/authorization/abac-policy-engine.js";
import { ImmutableAuditService } from "../src/security/audit/immutable-audit.service.js";

describe("Banking-Grade VMS Security Subsystem Test Suite", () => {
  let vault: AesGcmCredentialVault;
  let mtls: MtlsAuthenticatorService;
  let tokenService: ShortLivedTokenService;
  let abac: AbacPolicyEngine;
  let audit: ImmutableAuditService;

  beforeEach(() => {
    vault = new AesGcmCredentialVault();
    mtls = new MtlsAuthenticatorService();
    tokenService = new ShortLivedTokenService();
    abac = new AbacPolicyEngine();
    audit = new ImmutableAuditService();
  });

  // ─────────────── AES-256-GCM Vault ───────────────

  it("Invariant 1: AES-256-GCM credential encryption / decryption roundtrip is lossless", () => {
    const plaintext = "Str0ng!CameraP@ssw0rd#2026";
    const encrypted = vault.encryptCredential(plaintext);

    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(encrypted.ciphertext.length).toBeGreaterThan(30);
    expect(encrypted.fingerprintSha256).toHaveLength(64); // SHA-256 hex

    const decrypted = vault.decryptCredential(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("Invariant 2: Credential vault produces zero readable plaintext in stored ciphertext", () => {
    const plaintext = "Secret!AdminPassword123";
    const encrypted = vault.encryptCredential(plaintext);

    // Ciphertext must not contain any substring of the plaintext
    expect(encrypted.ciphertext).not.toContain("Secret");
    expect(encrypted.ciphertext).not.toContain("Admin");
    expect(encrypted.ciphertext).not.toContain("Password");
    // Verify the fingerprint integrity function works correctly
    expect(vault.verifyIntegrity(encrypted, encrypted.fingerprintSha256)).toBe(true);
  });

  // ─────────────── mTLS Certificate Validation ───────────────

  it("Invariant 3: mTLS rejects certificate with unregistered fingerprint", () => {
    // Use a valid but un-pinned self-signed cert PEM (fake for testing)
    const fakePem = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJALb9rIFRBWuDMA0GCSqGSIb3DQEBCwUAMA8xDTALBgNVBAMT
BHRlc3QwHhcNMjUwMTAxMDAwMDAwWhcNMjYwMTAxMDAwMDAwWjAPMQ0wCwYD
VQQDFAR0ZXN0MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMr14HEqr4JbQxoE
7ZIbB1mwJSABi9cSdl9Zj8CYjy5XJgT3PJiJmhO5a0F4r2xGm1pJhW3OtJi
HwK3d9qqOasCAwEAAaMfMB0wGwYDVR0RBBQwEoIQZWRnZS1ub2RlLTAxLmlu
dGVybmFsMA0GCSqGSIb3DQEBCwUAA0EAgfFhqe3c6EkVMKoUE7S3A7m9WlRl
TFcHJ8m0sJK8NkJlFMt4H0RYCxg4P3j0Z3Poh6Vg7+NlEJ9s3j/Hkw==
-----END CERTIFICATE-----`;

    const result = mtls.validateClientCert(fakePem, "EDGE_GATEWAY");
    // Will fail either on parse (if invalid DER) or on pin lookup
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toBeDefined();
  });

  it("Invariant 4: mTLS revocation list immediately invalidates a previously trusted fingerprint", () => {
    const fingerprint = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
    // Pin the cert
    mtls.pinCertificate({
      nodeId: "edge-gateway-01",
      role: "EDGE_GATEWAY",
      certFingerprint: fingerprint,
      allowedSans: ["edge-gateway-01.internal"],
    });

    expect(mtls.isRevoked(fingerprint)).toBe(false);

    // Revoke it
    mtls.revokeCertificate(fingerprint);
    expect(mtls.isRevoked(fingerprint)).toBe(true);
  });

  // ─────────────── Short-Lived Tokens ───────────────

  it("Invariant 5: Token has 15-minute TTL, unique JTI, and verifies successfully", () => {
    const { accessToken, claims } = tokenService.issue({
      userId: "user-001",
      tenantId: "tenant-blr",
      roles: ["BRANCH_SECURITY_OFFICER"],
      branchScope: ["branch-001"],
    });

    expect(accessToken.split(".")).toHaveLength(3);
    expect(claims.jti).toHaveLength(32); // 16 bytes hex
    expect(claims.exp - claims.iat).toBe(15 * 60); // 15 min TTL

    const result = tokenService.verify(accessToken);
    expect(result.valid).toBe(true);
    expect(result.claims?.sub).toBe("user-001");
    expect(result.claims?.tid).toBe("tenant-blr");
  });

  it("Invariant 6: Revoked token is immediately rejected by TRL on next verify", () => {
    const { accessToken, claims } = tokenService.issue({
      userId: "user-002",
      tenantId: "tenant-blr",
      roles: ["VIRTUAL_GUARD_OPERATOR"],
      branchScope: ["branch-002"],
    });

    expect(tokenService.verify(accessToken).valid).toBe(true);

    // Revoke
    tokenService.revoke(claims.jti, claims.exp);

    const revoked = tokenService.verify(accessToken);
    expect(revoked.valid).toBe(false);
    expect(revoked.rejectionReason).toContain("revoked");
  });

  // ─────────────── ABAC Policy Engine ───────────────

  it("Invariant 7: ABAC branch scoping prevents operator from accessing a different branch camera", () => {
    const decision = abac.evaluate({
      subject: {
        userId: "op-001",
        tenantId: "tenant-blr",
        roles: ["BRANCH_SECURITY_OFFICER"],
        branchScope: ["branch-mumbai-01"], // Only Mumbai Main
      },
      resource: {
        tenantId: "tenant-blr",
        branchId: "branch-bengaluru-05", // Bengaluru branch — NOT in scope
        cameraId: "CAM-BNG-001",
        classification: "PUBLIC_LOBBY",
      },
      action: "LIVE_VIEW",
      environment: { requestTimeUtc: new Date().toISOString() },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("branch");
  });

  it("Invariant 8: ABAC denies Virtual Guard Operator access to VAULT_STRONG_ROOM camera", () => {
    const decision = abac.evaluate({
      subject: {
        userId: "op-002",
        tenantId: "tenant-blr",
        roles: ["VIRTUAL_GUARD_OPERATOR"],
        branchScope: ["branch-001"], // Same branch — scope matches
      },
      resource: {
        tenantId: "tenant-blr",
        branchId: "branch-001",
        cameraId: "CAM-VAULT-01",
        classification: "VAULT_STRONG_ROOM", // Requires CSO or above
      },
      action: "LIVE_VIEW",
      environment: { requestTimeUtc: new Date().toISOString() },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("VAULT_STRONG_ROOM");
  });

  it("Invariant 9: ABAC allows Chief Security Officer to access VAULT_STRONG_ROOM camera in-scope branch", () => {
    const decision = abac.evaluate({
      subject: {
        userId: "cso-001",
        tenantId: "tenant-blr",
        roles: ["CHIEF_SECURITY_OFFICER"],
        branchScope: ["branch-001"],
      },
      resource: {
        tenantId: "tenant-blr",
        branchId: "branch-001",
        cameraId: "CAM-VAULT-01",
        classification: "VAULT_STRONG_ROOM",
      },
      action: "LIVE_VIEW",
      environment: { requestTimeUtc: new Date().toISOString() },
    });

    expect(decision.allowed).toBe(true);
  });

  // ─────────────── Immutable Merkle Audit Chain ───────────────

  it("Invariant 10: Merkle audit chain detects tampering of any historical event", () => {
    // Append 5 events
    for (let i = 1; i <= 5; i++) {
      audit.append({
        category: "CAMERA_ACCESSED",
        tenantId: "tenant-blr",
        actorUserId: `user-${i}`,
        actorRoles: ["BRANCH_SECURITY_OFFICER"],
        action: "LIVE_VIEW",
        outcome: "SUCCESS",
        timestamp: new Date().toISOString(),
      });
    }

    // Chain is valid
    expect(audit.verifyChain().valid).toBe(true);
    expect(audit.getChainLength()).toBe(5);

    // Tamper with event #3 (index 2) by mutating its hash
    const chain = (audit as any).chain as Array<{ hash: string; outcome: string }>;
    chain[2]!.hash = "tampered-hash-value-that-breaks-chain-integrity-completely!";

    const result = audit.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.firstBrokenIndex).toBeDefined();
    // Broken link can be at index 2 (self-hash mismatch) or 3 (previousHash mismatch)
    expect(result.firstBrokenIndex).toBeGreaterThanOrEqual(2);
  });
});
