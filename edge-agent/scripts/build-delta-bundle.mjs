#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const edgeRoot = join(scriptDir, "..");
const packageJson = JSON.parse(await readFile(join(edgeRoot, "package.json"), "utf8"));
const version = packageJson.version || "0.1.0";

const outputDir = join(edgeRoot, "release", "updates", version);
await mkdir(outputDir, { recursive: true });

const bundlePath = join(outputDir, "edge-agent.bundle");

console.log(`[DeltaBundle] Packaging Edge Agent delta bundle v${version}...`);

// 1. Bundle with esbuild
await build({
  entryPoints: [join(edgeRoot, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: bundlePath,
  minify: true,
  sourcemap: false,
  external: ["pg-native", "fsevents"],
});

const stats = await stat(bundlePath);
const sizeBytes = stats.size;
const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

// 2. Compute SHA-256
const bundleData = await readFile(bundlePath);
const hash = createHash("sha256").update(bundleData).digest("hex");

// 3. Create Manifest
const manifest = {
  version,
  artifactName: "edge-agent.bundle",
  sha256: hash,
  sizeBytes,
  type: "delta_bundle",
  releasedAt: new Date().toISOString(),
  notes: `Sentinel Grid Edge Agent Delta Update v${version}`,
};

// 4. Sign if private key is available
const signingKeyPem = process.env.EDGE_UPDATE_SIGNING_PRIVATE_KEY;
if (signingKeyPem) {
  try {
    const key = createPrivateKey(signingKeyPem.replaceAll("\\n", "\n"));
    const canonical = Buffer.from(
      JSON.stringify({
        artifactUrl: manifest.artifactUrl || `https://sentinel-grid.internal/updates/${version}/edge-agent.bundle`,
        notes: manifest.notes,
        sha256: hash.toLowerCase(),
        version,
      }),
      "utf8"
    );
    const signature = sign(null, canonical, key).toString("base64url");
    manifest.signature = signature;
    console.log(`[DeltaBundle] Bundle cryptographically signed (Ed25519).`);
  } catch (err) {
    console.warn(`[DeltaBundle] Note: Could not sign manifest:`, err.message);
  }
}

await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log(`[DeltaBundle] Successfully created lightweight delta bundle:`);
console.log(`  File: ${bundlePath}`);
console.log(`  Size: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes)`);
console.log(`  SHA-256: ${hash}`);
console.log(`  Manifest: ${join(outputDir, "manifest.json")}`);
