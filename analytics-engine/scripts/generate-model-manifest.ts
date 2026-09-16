#!/usr/bin/env tsx
/**
 * Model Manifest Generator
 * 
 * Generates SHA-256 checksums for all ONNX models in the models directory.
 * Run this script during the build/deployment pipeline.
 * 
 * Usage:
 *   npm run generate-model-manifest
 *   tsx scripts/generate-model-manifest.ts
 * 
 * Output:
 *   Creates/updates analytics-engine/models/manifest-verified.json
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { glob } from "glob";
import { ModelIntegrityVerifier } from "../src/model-integrity-verifier.js";

const MODELS_DIR = resolve(__dirname, "../models");
const MANIFEST_OUTPUT = resolve(MODELS_DIR, "manifest-verified.json");
const VERSION = process.env.MODEL_MANIFEST_VERSION || "1.0.0";

async function generateManifest() {
  console.log("[ManifestGenerator] Starting model manifest generation...");
  console.log(`[ManifestGenerator] Models directory: ${MODELS_DIR}`);
  
  try {
    // Find all ONNX models
    const modelFiles = await glob("**/*.onnx", {
      cwd: MODELS_DIR,
      absolute: false,
    });

    if (modelFiles.length === 0) {
      console.warn("[ManifestGenerator] No ONNX models found in models directory");
      return;
    }

    console.log(`[ManifestGenerator] Found ${modelFiles.length} model files`);

    // Generate absolute paths
    const absolutePaths = modelFiles.map((file) => resolve(MODELS_DIR, file));

    // Create verifier and generate manifest
    const verifier = new ModelIntegrityVerifier();
    const manifest = await verifier.generateManifest(absolutePaths, {
      version: VERSION,
      purpose: "NBFC Analytics ONNX Models",
    });

    // Convert absolute paths back to relative paths for portability
    const portableManifest = {
      ...manifest,
      models: manifest.models.map((entry) => ({
        ...entry,
        modelPath: entry.modelPath.replace(MODELS_DIR + "/", ""),
      })),
    };

    // Write manifest
    await writeFile(
      MANIFEST_OUTPUT,
      JSON.stringify(portableManifest, null, 2),
      "utf-8"
    );

    console.log(`[ManifestGenerator] Manifest generated successfully`);
    console.log(`[ManifestGenerator] Output: ${MANIFEST_OUTPUT}`);
    console.log(`[ManifestGenerator] Total models: ${manifest.models.length}`);
    
    // Print summary
    console.log("\n[ManifestGenerator] Model Summary:");
    for (const model of portableManifest.models) {
      console.log(`  - ${model.modelPath}`);
      console.log(`    SHA-256: ${model.sha256}`);
    }

    console.log("\n[ManifestGenerator] ✓ Complete");
  } catch (error) {
    console.error(
      `[ManifestGenerator] Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  generateManifest().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { generateManifest };
