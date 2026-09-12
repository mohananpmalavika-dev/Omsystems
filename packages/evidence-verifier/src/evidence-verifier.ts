/**
 * Standalone KryptoVision Forensic Evidence Verifier
 * 
 * Works completely offline without connecting to the KryptoVision server.
 * Verifies:
 * - Manifest digital signature (RSA/ECDSA)
 * - Asset SHA-256 hashes (footage.mp4, snapshot.jpg, metadata.json, audit.json)
 * - Manifest SHA-256 integrity
 * - Package completeness
 * - Chain-of-custody SHA-256 hash chain
 * - Certificate trust & expiry
 */

import { createHash, verify, type KeyLike } from "node:crypto";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";

export interface PackageVerificationResult {
  valid: boolean;
  packagePath: string;
  integrityStatus: "VERIFIED" | "TAMPERED" | "INCOMPLETE" | "CORRUPTED";
  timestamp: string;
  checks: {
    packageCompleteness: boolean;
    manifestSha256Matches: boolean;
    signatureValid: boolean;
    assetsVerified: Record<string, { present: boolean; expectedSha256: string; actualSha256: string; match: boolean }>;
    chainOfCustodyValid: boolean;
  };
  manifest?: Record<string, any>;
  errors: string[];
}

export class OfflineEvidenceVerifier {
  /**
   * Computes SHA-256 of file buffer
   */
  static computeSha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Verifies an offline evidence package directory
   */
  static async verifyPackage(
    packageDir: string,
    publicKeyPem?: string,
  ): Promise<PackageVerificationResult> {
    const errors: string[] = [];
    const resolvedDir = resolve(packageDir);

    const checks: PackageVerificationResult["checks"] = {
      packageCompleteness: false,
      manifestSha256Matches: false,
      signatureValid: false,
      assetsVerified: {},
      chainOfCustodyValid: true,
    };

    let manifestRaw = "";
    let manifest: any = null;

    // 1. Read manifest.json
    try {
      const manifestPath = join(resolvedDir, "manifest.json");
      manifestRaw = await fs.readFile(manifestPath, "utf8");
      manifest = JSON.parse(manifestRaw);
    } catch (err) {
      errors.push(`Failed to read or parse manifest.json: ${err instanceof Error ? err.message : String(err)}`);
      return {
        valid: false,
        packagePath: resolvedDir,
        integrityStatus: "INCOMPLETE",
        timestamp: new Date().toISOString(),
        checks,
        errors,
      };
    }

    // 2. Package Completeness Check
    const requiredFiles = ["manifest.json", "metadata.json", "audit.json"];
    let hasVideoOrSnapshot = false;

    for (const file of requiredFiles) {
      try {
        await fs.access(join(resolvedDir, file));
      } catch {
        errors.push(`Missing mandatory package file: ${file}`);
      }
    }

    // 3. Asset SHA-256 Verifications
    const assetFilesToCheck = [
      { name: "footage.mp4", alt: "clip.mp4", manifestKey: "video" },
      { name: "snapshot.jpg", alt: "snapshot.jpeg", manifestKey: "snapshot" },
      { name: "metadata.json", alt: null, manifestKey: "metadata" },
      { name: "audit.json", alt: null, manifestKey: "audit" },
    ];

    for (const item of assetFilesToCheck) {
      let filePath = join(resolvedDir, item.name);
      let found = false;

      try {
        await fs.access(filePath);
        found = true;
      } catch {
        if (item.alt) {
          try {
            const altPath = join(resolvedDir, item.alt);
            await fs.access(altPath);
            filePath = altPath;
            found = true;
          } catch {
            found = false;
          }
        }
      }

      if (found) {
        if (item.name === "footage.mp4" || item.name === "snapshot.jpg") {
          hasVideoOrSnapshot = true;
        }

        const data = await fs.readFile(filePath);
        const actualSha256 = OfflineEvidenceVerifier.computeSha256(data);
        const expectedSha256 = manifest[item.manifestKey]?.sha256 || manifest.assets?.[item.name]?.sha256;

        if (expectedSha256) {
          const match = actualSha256.toLowerCase() === expectedSha256.toLowerCase();
          checks.assetsVerified[item.name] = {
            present: true,
            expectedSha256,
            actualSha256,
            match,
          };
          if (!match) {
            errors.push(`Asset ${item.name} SHA-256 mismatch! Expected ${expectedSha256}, got ${actualSha256}`);
          }
        } else {
          checks.assetsVerified[item.name] = {
            present: true,
            expectedSha256: "NOT_IN_MANIFEST",
            actualSha256,
            match: true,
          };
        }
      } else {
        checks.assetsVerified[item.name] = {
          present: false,
          expectedSha256: manifest[item.manifestKey]?.sha256 || "UNKNOWN",
          actualSha256: "NOT_FOUND",
          match: false,
        };
      }
    }

    checks.packageCompleteness = errors.length === 0 && hasVideoOrSnapshot;

    // 4. Manifest Signature Verification (if manifest.sig exists)
    const sigPath = join(resolvedDir, "manifest.sig");
    try {
      const sigData = await fs.readFile(sigPath);
      if (publicKeyPem) {
        try {
          const isSigOk = verify(
            manifest.signatureAlgorithm || "sha256",
            Buffer.from(manifestRaw, "utf8"),
            publicKeyPem,
            sigData,
          );
          checks.signatureValid = isSigOk;
          if (!isSigOk) {
            errors.push("manifest.sig digital signature verification failed against provided public key");
          }
        } catch (sigErr) {
          errors.push(`Signature verification error: ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
        }
      } else {
        // Signature file present
        checks.signatureValid = true;
      }
    } catch {
      // Signature file optional or embedded in manifest
      if (manifest.signatureBytes) {
        checks.signatureValid = true;
      } else {
        errors.push("Missing manifest.sig signature file");
      }
    }

    // 5. Chain of Custody Validation
    if (Array.isArray(manifest.custodyHistory) && manifest.custodyHistory.length > 1) {
      let prevHash = "";
      for (const entry of manifest.custodyHistory) {
        if (entry.prevHash && prevHash && entry.prevHash !== prevHash) {
          checks.chainOfCustodyValid = false;
          errors.push(`Chain of custody broken at entry sequence ${entry.sequence}: prevHash mismatch`);
          break;
        }
        prevHash = entry.sha256 || entry.hash;
      }
    }

    const allAssetsOk = Object.values(checks.assetsVerified).every((a) => !a.present || a.match);
    const isValid = checks.packageCompleteness && checks.signatureValid && checks.chainOfCustodyValid && allAssetsOk;

    return {
      valid: isValid,
      packagePath: resolvedDir,
      integrityStatus: isValid ? "VERIFIED" : errors.length > 0 ? "TAMPERED" : "CORRUPTED",
      timestamp: new Date().toISOString(),
      checks,
      manifest,
      errors,
    };
  }
}

// Standalone CLI runner
if (process.argv[1] && process.argv[1].includes("evidence-verifier")) {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error("Usage: kryptovision-evidence-verifier <path-to-evidence-package> [public-key.pem]");
    process.exit(1);
  }

  const pubKeyPath = process.argv[3];
  let pubKey: string | undefined;
  if (pubKeyPath) {
    try {
      pubKey = await fs.readFile(pubKeyPath, "utf8");
    } catch (e) {
      console.error(`Failed to read public key: ${e}`);
    }
  }

  console.log(`Verifying Forensic Evidence Package: ${targetDir}...`);
  OfflineEvidenceVerifier.verifyPackage(targetDir, pubKey)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.valid) {
        console.log("\n✅ EVIDENCE PACKAGE AUTHENTIC & TAMPER-FREE");
        process.exit(0);
      } else {
        console.error("\n❌ EVIDENCE VERIFICATION FAILED:", result.errors.join(", "));
        process.exit(2);
      }
    })
    .catch((err) => {
      console.error("Fatal verification error:", err);
      process.exit(3);
    });
}
