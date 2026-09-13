import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const manifestPath = resolve(process.env.SECURE_FACE_MODEL_MANIFEST || "./models/secure-face/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest?.version !== 1 || !Array.isArray(manifest.artifacts)) throw new Error("invalid secure-face manifest");
for (const artifact of manifest.artifacts) {
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? "")) throw new Error(`invalid checksum for ${artifact.id}`);
  const file = resolve(dirname(manifestPath), artifact.file);
  const metadata = await stat(file).catch(() => null);
  if (!metadata?.isFile() || metadata.size < 1024) throw new Error(`missing model artifact: ${artifact.id}`);
  const digest = await sha256(file);
  if (digest !== artifact.sha256.toLowerCase()) throw new Error(`checksum mismatch: ${artifact.id}`);
  console.log(`OK ${artifact.id} ${artifact.modelName}@${artifact.modelVersion}`);
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
