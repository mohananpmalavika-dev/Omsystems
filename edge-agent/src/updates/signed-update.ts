import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { mkdir, open, readFile, rename, rmdir, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { EdgeUpdateRelease } from "../registration/gateway-client.js";

// A delta bundle contains only the application code. Native media runtimes stay
// in place from the original installer, so an OTA update must never grow into a
// second full installer download.
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const ACTIVE_MARKER = "active.json";
const PREVIOUS_MARKER = "previous.json";
const TRANSACTION_MARKER = "transaction.json";
const ACTIVATION_LOCK = ".activation.lock";

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

export interface EdgeUpdateTransaction {
  releaseId: string;
  version: string;
  state: "STAGED" | "ACTIVATING" | "ACTIVE" | "CONFIRMED" | "ROLLED_BACK" | "REJECTED";
  updatedAt: string;
  reason?: string;
}

export async function stageSignedUpdate(
  release: EdgeUpdateRelease,
  publicKeyPem: string,
  stagingRoot: string,
): Promise<StagedEdgeUpdate> {
  assertReleaseShape(release);
  if (!verifyManifest(release, publicKeyPem)) throw new Error("update_signature_invalid");
  const url = new URL(release.artifactUrl);
  if (!isSecureArtifactUrl(url)) {
    throw new Error("update_artifact_requires_https");
  }
  const targetDirectory = resolve(stagingRoot, safe(release.version));
  // A unique partial file means concurrent retries can never observe or
  // accidentally publish each other's incomplete download.
  const temporaryPath = join(targetDirectory, `artifact.${process.pid}.${randomUUID()}.part`);
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
    // The verified payload is published only through rename. This is atomic on
    // the local staging filesystem, so a reader sees either the old complete
    // payload or the new complete payload, never a partial download.
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
    await atomicWriteJson(join(targetDirectory, "ready.json"), { ...marker, release });
    await atomicWriteJson(join(resolve(stagingRoot), TRANSACTION_MARKER), transaction(marker, "STAGED"));
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
  currentRuntimeVersion?: string,
) {
  assertReleaseShape(release);
  if (currentRuntimeVersion && compareVersions(release.version, currentRuntimeVersion) <= 0) {
    throw new Error("update_downgrade_rejected");
  }
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
  await mkdir(root, { recursive: true });
  const lockPath = await acquireActivationLock(root);
  try {
    // Re-check after acquiring the lock: another command could have installed
    // a newer release while this command was waiting.
    const active = await readActiveMarker(root);
    if (active && compareVersions(active.version, release.version) > 0) {
      throw new Error("update_downgrade_rejected");
    }
    await atomicWriteJson(join(root, TRANSACTION_MARKER), transaction(staged, "ACTIVATING"));
    // Retain the last known-good pointer until the replacement proves it can
    // communicate with the control plane. A missing pointer means the stable
    // packaged runtime is the rollback target.
    if (active) await atomicWriteJson(join(root, PREVIOUS_MARKER), active);
    else await unlink(join(root, PREVIOUS_MARKER)).catch(() => undefined);
    const marker: ActiveEdgeUpdateMarker = {
      ...staged,
      release,
      activatedAt: new Date().toISOString(),
    };
    // This is the process replacement commit point. The supervisor reads one
    // small pointer file on startup; atomically replacing it gives all-or-
    // nothing activation and leaves the packaged runtime available to roll back.
    await atomicWriteJson(join(root, ACTIVE_MARKER), marker);
    await atomicWriteJson(join(root, TRANSACTION_MARKER), transaction(staged, "ACTIVE"));
    return marker;
  } finally {
    await rmdir(lockPath).catch(() => undefined);
  }
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
  const root = resolve(stagingRoot);
  const active = await readActiveMarker(root);
  await quarantineMarker(join(root, ACTIVE_MARKER), safe(reason));
  const previous = await readMarker(join(root, PREVIOUS_MARKER));
  if (previous) {
    // Restoring the pointer is atomic. On the supervisor's next restart it
    // loads the earlier signed patch; without one it falls back to the stable
    // packaged binary.
    await atomicWriteJson(join(root, ACTIVE_MARKER), previous);
    await unlink(join(root, PREVIOUS_MARKER)).catch(() => undefined);
    await atomicWriteJson(join(root, TRANSACTION_MARKER), transaction(previous, "ROLLED_BACK", safe(reason)));
    return { rolledBack: true, version: previous.version };
  }
  if (active) await atomicWriteJson(join(root, TRANSACTION_MARKER), transaction(active, "REJECTED", safe(reason)));
  return { rolledBack: true, version: undefined };
}

/** Records the first successful post-upgrade control-plane health check. */
export async function confirmActiveSignedUpdate(stagingRoot: string, version: string) {
  const root = resolve(stagingRoot);
  const active = await readActiveMarker(root);
  if (!active || active.version !== version) return false;
  await atomicWriteJson(join(root, TRANSACTION_MARKER), transaction(active, "CONFIRMED"));
  await unlink(join(root, PREVIOUS_MARKER)).catch(() => undefined);
  return true;
}

export function verifyManifest(release: EdgeUpdateRelease, publicKeyPem: string) {
  try {
    if (!hasVerifiableManifestShape(release)) return false;
    const signature = decodeEd25519Signature(release.signature);
    const key = createPublicKey(publicKeyPem.replaceAll("\\n", "\n"));
    if (key.asymmetricKeyType !== "ed25519") return false;
    const canonical = Buffer.from(JSON.stringify({
      artifactUrl: release.artifactUrl,
      notes: release.notes,
      sha256: release.sha256.toLowerCase(),
      version: release.version,
    }), "utf8");
    return verify(null, canonical, key, signature);
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

function assertReleaseShape(release: EdgeUpdateRelease) {
  if (!release || typeof release.id !== "string" || !release.id ||
      !hasVerifiableManifestShape(release)) {
    throw new Error("update_manifest_invalid");
  }
}

function hasVerifiableManifestShape(release: unknown): release is EdgeUpdateRelease {
  if (!release || typeof release !== "object") return false;
  const value = release as Partial<EdgeUpdateRelease>;
  if (!isVersion(value.version) || !/^[a-f0-9]{64}$/i.test(value.sha256 ?? "") ||
      typeof value.signature !== "string" || typeof value.notes !== "string" || value.notes.length > 5_000 ||
      typeof value.artifactUrl !== "string" || value.artifactUrl.length > 2_048) return false;
  try {
    new URL(value.artifactUrl);
    return true;
  } catch {
    return false;
  }
}

function decodeEd25519Signature(signature: string) {
  // Buffer accepts malformed base64url input; require the exact unpadded
  // encoding and Ed25519's fixed 64-byte signature length instead.
  if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) throw new Error("update_signature_encoding_invalid");
  const decoded = Buffer.from(signature, "base64url");
  if (decoded.length !== 64 || decoded.toString("base64url") !== signature) {
    throw new Error("update_signature_encoding_invalid");
  }
  return decoded;
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function transaction(update: Pick<StagedEdgeUpdate, "releaseId" | "version">, state: EdgeUpdateTransaction["state"], reason?: string): EdgeUpdateTransaction {
  return { releaseId: update.releaseId, version: update.version, state, updatedAt: new Date().toISOString(), ...(reason ? { reason } : {}) };
}

async function atomicWriteJson(path: string, value: unknown) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const file = await open(temporaryPath, "w", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function acquireActivationLock(root: string) {
  const lockPath = join(root, ACTIVATION_LOCK);
  try {
    await mkdir(lockPath);
    return lockPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("update_activation_in_progress");
    throw error;
  }
}

async function readActiveMarker(root: string): Promise<ActiveEdgeUpdateMarker | undefined> {
  return readMarker(join(root, ACTIVE_MARKER));
}

async function readMarker(path: string): Promise<ActiveEdgeUpdateMarker | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? parsed as ActiveEdgeUpdateMarker : undefined;
  } catch {
    return undefined;
  }
}

function isSecureArtifactUrl(url: URL) {
  return url.protocol === "https:" && !url.username && !url.password;
}
