import { describe, it, expect, beforeEach } from "vitest";
import {
  SignedConfigurationService,
  canonicalJson,
} from "../../src/edge/services/signed-configuration.service.js";
import { SignedConfigRepository } from "../../src/database/signed-config-repository.js";

describe("SignedConfigurationService - Production Cryptographic Suite", () => {
  let repository: SignedConfigRepository;
  let service: SignedConfigurationService;

  beforeEach(() => {
    repository = new SignedConfigRepository();
    service = new SignedConfigurationService(undefined, repository);
  });

  describe("RFC 8785 Canonical JSON Serialization", () => {
    it("produces identical output regardless of object key order", () => {
      const obj1 = { z: 1, a: "hello", m: { nested2: true, nested1: 123 } };
      const obj2 = { a: "hello", m: { nested1: 123, nested2: true }, z: 1 };

      const canon1 = canonicalJson(obj1);
      const canon2 = canonicalJson(obj2);

      expect(canon1).toBe(canon2);
      expect(canon1).toBe('{"a":"hello","m":{"nested1":123,"nested2":true},"z":1}');
    });

    it("handles primitives, arrays, and null properly", () => {
      expect(canonicalJson(null)).toBe("null");
      expect(canonicalJson(42)).toBe("42");
      expect(canonicalJson("test")).toBe('"test"');
      expect(canonicalJson([3, 2, 1])).toBe("[3,2,1]");
    });
  });

  describe("Keypair Generation & Management", () => {
    it("generates an RSA-PSS keypair with valid SPKI PEM public key", async () => {
      const key = await service.generateKey({
        algorithm: "RSA-PSS-SHA256",
        keySize: 2048,
        validDays: 90,
      });

      expect(key.keyId).toBeDefined();
      expect(key.algorithm).toBe("RSA-PSS-SHA256");
      expect(key.publicKeyPem).toContain("BEGIN PUBLIC KEY");
      expect(key.privateKeyPem).toContain("BEGIN PRIVATE KEY");
      expect(key.keyFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(key.status).toBe("ACTIVE");
    });

    it("generates an HMAC-SHA256 secret key", async () => {
      const key = await service.generateKey({
        algorithm: "HMAC-SHA256",
      });

      expect(key.algorithm).toBe("HMAC-SHA256");
      expect(key.hmacSecret).toBeDefined();
      expect(key.status).toBe("ACTIVE");
    });

    it("rotates an active key, retiring the previous key", async () => {
      const initialKey = await service.generateKey({ keyId: "key-v1", algorithm: "RSA-PSS-SHA256" });
      expect(initialKey.status).toBe("ACTIVE");

      const { oldKey, newKey } = await service.rotateKey({
        oldKeyId: "key-v1",
        newAlgorithm: "RSA-PSS-SHA256",
      });

      expect(oldKey.status).toBe("RETIRED");
      expect(newKey.status).toBe("ACTIVE");
      expect(newKey.keyId).not.toBe("key-v1");

      const fetchedOld = await repository.getKey("key-v1");
      expect(fetchedOld?.status).toBe("RETIRED");
    });

    it("revokes a compromised key immediately", async () => {
      const key = await service.generateKey({ keyId: "key-compromised" });
      const revoked = await service.revokeKey("key-compromised", "Workstation compromised");

      expect(revoked.status).toBe("REVOKED");
      expect(revoked.revocationReason).toBe("Workstation compromised");
      expect(revoked.revokedAt).toBeDefined();
    });

    it("returns public keys while filtering out revoked keys and private data", async () => {
      await service.generateKey({ keyId: "active-k1", algorithm: "RSA-PSS-SHA256" });
      await service.generateKey({ keyId: "to-revoke", algorithm: "RSA-PSS-SHA256" });
      await service.revokeKey("to-revoke", "Revocation test");

      const publicKeystore = await service.getPublicKeystore();
      const ids = publicKeystore.map((k) => k.keyId);

      expect(ids).toContain("active-k1");
      expect(ids).not.toContain("to-revoke");
      expect((publicKeystore[0] as any).privateKeyPem).toBeUndefined();
    });
  });

  describe("RSA-PSS Signing and Verification", () => {
    it("signs and verifies bundle with RSA-PSS-SHA256", async () => {
      const key = await service.generateKey({
        keyId: "rsa-pss-test",
        algorithm: "RSA-PSS-SHA256",
        keySize: 2048,
      });

      const bundle = await service.signBundleAsync({
        edgeId: "edge-branch-202",
        version: 10,
        payload: {
          nvrIp: "192.168.1.100",
          rtspPort: 554,
          channels: 16,
        },
        signerIdentity: "admin@kryptovision.internal",
        keyId: key.keyId,
        algorithm: "RSA-PSS-SHA256",
      });

      expect(bundle.signature).toBeDefined();
      expect(bundle.signature.length).toBeGreaterThan(64);
      expect(bundle.canonicalPayloadHash).toBeDefined();

      const verification = await service.verifyBundleAsync(bundle);
      expect(verification.isValid).toBe(true);
      expect(verification.error).toBeUndefined();
    });

    it("fails verification if payload is tampered (bit-flip / modified value)", async () => {
      const key = await service.generateKey({
        keyId: "rsa-tamper-key",
        algorithm: "RSA-PSS-SHA256",
      });

      const bundle = await service.signBundleAsync({
        edgeId: "edge-branch-202",
        version: 1,
        payload: { bitrateKbps: 4096 },
        signerIdentity: "admin@kryptovision.internal",
        keyId: key.keyId,
      });

      // Tamper with payload
      const tamperedBundle = {
        ...bundle,
        payload: { bitrateKbps: 1024 }, // Attacker lowered bitrate
      };

      const result = await service.verifyBundleAsync(tamperedBundle);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("mismatch");
    });

    it("fails verification if signing key has been revoked", async () => {
      const key = await service.generateKey({ keyId: "revoked-signer" });
      const bundle = await service.signBundleAsync({
        edgeId: "edge-branch-202",
        version: 1,
        payload: { recording: true },
        signerIdentity: "admin@kryptovision.internal",
        keyId: key.keyId,
      });

      // Revoke the key
      await service.revokeKey(key.keyId, "Stolen certificate");

      const result = await service.verifyBundleAsync(bundle);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("revoked");
    });
  });

  describe("HMAC-SHA256 Signing and Verification", () => {
    it("signs and verifies using synchronous legacy method", () => {
      const config = service.signConfiguration({
        edgeId: "edge-101",
        version: 5,
        payload: { fps: 30 },
        signerIdentity: "sec@bank.internal",
      });

      expect(config.signature).toBeDefined();
      const isValid = service.verifyConfigurationSignature(config);
      expect(isValid).toBe(true);
    });

    it("rejects corrupted HMAC signature", () => {
      const config = service.signConfiguration({
        edgeId: "edge-101",
        version: 5,
        payload: { fps: 30 },
        signerIdentity: "sec@bank.internal",
      });

      const corrupted = {
        ...config,
        signature: config.signature.slice(0, -4) + "0000",
      };

      const isValid = service.verifyConfigurationSignature(corrupted);
      expect(isValid).toBe(false);
    });
  });

  describe("Drift Detection & Receipts", () => {
    it("identifies IN_SYNC state when running expected version and payload hash", () => {
      const desired = service.signConfiguration({
        edgeId: "edge-101",
        version: 12,
        payload: { test: true },
        signerIdentity: "admin",
      });

      const check = service.detectDrift(desired, {
        appliedVersion: 12,
        actualPayloadHash: desired.canonicalPayloadHash,
      });

      expect(check.isDrifted).toBe(false);
      expect(check.status).toBe("IN_SYNC");
    });

    it("identifies DRIFTED state when running older version", () => {
      const desired = service.signConfiguration({
        edgeId: "edge-101",
        version: 12,
        payload: { test: true },
        signerIdentity: "admin",
      });

      const check = service.detectDrift(desired, {
        appliedVersion: 11,
      });

      expect(check.isDrifted).toBe(true);
      expect(check.status).toBe("DRIFTED");
      expect(check.driftReason).toContain("running version v11");
    });

    it("identifies TAMPERED state when edge agent reports corruption", () => {
      const desired = service.signConfiguration({
        edgeId: "edge-101",
        version: 12,
        payload: { test: true },
        signerIdentity: "admin",
      });

      const check = service.detectDrift(desired, {
        appliedVersion: 12,
        isTampered: true,
      });

      expect(check.isDrifted).toBe(true);
      expect(check.status).toBe("TAMPERED");
    });
  });
});
