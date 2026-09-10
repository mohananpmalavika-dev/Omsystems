import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { EdgeUpdateRelease } from "../registration/gateway-client.js";

// A delta bundle contains only the application code. Native media runtimes stay
// in place from the original installer, so an OTA update must never grow into a
// second full installer download.
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const ACTIVE_MARKER = "active.json";

export interface StagedEdgeUpdate {
  releaseId: string;
  version: string;
  artifactPath: string;
  sha256: string;
  signature: string;
  stagedAt: string;
  bytes: number;
}

interface ActiveEdgeUpdateMarker extends StagedEdgeUpdate {
  release: EdgeUpdateRelease;
  activatedAt: string;
}

export async function stageSignedUpdate(
  release: EdgeUpdateRelease,
  publicKeyPem: string,
  stagingRoot: string,
): Promise<StagedEdgeUpdate> {
  if (!verifyManifest(release, publicKeyPem)) throw new Error("update_signature_invalid");
  const url = new URL(release.artifactUrl);
  if (!isSecureArtifactUrl(url)) {
    throw new Error("update_artifact_requires_https");
  }
  const targetDirectory = resolve(stagingRoot, safe(release.version));
  const temporaryPath = join(targetDirectory, `artifact.${process.pid}.part`);
  const artifactPath = join(targetDirectory, "edge-agent.bundle");
  await mkdir(targetDirectory, { recursive: true });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`update_download_failed_${response.status}`);
    // fetch follows redirects by default. Re-check the final URL so a signed
    // HTTPS manifest cannot be used to downgrade the actual download to HTTP.
    if (!isSecureArtifactUrl(new URL(response.url || url.href))) {
      throw new Error("update_artifact_requires_https");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ARTIFACT_BYTES) {
      throw new Error("update_artifact_too_large");
    }
    const file = await open(temporaryPath, "w", 0o600);
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ARTIFACT_BYTES) throw new Error("update_artifact_too_large");
        hash.update(value);
        await file.write(value);
      }
    } finally {
      await file.close();
    }
    const digest = hash.digest("hex");
    if (digest !== release.sha256.toLowerCase()) throw new Error("update_checksum_mismatch");
    await unlink(artifactPath).catch(() => undefined);
    await rename(temporaryPath, artifactPath);
    const marker: StagedEdgeUpdate = {
      releaseId: release.id,
      version: release.version,
      artifactPath,
      sha256: digest,
      signature: release.signature,
      stagedAt: new Date().toISOString(),
      bytes,
    };
    await writeFile(join(targetDirectory, "ready.json"), JSON.stringify({ ...marker, release }, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    return marker;
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

/** Marks a verified bundle as the code payload to run on the next supervised restart. */
export async function activateSignedUpdate(
  release: EdgeUpdateRelease,
  staged: StagedEdgeUpdate,
  stagingRoot: string,
) {
  if (release.id !== staged.releaseId || release.version !== staged.version ||
      release.sha256.toLowerCase() !== staged.sha256.toLowerCase()) {
    throw new Error("staged_update_manifest_mismatch");
  }
  const root = resolve(stagingRoot);
  const artifactPath = resolveArtifactPath(root, staged.artifactPath);
  const expectedPath = join(root, safe(release.version), "edge-agent.bundle");
  if (!artifactPath || artifactPath !== expectedPath) {
    throw new Error("staged_update_path_invalid");
  }
  try {
    const metadata = await stat(artifactPath);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_ARTIFACT_BYTES) {
      throw new Error("invalid_size");
    }
    const digest = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
    if (digest !== release.sha256.toLowerCase()) throw new Error("invalid_hash");
  } catch {
    throw new Error("staged_update_artifact_invalid");
  }
  const marker: ActiveEdgeUpdateMarker = {
    ...staged,
    release,
    activatedAt: new Date().toISOString(),
  };
  await mkdir(root, { recursive: true });
  await writeFile(join(root, ACTIVE_MARKER), JSON.stringify(marker, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return marker;
}

/**
 * Resolves the active application-only patch after re-checking its signature,
 * path and SHA-256. The original packaged EXE remains the rollback runtime.
 */
export async function resolveActiveSignedUpdate(
  stagingRoot: string,
  publicKeyPem: string,
  currentVersion: string,
) {
  const root = resolve(stagingRoot);
  const markerPath = join(root, ACTIVE_MARKER);
  let marker: ActiveEdgeUpdateMarker;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8")) as ActiveEdgeUpdateMarker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    await quarantineMarker(markerPath, "invalid");
    return undefined;
  }

  if (!marker || typeof marker !== "object" || !marker.release ||
      marker.version !== marker.release.version || marker.releaseId !== marker.release.id ||
      marker.sha256.toLowerCase() !== marker.release.sha256.toLowerCase() ||
      !verifyManifest(marker.release, publicKeyPem)) {
    await quarantineMarker(markerPath, "untrusted");
    return undefined;
  }
  // A repaired/full installer at the same or a newer version supersedes an old
  // application patch and continues to use its bundled code.
  if (compareVersions(marker.version, currentVersion) <= 0) {
    await quarantineMarker(markerPath, "superseded");
    return undefined;
  }

  const artifactPath = resolveArtifactPath(root, marker.artifactPath);
  const expectedPath = join(root, safe(marker.version), "edge-agent.bundle");
  if (!artifactPath || artifactPath !== expectedPath) {
    await quarantineMarker(markerPath, "path");
    return undefined;
  }
  try {
    const metadata = await stat(artifactPath);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_ARTIFACT_BYTES) throw new Error("invalid_size");
    const digest = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
    if (digest !== marker.sha256.toLowerCase()) throw new Error("invalid_hash");
  } catch {
    await quarantineMarker(markerPath, "artifact");
    return undefined;
  }
  return { version: marker.version, artifactPath, releaseId: marker.releaseId };
}

export async function rejectActiveSignedUpdate(stagingRoot: string, reason = "failed") {
  await quarantineMarker(join(resolve(stagingRoot), ACTIVE_MARKER), safe(reason));
}

export function verifyManifest(release: EdgeUpdateRelease, publicKeyPem: string) {
  try {
    const key = createPublicKey(publicKeyPem.replaceAll("\\n", "\n"));
    if (key.asymmetricKeyType !== "ed25519") return false;
    const canonical = Buffer.from(JSON.stringify({
      artifactUrl: release.artifactUrl,
      notes: release.notes,
      sha256: release.sha256.toLowerCase(),
      version: release.version,
    }), "utf8");
    return verify(null, canonical, key, Buffer.from(release.signature, "base64url"));
  } catch {
    return false;
  }
}

function resolveArtifactPath(root: string, value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const candidate = resolve(isAbsolute(value) ? value : join(root, value));
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) return undefined;
  return candidate;
}

async function quarantineMarker(markerPath: string, reason: string) {
  const suffix = new Date().toISOString().replace(/[^0-9]/g, "");
  await rename(markerPath, `${markerPath}.${reason}.${suffix}`).catch(() => undefined);
}

function compareVersions(left: string, right: string) {
  const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return left.localeCompare(right);
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference) return difference;
  }
  if (!a[4] || !b[4]) return a[4] ? -1 : b[4] ? 1 : 0;
  const leftIds = a[4].split(".");
  const rightIds = b[4].split(".");
  for (let index = 0; index < Math.max(leftIds.length, rightIds.length); index += 1) {
    const l = leftIds[index];
    const r = rightIds[index];
    if (l === undefined || r === undefined) return l === undefined ? -1 : 1;
    if (l === r) continue;
    const lNumber = /^\d+$/.test(l);
    const rNumber = /^\d+$/.test(r);
    if (lNumber && rNumber) return Number(l) - Number(r);
    if (lNumber) return -1;
    if (rNumber) return 1;
    return l.localeCompare(r);
  }
  return 0;
}

function safe(value: string) {
  return value.replace(/[^0-9A-Za-z._-]/g, "-");
}

function isSecureArtifactUrl(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password;
}
