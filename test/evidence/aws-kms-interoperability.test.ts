import { describe, it, expect } from "vitest";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { AwsKmsSigningProvider } from "../../src/evidence/signing/evidence-signing-provider.js";
import { canonicalJsonStringify } from "../../src/evidence-export/services/canonical-json.js";

describe("AWS KMS Signature Semantics & Interoperability (P0-15)", () => {
  // Generate valid NIST P-256 (prime256v1) key pair representing KMS CMK
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  it("verifies end-to-end KMS DIGEST signing without double-hashing, agreeing across KMS Verify and local GetPublicKey", async () => {
    const canonicalManifest = canonicalJsonStringify({
      version: "2.0.0",
      product: "KryptoVision",
      company: "KryptonLogic",
      caseId: "CASE-AUDIT-2026-001",
      exportedAt: "2026-09-07T00:00:00.000Z",
      cameras: {
        "CAM-VAULT-01": {
          sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
          sizeBytes: 1548293,
        },
      },
    });

    // 1. Compute 32-byte SHA-256 digest
    const digest = createHash("sha256").update(canonicalManifest, "utf8").digest();
    expect(digest.length).toBe(32);

    // 2. Simulate AWS KMS client with DIGEST semantics
    let kmsSignReceivedParams: any = null;
    let kmsVerifyReceivedParams: any = null;

    const mockKmsClient = {
      send: async (cmd: any) => {
        const cmdName = cmd.constructor?.name || cmd.name || "UnknownCommand";
        if (cmdName.includes("GetPublicKey") || (!cmd.input?.SigningAlgorithm && !cmd.input?.Signature)) {
          return { PublicKey: publicKeyDer };
        }
        if (cmdName.includes("Verify") || (cmd.input?.Signature && cmd.input?.SigningAlgorithm)) {
          kmsVerifyReceivedParams = cmd.input;
          expect(cmd.input.MessageType).toBe("DIGEST");
          expect(cmd.input.Message.length).toBe(32);

          const isValid = verify(null, cmd.input.Message, publicKey, cmd.input.Signature);
          return {
            SignatureValid: isValid,
            KeyId: cmd.input.KeyId,
          };
        }
        if (cmdName.includes("Sign") || cmd.input?.SigningAlgorithm) {
          kmsSignReceivedParams = cmd.input;
          expect(cmd.input.MessageType).toBe("DIGEST");
          expect(cmd.input.Message.length).toBe(32);

          // Sign with null algorithm to avoid double hashing precomputed digest
          const signature = sign(null, cmd.input.Message, privateKey);
          return {
            Signature: signature,
            KeyId: cmd.input.KeyId,
            SigningAlgorithm: cmd.input.SigningAlgorithm,
          };
        }
        throw new Error(`Unexpected KMS command: ${cmdName}`);
      },
    };

    const provider = new AwsKmsSigningProvider({
      keyId: "arn:aws:kms:ap-south-1:123456789012:key/kryptovision-evidence-key",
      region: "ap-south-1",
      algorithm: "ECDSA_SHA_256",
    });

    // Inject mock KMS client promise
    (provider as any).clientPromise = Promise.resolve(mockKmsClient);

    // 3. AWS KMS Sign (DIGEST)
    const signResult = await provider.signDigest(digest);
    expect(signResult.signature).toBeDefined();
    expect(signResult.signature.length).toBeGreaterThan(60);
    expect(kmsSignReceivedParams.MessageType).toBe("DIGEST");

    // 4. Restart application simulation: new provider instance with same key
    const newProvider = new AwsKmsSigningProvider({
      keyId: "arn:aws:kms:ap-south-1:123456789012:key/kryptovision-evidence-key",
      region: "ap-south-1",
      algorithm: "ECDSA_SHA_256",
    });
    (newProvider as any).clientPromise = Promise.resolve(mockKmsClient);

    // 5. AWS KMS Verify (DIGEST)
    const isKmsValid = await newProvider.verify(digest, signResult.signature);
    expect(isKmsValid).toBe(true);
    expect(kmsVerifyReceivedParams.MessageType).toBe("DIGEST");

    // 6. Independent compatible verification using exported public key
    const fetchedPublicKey = await newProvider.getPublicKeyPem();
    expect(fetchedPublicKey).toContain("BEGIN PUBLIC KEY");

    const isIndependentValid = verify(null, digest, fetchedPublicKey, signResult.signature);
    expect(isIndependentValid).toBe(true);

    // Both KMS Verify and independent local verification must agree
    expect(isKmsValid).toBe(isIndependentValid);

    // 7. Tampered manifest verification: both MUST reject
    const tamperedDigest = createHash("sha256").update("tampered manifest content").digest();
    const isTamperedKmsValid = await newProvider.verify(tamperedDigest, signResult.signature);
    expect(isTamperedKmsValid).toBe(false);

    const isTamperedIndependentValid = verify(null, tamperedDigest, fetchedPublicKey, signResult.signature);
    expect(isTamperedIndependentValid).toBe(false);
  });
});
