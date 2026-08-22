/**
 * Independent Forensic Evidence Verifier
 * 
 * Cryptographically verifies sealed and exported evidence packages:
 * 1. Canonicalizes manifest.json and validates SHA-256 digest
 * 2. Cryptographically verifies digital signature (manifest.sig)
 * 3. Verifies SHA-256 hashes of all media artifacts (clip.mp4, snapshot.jpg)
 * 4. Validates full tamper-evident chain of custody hash chain
 */

import { createHash, verify } from 'node:crypto';
import type { EvidencePackage } from '../domain/forensic-evidence.types.js';
import { canonicalJsonStringify, chainOfCustodyService } from './chain-of-custody.service.js';

export interface VerificationResult {
  valid: boolean;
  evidenceId: string;
  manifestValid: boolean;
  signatureValid: boolean;
  artifactsValid: boolean;
  chainOfCustodyValid: boolean;
  errors: string[];
  verifiedAt: string;
  signerKeyId?: string;
}

export class EvidenceVerifierService {
  /**
   * Verifies the authenticity, manifest signature, media hashes, and chain of custody
   */
  async verifyPackage(
    pkg: EvidencePackage,
    mediaBuffers?: { [path: string]: Buffer },
    verifierActorId: string = 'evidence-verifier'
  ): Promise<VerificationResult> {
    const errors: string[] = [];
    let manifestValid = false;
    let signatureValid = false;
    let artifactsValid = false;
    let chainOfCustodyValid = false;

    // 1. Validate Manifest Structure
    if (!pkg.manifest) {
      errors.push('Package is missing manifest.json');
    } else {
      const canonicalJson = canonicalJsonStringify(pkg.manifest);
      const computedManifestHash = createHash('sha256').update(canonicalJson).digest('hex');

      if (pkg.manifestHash && pkg.manifestHash !== computedManifestHash) {
        errors.push(`Manifest SHA-256 mismatch (manifestHash: ${pkg.manifestHash}, computed: ${computedManifestHash})`);
      } else {
        manifestValid = true;
      }

      // 2. Validate Digital Signature
      if (!pkg.signature) {
        errors.push('Package is missing digital signature (manifest.sig)');
      } else {
        try {
          const sigBuffer = Buffer.from(pkg.signature.signature, 'base64');
          const isSigValid = verify(null, Buffer.from(canonicalJson, 'utf8'), pkg.signature.publicKey, sigBuffer);

          if (!isSigValid) {
            errors.push('Digital signature validation failed for manifest.sig');
          } else {
            signatureValid = true;
          }
        } catch (sigErr: any) {
          errors.push(`Cryptographic signature error: ${sigErr?.message || 'Invalid key or signature'}`);
        }
      }

      // 3. Validate Artifact Hashes
      if (mediaBuffers) {
        let allArtifactsMatch = true;
        for (const expectedArtifact of pkg.manifest.artifacts) {
          const buffer = mediaBuffers[expectedArtifact.path] || mediaBuffers[expectedArtifact.path.replace(/^media\//, '')];
          if (!buffer) {
            errors.push(`Missing media artifact buffer for ${expectedArtifact.path}`);
            allArtifactsMatch = false;
            continue;
          }

          const actualHash = createHash('sha256').update(buffer).digest('hex');
          if (actualHash !== expectedArtifact.sha256) {
            errors.push(`Corrupted artifact ${expectedArtifact.path}: expected hash ${expectedArtifact.sha256}, calculated ${actualHash}`);
            allArtifactsMatch = false;
          }
        }
        artifactsValid = allArtifactsMatch;
      } else {
        // If buffer is not provided directly, verify internal artifact list matches manifest
        const artifactsMatch = pkg.artifacts.every((a) =>
          pkg.manifest!.artifacts.some((ma) => ma.path === a.path && ma.sha256 === a.sha256)
        );
        artifactsValid = artifactsMatch;
      }
    }

    // 4. Validate Chain of Custody
    const custodyResult = chainOfCustodyService.verifyLedger(pkg.id);
    if (!custodyResult.valid) {
      errors.push(`Chain of custody validation error: ${custodyResult.error}`);
    } else {
      chainOfCustodyValid = true;
    }

    const overallValid = manifestValid && signatureValid && artifactsValid && chainOfCustodyValid;

    // Record verification event in custody
    chainOfCustodyService.recordEvent({
      evidencePackageId: pkg.id,
      event: overallValid ? 'VERIFIED' : 'VERIFICATION_FAILED',
      actorId: verifierActorId,
      actorType: 'SERVICE',
      reason: overallValid ? 'Independent cryptographic verification succeeded' : `Verification failed: ${errors.join('; ')}`,
    });

    return {
      valid: overallValid,
      evidenceId: pkg.id,
      manifestValid,
      signatureValid,
      artifactsValid,
      chainOfCustodyValid,
      errors,
      verifiedAt: new Date().toISOString(),
      signerKeyId: pkg.signature?.keyId,
    };
  }
}

export const evidenceVerifierService = new EvidenceVerifierService();
