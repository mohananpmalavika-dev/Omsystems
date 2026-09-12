import { describe, it, expect, beforeEach } from "vitest";
import {
  EdgeConfigVerifier,
  type EdgeConfigBundle,
  type EdgeTrustedKeyring,
} from "../../edge-agent/src/security/edge-config-verifier.js";
import { SignedConfigurationService } from "../../src/edge/services/signed-configuration.service.js";

describe("EdgeConfigVerifier - Edge Autonomous Verification Engine", () => {
  let controlPlaneService: SignedConfigurationService;
  let trustedKeyring: EdgeTrustedKeyring;
  let verifier: EdgeConfigVerifier;
  const EDGE_ID = "edge-gateway-101";

  beforeEach(async () => {
    controlPlaneService = new SignedConfigurationService();
    const rsaKey = await controlPlaneService.generateKey({
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
      keySize: 2048,
    });

    trustedKeyring = {
      publicKeys: {
        "rsa-trusted-key": rsaKey.publicKeyPem!,
      },
      hmacSecrets: {
        "hmac-key": "kryptovision-edge-config-root-secret-2026",
      },
      revokedKeyIds: [],
    };

    verifier = new EdgeConfigVerifier(EDGE_ID, "2.5.0", trustedKeyring);
  });

  it("verifies and accepts a valid RSA-PSS signed bundle targeted to this edge agent", async () => {
    const bundleRecord = await controlPlaneService.signBundleAsync({
      edgeId: EDGE_ID,
      version: 5,
      payload: { cameraCount: 8, motionDetection: true },
      signerIdentity: "sec-admin@bank.internal",
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: bundleRecord.bundleId,
      edgeId: bundleRecord.edgeId,
      version: bundleRecord.version,
      payload: bundleRecord.payload,
      canonicalPayloadHash: bundleRecord.canonicalPayloadHash,
      signature: bundleRecord.signature,
      algorithm: bundleRecord.algorithm,
      keyId: bundleRecord.keyId,
      signerIdentity: bundleRecord.signerIdentity,
      nonce: bundleRecord.nonce,
      expiresAt: bundleRecord.expiresAt,
    };

    const result = verifier.verifyBundle(bundle, 4); // current version is 4

    expect(result.isVerified).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.receipt.verificationResult).toBe("VERIFIED");
    expect(result.receipt.edgeAgentVersion).toBe("2.5.0");
  });

  it("rejects bundle targeted for a different edge gateway (identity pinning)", async () => {
    const bundleRecord = await controlPlaneService.signBundleAsync({
      edgeId: "other-edge-gateway-999",
      version: 1,
      payload: { cameraCount: 8 },
      signerIdentity: "sec-admin@bank.internal",
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: bundleRecord.bundleId,
      edgeId: bundleRecord.edgeId,
      version: bundleRecord.version,
      payload: bundleRecord.payload,
      canonicalPayloadHash: bundleRecord.canonicalPayloadHash,
      signature: bundleRecord.signature,
      algorithm: bundleRecord.algorithm,
      keyId: bundleRecord.keyId,
      signerIdentity: bundleRecord.signerIdentity,
    };

    const result = verifier.verifyBundle(bundle, 0);

    expect(result.isVerified).toBe(false);
    expect(result.errorCode).toBe("IDENTITY_MISMATCH");
    expect(result.receipt.verificationResult).toBe("TAMPERED");
  });

  it("rejects downgrade / rollback attack when version <= currentAppliedVersion", async () => {
    const bundleRecord = await controlPlaneService.signBundleAsync({
      edgeId: EDGE_ID,
      version: 3, // older version
      payload: { cameraCount: 4 },
      signerIdentity: "sec-admin@bank.internal",
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: bundleRecord.bundleId,
      edgeId: bundleRecord.edgeId,
      version: bundleRecord.version,
      payload: bundleRecord.payload,
      canonicalPayloadHash: bundleRecord.canonicalPayloadHash,
      signature: bundleRecord.signature,
      algorithm: bundleRecord.algorithm,
      keyId: bundleRecord.keyId,
      signerIdentity: bundleRecord.signerIdentity,
    };

    const result = verifier.verifyBundle(bundle, 5); // currently running version 5!

    expect(result.isVerified).toBe(false);
    expect(result.errorCode).toBe("ROLLBACK_DETECTED");
    expect(result.error).toContain("downgrade prevention");
    expect(result.receipt.rejectionReason).toContain("rollback rejected");
  });

  it("rejects expired bundle when expiration window has lapsed", async () => {
    const bundleRecord = await controlPlaneService.signBundleAsync({
      edgeId: EDGE_ID,
      version: 10,
      payload: { test: true },
      signerIdentity: "sec-admin@bank.internal",
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: bundleRecord.bundleId,
      edgeId: bundleRecord.edgeId,
      version: bundleRecord.version,
      payload: bundleRecord.payload,
      canonicalPayloadHash: bundleRecord.canonicalPayloadHash,
      signature: bundleRecord.signature,
      algorithm: bundleRecord.algorithm,
      keyId: bundleRecord.keyId,
      signerIdentity: bundleRecord.signerIdentity,
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // expired 1 min ago
    };

    const result = verifier.verifyBundle(bundle, 9);

    expect(result.isVerified).toBe(false);
    expect(result.errorCode).toBe("BUNDLE_EXPIRED");
  });

  it("rejects bundle signed by a revoked key", async () => {
    trustedKeyring.revokedKeyIds = ["rsa-trusted-key"];
    const verifierWithRevoked = new EdgeConfigVerifier(EDGE_ID, "2.5.0", trustedKeyring);

    const bundleRecord = await controlPlaneService.signBundleAsync({
      edgeId: EDGE_ID,
      version: 10,
      payload: { test: true },
      signerIdentity: "sec-admin@bank.internal",
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: bundleRecord.bundleId,
      edgeId: bundleRecord.edgeId,
      version: bundleRecord.version,
      payload: bundleRecord.payload,
      canonicalPayloadHash: bundleRecord.canonicalPayloadHash,
      signature: bundleRecord.signature,
      algorithm: bundleRecord.algorithm,
      keyId: bundleRecord.keyId,
      signerIdentity: bundleRecord.signerIdentity,
    };

    const result = verifierWithRevoked.verifyBundle(bundle, 9);

    expect(result.isVerified).toBe(false);
    expect(result.errorCode).toBe("KEY_REVOKED");
  });

  it("rejects bundle with modified parameter (checksum mismatch)", async () => {
    const bundleRecord = await controlPlaneService.signBundleAsync({
      edgeId: EDGE_ID,
      version: 10,
      payload: { fps: 30, resolution: "1080P" },
      signerIdentity: "sec-admin@bank.internal",
      keyId: "rsa-trusted-key",
      algorithm: "RSA-PSS-SHA256",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: bundleRecord.bundleId,
      edgeId: bundleRecord.edgeId,
      version: bundleRecord.version,
      payload: { fps: 5, resolution: "360P" }, // Attacker modified
      canonicalPayloadHash: bundleRecord.canonicalPayloadHash,
      signature: bundleRecord.signature,
      algorithm: bundleRecord.algorithm,
      keyId: bundleRecord.keyId,
      signerIdentity: bundleRecord.signerIdentity,
    };

    const result = verifier.verifyBundle(bundle, 9);

    expect(result.isVerified).toBe(false);
    expect(result.errorCode).toBe("HASH_MISMATCH");
    expect(result.receipt.verificationResult).toBe("TAMPERED");
  });

  it("verifies HMAC-SHA256 bundle properly", () => {
    const raw = controlPlaneService.signConfiguration({
      edgeId: EDGE_ID,
      version: 6,
      payload: { port: 8080 },
      signerIdentity: "admin",
      keyId: "hmac-key",
    });

    const bundle: EdgeConfigBundle = {
      bundleId: raw.bundleId!,
      edgeId: raw.edgeId,
      version: raw.version,
      payload: raw.payload,
      canonicalPayloadHash: raw.canonicalPayloadHash,
      signature: raw.signature,
      algorithm: "HMAC-SHA256",
      keyId: "hmac-key",
      signerIdentity: raw.signerIdentity,
      nonce: raw.nonce,
    };

    const result = verifier.verifyBundle(bundle, 5);
    expect(result.isVerified).toBe(true);
  });
});
