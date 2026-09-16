import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Model Integrity Verifier
 * 
 * Provides SHA-256 checksum verification for ONNX models to ensure:
 * - Models have not been tampered with
 * - Models match the expected production version
 * - Deployment integrity across distributed edge devices
 * 
 * Usage:
 * ```typescript
 * const verifier = new ModelIntegrityVerifier();
 * await verifier.verifyModel('/path/to/model.onnx', 'expected-sha256-hash');
 * ```
 */

export interface ModelManifestEntry {
  modelPath: string;
  sha256: string;
  version: string;
  purpose: string;
  lastVerified?: string;
}

export interface ModelManifest {
  version: string;
  generatedAt: string;
  models: ModelManifestEntry[];
}

export interface VerificationResult {
  modelPath: string;
  verified: boolean;
  actualSha256?: string;
  expectedSha256: string;
  error?: string;
  timestamp: string;
}

export class ModelIntegrityVerifier {
  private manifestCache: Map<string, ModelManifest> = new Map();
  private verificationHistory: VerificationResult[] = [];

  /**
   * Compute SHA-256 hash of a file
   */
  async computeSha256(filePath: string): Promise<string> {
    try {
      const data = await readFile(filePath);
      const hash = createHash("sha256");
      hash.update(data);
      return hash.digest("hex");
    } catch (error) {
      throw new Error(
        `Failed to compute SHA-256 for ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Verify a single model file against expected hash
   */
  async verifyModel(
    modelPath: string,
    expectedSha256: string
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      modelPath,
      verified: false,
      expectedSha256,
      timestamp: new Date().toISOString(),
    };

    try {
      const actualSha256 = await this.computeSha256(modelPath);
      result.actualSha256 = actualSha256;
      result.verified = actualSha256 === expectedSha256;

      if (!result.verified) {
        result.error = `SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    this.verificationHistory.push(result);
    return result;
  }

  /**
   * Load model manifest from JSON file
   */
  async loadManifest(manifestPath: string): Promise<ModelManifest> {
    const cached = this.manifestCache.get(manifestPath);
    if (cached) return cached;

    try {
      const data = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(data) as ModelManifest;
      this.manifestCache.set(manifestPath, manifest);
      return manifest;
    } catch (error) {
      throw new Error(
        `Failed to load manifest from ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Verify all models listed in a manifest
   */
  async verifyManifest(
    manifestPath: string,
    modelsBasePath?: string
  ): Promise<{
    totalModels: number;
    verified: number;
    failed: number;
    results: VerificationResult[];
  }> {
    const manifest = await this.loadManifest(manifestPath);
    const basePath = modelsBasePath || resolve(manifestPath, "..");

    const results = await Promise.all(
      manifest.models.map(async (entry) => {
        const fullPath = resolve(basePath, entry.modelPath);
        return this.verifyModel(fullPath, entry.sha256);
      })
    );

    const verified = results.filter((r) => r.verified).length;
    const failed = results.length - verified;

    return {
      totalModels: results.length,
      verified,
      failed,
      results,
    };
  }

  /**
   * Generate a model manifest from a directory
   * This should be run during the build/deployment pipeline
   */
  async generateManifest(
    modelPaths: string[],
    metadata: { version: string; purpose?: string }
  ): Promise<ModelManifest> {
    const models: ModelManifestEntry[] = await Promise.all(
      modelPaths.map(async (modelPath) => {
        const sha256 = await this.computeSha256(modelPath);
        return {
          modelPath,
          sha256,
          version: metadata.version,
          purpose: metadata.purpose || "ONNX model for analytics",
        };
      })
    );

    const manifest: ModelManifest = {
      version: metadata.version,
      generatedAt: new Date().toISOString(),
      models,
    };

    return manifest;
  }

  /**
   * Get verification history
   */
  getVerificationHistory(): VerificationResult[] {
    return [...this.verificationHistory];
  }

  /**
   * Get last verification result for a model
   */
  getLastVerification(modelPath: string): VerificationResult | undefined {
    return this.verificationHistory
      .filter((r) => r.modelPath === modelPath)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }

  /**
   * Clear verification history
   */
  clearHistory(): void {
    this.verificationHistory = [];
  }

  /**
   * Verify model on load (decorator pattern)
   * Use this to wrap model loading functions
   */
  async verifyOnLoad<T>(
    modelPath: string,
    expectedSha256: string,
    loadFunction: () => Promise<T> | T
  ): Promise<T> {
    const verification = await this.verifyModel(modelPath, expectedSha256);

    if (!verification.verified) {
      throw new Error(
        `Model integrity verification failed for ${modelPath}: ${verification.error}`
      );
    }

    return await loadFunction();
  }
}

/**
 * Global singleton instance
 */
export const modelIntegrityVerifier = new ModelIntegrityVerifier();

/**
 * Runtime verification hook for production deployments
 * Call this during application startup
 */
export async function verifyProductionModels(
  manifestPath: string
): Promise<boolean> {
  console.log("[ModelIntegrity] Starting production model verification...");
  
  try {
    const result = await modelIntegrityVerifier.verifyManifest(manifestPath);

    console.log(
      `[ModelIntegrity] Verification complete: ${result.verified}/${result.totalModels} models verified`
    );

    if (result.failed > 0) {
      console.error(
        `[ModelIntegrity] CRITICAL: ${result.failed} model(s) failed verification`
      );
      
      for (const failure of result.results.filter((r) => !r.verified)) {
        console.error(
          `[ModelIntegrity] Failed: ${failure.modelPath} - ${failure.error}`
        );
      }

      // In production, you may want to halt startup if models are compromised
      if (process.env.NODE_ENV === "production" && process.env.STRICT_MODEL_VERIFICATION === "true") {
        throw new Error("Model integrity verification failed - refusing to start");
      }
    }

    return result.failed === 0;
  } catch (error) {
    console.error(
      `[ModelIntegrity] Verification error: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Example usage in model loading:
 * 
 * ```typescript
 * import { modelIntegrityVerifier } from './model-integrity-verifier';
 * 
 * async function loadDetectionModel() {
 *   const modelPath = '/models/detection/yolox_tiny.onnx';
 *   const expectedHash = 'abc123...'; // From manifest
 *   
 *   return await modelIntegrityVerifier.verifyOnLoad(
 *     modelPath,
 *     expectedHash,
 *     async () => {
 *       // Your actual model loading logic
 *       return await ort.InferenceSession.create(modelPath);
 *     }
 *   );
 * }
 * ```
 */
