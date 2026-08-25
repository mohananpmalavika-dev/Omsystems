import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

interface Artifact {
  id: string;
  path: string;
  pathEnvironment?: string;
  sourceUrl?: string;
  sourceUrlEnvironment?: string;
  sha256?: string;
  sha256Environment?: string;
  required?: boolean;
}

if (process.env.ANALYTICS_MODEL_LICENSES_ACCEPTED !== "true") {
  throw new Error("Set ANALYTICS_MODEL_LICENSES_ACCEPTED=true after reviewing the licenses for your selected model artifacts");
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(process.env.MODEL_MANIFEST_PATH || path.join(scriptDirectory, "..", "models", "manifest.json"));
const modelsDirectory = path.resolve(process.env.MODELS_DIR || path.join(scriptDirectory, "..", "models"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { models: Artifact[] };
const requestedIds = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const selected = manifest.models.filter((model) => requestedIds.length > 0
  ? requestedIds.includes(model.id)
  : model.required);

if (requestedIds.some((id) => !manifest.models.some((model) => model.id === id))) {
  throw new Error(`Unknown model id(s): ${requestedIds.filter((id) => !manifest.models.some((model) => model.id === id)).join(", ")}`);
}

const failures: string[] = [];
for (const model of selected) {
  try {
    await provision(model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${model.id}: ${message}`);
    console.error(`FAIL ${model.id}: ${message}`);
  }
}

if (failures.length > 0) {
  console.error(`Provisioning failed for ${failures.length}/${selected.length} selected model(s)`);
  process.exitCode = 1;
} else {
  console.log(`Provisioned and checksum-verified ${selected.length} model(s)`);
}

async function provision(model: Artifact) {
  const configuredPath = model.pathEnvironment ? process.env[model.pathEnvironment]?.trim() : undefined;
  const destination = path.resolve(configuredPath || path.join(modelsDirectory, model.path));
  const sourceEnvironment = model.sourceUrlEnvironment;
  const sourceUrl = (sourceEnvironment ? process.env[sourceEnvironment]?.trim() : undefined) || model.sourceUrl;
  const expectedHash = (model.sha256Environment ? process.env[model.sha256Environment]?.trim() : model.sha256)?.toLowerCase();
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error(`set ${model.sha256Environment ?? "a manifest sha256"} to the audited artifact SHA-256`);
  }
  if (await isVerified(destination, expectedHash)) {
    console.log(`OK   ${model.id}: existing artifact verified`);
    return;
  }
  const existing = await stat(destination).catch(() => null);
  if (existing) throw new Error(`existing artifact failed validation; move or remove it explicitly before provisioning: ${destination}`);
  if (!sourceUrl) throw new Error(`set ${sourceEnvironment ?? "a source URL"} to an approved ONNX artifact URL`);
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:") throw new Error("model downloads require HTTPS");

  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}`;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`download returned HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary, { flags: "wx" }));
    const actualHash = await sha256(temporary);
    if (actualHash !== expectedHash) throw new Error(`checksum mismatch: expected ${expectedHash}; received ${actualHash}`);
    await rename(temporary, destination);
    console.log(`OK   ${model.id}: downloaded and verified ${destination}`);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function isVerified(filePath: string, expectedHash: string) {
  const metadata = await stat(filePath).catch(() => null);
  return Boolean(metadata?.isFile() && metadata.size > 0 && await sha256(filePath) === expectedHash);
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
