#!/usr/bin/env tsx
/**
 * Standalone Offline Forensic Evidence Verification CLI
 * 
 * Cryptographically verifies forensic video packages offline without requiring
 * connection to the KryptoVision server or database.
 * 
 * Usage:
 *   npx tsx scripts/verify-forensic-export.ts --media <media.mp4> --manifest <manifest.json> [--pubkey <pubkey.pem>]
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash, verify } from "node:crypto";
import { resolve } from "node:path";

interface ManifestPayload {
  manifest_version?: string;
  version?: string;
  evidence_id: string;
  camera_id: string;
  tenant_id: string;
  case_id?: string;
  exported_by?: string;
  exported_at: string;
  time_range: {
    start: string;
    end: string;
  };
  media?: {
    file_name: string;
    sha256: string;
    size_bytes: number;
    container?: string;
  };
  media_hash?: string;
  signature?: {
    algorithm: string;
    key_id: string;
    value: string;
  };
  digital_signature?: {
    algorithm: string;
    key_id: string;
    signature_value: string;
    public_key_pem?: string;
  };
}

function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(obj[key])}`);
  return "{" + pairs.join(",") + "}";
}

function parseArgs(args: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        result[key] = value;
        i++;
      }
    }
  }
  return result;
}

export function verifyForensicPackage(options: {
  mediaPath: string;
  manifestPath: string;
  pubKeyPath?: string;
  pubKeyPem?: string;
}): {
  verified: boolean;
  mediaHash: string;
  manifestHash: string;
  hashMatch: boolean;
  signatureValid: boolean;
  errors: string[];
  manifest: ManifestPayload;
} {
  const errors: string[] = [];

  if (!existsSync(options.mediaPath)) {
    throw new Error(`Media file not found: ${options.mediaPath}`);
  }
  if (!existsSync(options.manifestPath)) {
    throw new Error(`Manifest file not found: ${options.manifestPath}`);
  }

  // 1. Compute media SHA-256
  const mediaBytes = readFileSync(options.mediaPath);
  const mediaHash = createHash("sha256").update(mediaBytes).digest("hex");

  // 2. Parse manifest
  const manifestContent = readFileSync(options.manifestPath, "utf-8");
  const manifest: ManifestPayload = JSON.parse(manifestContent);

  const expectedMediaHash = manifest.media?.sha256 || manifest.media_hash;
  if (!expectedMediaHash) {
    errors.push("Manifest does not contain a media SHA-256 hash");
  }

  const hashMatch = expectedMediaHash ? mediaHash.toLowerCase() === expectedMediaHash.toLowerCase() : false;
  if (!hashMatch) {
    errors.push(`Media SHA-256 mismatch: calculated ${mediaHash} != expected ${expectedMediaHash}`);
  }

  // 3. Reconstruct canonical signature payload
  const sigInfo = manifest.signature || manifest.digital_signature;
  if (!sigInfo) {
    errors.push("Manifest does not contain a digital signature block");
  }

  const signatureBase = { ...manifest };
  delete (signatureBase as any).signature;
  delete (signatureBase as any).digital_signature;

  const canonicalManifest = canonicalizeJson(signatureBase);
  const manifestDigest = createHash("sha256").update(canonicalManifest).digest();

  // 4. Resolve public key
  let pubKey = options.pubKeyPem;
  if (!pubKey && options.pubKeyPath && existsSync(options.pubKeyPath)) {
    pubKey = readFileSync(options.pubKeyPath, "utf-8");
  }
  if (!pubKey && manifest.digital_signature?.public_key_pem) {
    pubKey = manifest.digital_signature.public_key_pem;
  }

  let signatureValid = false;
  if (!pubKey) {
    errors.push("Public key PEM was not provided and not embedded in manifest. Signature cannot be verified.");
  } else if (sigInfo) {
    const sigValue = (sigInfo as any).signature_value || (sigInfo as any).value;
    if (!sigValue) {
      errors.push("Signature block missing signature value");
    } else {
      try {
        const sigBuf = Buffer.from(sigValue, "hex");
        const algo = sigInfo.algorithm || "ED25519";
        if (algo.toUpperCase().includes("ED25519")) {
          signatureValid = verify(null, manifestDigest, pubKey, sigBuf);
        } else {
          signatureValid = verify("sha256", manifestDigest, pubKey, sigBuf);
        }
      } catch (err: any) {
        errors.push(`Cryptographic verification exception: ${err.message}`);
      }
    }
  }

  const verified = hashMatch && signatureValid;

  return {
    verified,
    mediaHash,
    manifestHash: expectedMediaHash || "",
    hashMatch,
    signatureValid,
    errors,
    manifest,
  };
}

// CLI Execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename || "")) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.media || !args.manifest) {
    console.error("================================================================================");
    console.error("  KRYPTOVISION — STANDALONE FORENSIC EVIDENCE VERIFIER");
    console.error("================================================================================");
    console.error("Usage:");
    console.error("  npx tsx scripts/verify-forensic-export.ts --media <path> --manifest <path> [--pubkey <path>]");
    console.error("");
    process.exit(1);
  }

  try {
    const res = verifyForensicPackage({
      mediaPath: resolve(process.cwd(), args.media),
      manifestPath: resolve(process.cwd(), args.manifest),
      pubKeyPath: args.pubkey ? resolve(process.cwd(), args.pubkey) : undefined,
    });

    console.log("================================================================================");
    console.log("  FORENSIC EVIDENCE VERIFICATION CERTIFICATE");
    console.log("================================================================================");
    console.log(`Evidence ID:          ${res.manifest.evidence_id}`);
    console.log(`Camera ID:            ${res.manifest.camera_id}`);
    console.log(`Tenant ID:            ${res.manifest.tenant_id}`);
    console.log(`Time Range:           ${res.manifest.time_range?.start} -> ${res.manifest.time_range?.end}`);
    console.log(`Calculated Media SHA: ${res.mediaHash}`);
    console.log(`Manifest Media SHA:   ${res.manifestHash}`);
    console.log(`Byte Hash Match:      ${res.hashMatch ? "✓ MATCH (100% Bit-level Integrity)" : "✗ MISMATCH"}`);
    console.log(`Digital Signature:    ${res.signatureValid ? "✓ VALID & AUTHENTIC" : "✗ INVALID / UNVERIFIED"}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(`OVERALL STATUS:       ${res.verified ? "✅ ADMISSIBLE FORENSIC EVIDENCE" : "❌ VERIFICATION FAILED"}`);
    console.log("================================================================================");

    if (res.errors.length > 0) {
      console.error("\nVerification Errors:");
      res.errors.forEach((err) => console.error(`  - ${err}`));
    }

    process.exit(res.verified ? 0 : 1);
  } catch (err: any) {
    console.error(`Execution failed: ${err.message}`);
    process.exit(1);
  }
}
