import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
export async function stageSignedUpdate(release, publicKeyPem, stagingRoot) {
    if (!verifyManifest(release, publicKeyPem))
        throw new Error("update_signature_invalid");
    const url = new URL(release.artifactUrl);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
        throw new Error("update_artifact_requires_https");
    }
    const targetDirectory = join(stagingRoot, safe(release.version));
    const temporaryPath = join(targetDirectory, `artifact.${process.pid}.part`);
    const artifactPath = join(targetDirectory, "edge-agent.bundle");
    await mkdir(targetDirectory, { recursive: true });
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
        if (!response.ok || !response.body)
            throw new Error(`update_download_failed_${response.status}`);
        const file = await open(temporaryPath, "w", 0o600);
        const hash = createHash("sha256");
        let bytes = 0;
        try {
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                bytes += value.byteLength;
                if (bytes > MAX_ARTIFACT_BYTES)
                    throw new Error("update_artifact_too_large");
                hash.update(value);
                await file.write(value);
            }
        }
        finally {
            await file.close();
        }
        const digest = hash.digest("hex");
        if (digest !== release.sha256.toLowerCase())
            throw new Error("update_checksum_mismatch");
        await rename(temporaryPath, artifactPath);
        const marker = {
            releaseId: release.id, version: release.version, artifactPath,
            sha256: digest, signature: release.signature, stagedAt: new Date().toISOString(),
        };
        await writeFile(join(targetDirectory, "ready.json"), JSON.stringify(marker, null, 2), { encoding: "utf8", mode: 0o600 });
        return { ...marker, bytes };
    }
    catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
    }
}
export function verifyManifest(release, publicKeyPem) {
    try {
        const key = createPublicKey(publicKeyPem.replaceAll("\\n", "\n"));
        if (key.asymmetricKeyType !== "ed25519")
            return false;
        const canonical = Buffer.from(JSON.stringify({
            artifactUrl: release.artifactUrl,
            notes: release.notes,
            sha256: release.sha256.toLowerCase(),
            version: release.version,
        }), "utf8");
        return verify(null, canonical, key, Buffer.from(release.signature, "base64url"));
    }
    catch {
        return false;
    }
}
function safe(value) {
    return value.replace(/[^0-9A-Za-z._-]/g, "-");
}
